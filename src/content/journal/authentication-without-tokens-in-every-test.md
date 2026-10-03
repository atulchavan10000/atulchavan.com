---
title: "Authentication Without Tokens in Every Test"
description: "How I separated token acquisition from request authentication, modeled named profiles, sourced secrets, and made refresh safe for parallel tests."
category: "Authentication"
date: "2026-10-03"
series: "framework-design"
part: 8
diagram:
  title: "From an API operation to an authenticated request"
  steps:
    - title: "API operation"
      detail: "Choose an operation profile or inherit the service default"
    - title: "AuthenticationRuntime"
      detail: "Resolve request, operation, and service precedence"
    - title: "RequestAuthenticator"
      detail: "Apply bearer, API key, or every member of a composite"
    - title: "Token provider"
      detail: "Reuse, refresh, or acquire an opaque token safely"
    - title: "Logging and transport"
      detail: "Redact sensitive values, then send the final request"
  caption: "Profile selection, request mutation, and token acquisition are separate responsibilities with separate lifecycles."
sources:
  - "src/main/java/framework/authentication"
  - "src/main/java/framework/config/AuthenticationConfig.java"
  - "src/main/java/framework/config/ConfigLoader.java"
  - "src/main/java/authentication/AuthenticationRuntimeFactory.java"
  - "src/test/resources/config/config.yaml"
---

Passing a token into every protected API method makes authentication visible, but visibility is not the same as good control. My first authenticated order call looked roughly like this:

```java
String token = auth.login(username, password).body().accessToken();
orders.create(orderRequest, token);
```

That code forces an ordinary checkout test to know how the application obtains credentials, where tokens come from, and when they expire. The same setup spreads across every test class, while refresh and parallel execution remain unsolved.

I wanted ordinary tests to call `orders.create(orderRequest)`. I also needed negative tests to send no credentials, authentication tests to choose a different mechanism, and services to support more than one policy. Making auth invisible could not mean making it uncontrollable.

## Three responsibilities that initially looked like one

I separated authentication into three questions:

1. Which authentication profile applies to this operation?
2. How does that profile modify the outgoing HTTP request?
3. If it needs a bearer token, how is that token obtained and kept usable?

An OAuth 2.0 client-credentials grant answers the third question. It obtains a token. Bearer authentication answers the second question by attaching that token to an `Authorization` header. JWT describes a possible token format; it is not another login flow.

This distinction also accommodates the application's existing username/password endpoint. Both the custom login and OAuth client credentials can feed the same bearer authenticator, even though their acquisition and renewal rules differ.

API keys fit differently. They are direct request credentials, normally attached to a configured header or query parameter. They do not need to pretend to be token providers.

## Named profiles instead of choosing from a list

The consumer-owned YAML defines token providers and request profiles separately:

```yaml
authentication:
  tokenProviders:
    checkout-user:
      type: password-login
      service: auth-service
      username: user1
      passwordCredential: checkout-user-password
      loginPath: /api/v1/auth/login
      refreshPath: /api/v1/auth/refresh

  profiles:
    user-jwt:
      type: bearer
      tokenProvider: checkout-user
    test-api-key:
      type: api-key
      credential: test-api-key
      placement: header
      name: X-API-Key
    user-jwt-and-api-key:
      type: composite
      members: [user-jwt, test-api-key]
```

A composite means every member is required. It is not a list of alternatives and it does not try the next mechanism after a 401. Silent fallback would make a request's security behavior depend on failure responses and could hide a configuration defect.

Profile selection is deterministic. A request-level override has the highest priority, followed by an API operation profile, then a service default, then no authentication. The API object owns stable operation knowledge. For example, methods for four test-support endpoints select JWT bearer, OAuth, API key, or composite profiles internally.

The request override has three states:

- `INHERIT` allows the operation or service default.
- `DISABLED` deliberately sends no authentication.
- `PROFILE(name)` selects a named profile.

The first two cannot be represented by one nullable string. A missing override and an instruction to suppress defaults have different meanings. That difference is what lets a negative test verify a 401 without creating a separate unauthenticated client.

## Secrets are references until runtime construction

The YAML contains `checkout-user-password`, not the password. The first `CredentialSource` implementation maps that logical name to `TAF_SECRET_CHECKOUT_USER_PASSWORD`.

I intentionally do not accept secrets from YAML, TestNG XML, ordinary Jenkins parameters, Java system properties, or documentation. Local runs and Jenkins Credentials Binding can expose the required environment variables. The configuration snapshot keeps references and non-secret settings such as usernames, client IDs, scopes, endpoint paths, and header names.

Provider construction resolves the secret it needs. A missing value fails suite setup with the logical reference and expected variable name, never the secret value.

The small `CredentialSource` interface is also the boundary for cloud integration. A future Vault, AWS Secrets Manager, Azure Key Vault, or internal platform adapter can resolve the same references without changing profiles or token providers.

## Token state belongs to providers, not tests

The TestNG listener creates one authentication runtime per suite. Each named token-provider configuration creates one provider instance and one cache. This scope lets parallel tests reuse a valid token while keeping different named users and clients isolated.

`TestContext` still carries per-test correlation state. It does not store tokens. A token is provider infrastructure state whose useful lifetime can span many test invocations.

The cache stores the token grant and an early refresh instant. It refreshes shortly before expiry rather than waiting for the exact boundary. The safety margin is bounded so a short-lived token does not become immediately unusable.

Parallel expiry needs more than a concurrent map. If ten threads all observe an expired token and all call the identity service, the cache has failed operationally. The provider uses a lock and checks the cache again after acquiring it:

```java
CachedToken current = cached;
if (usable(current)) return current.grant.accessToken();

refreshLock.lock();
try {
    current = cached;
    if (usable(current)) return current.grant.accessToken();
    TokenGrant grant = refreshOrAcquire(current, context);
    cached = cache(grant);
    return grant.accessToken();
} finally {
    refreshLock.unlock();
}
```

This gives one acquisition or refresh in flight for that named provider. Other providers have independent locks and caches.

The custom password flow retains its refresh token and calls the refresh endpoint. OAuth client credentials obtains a new access token because that grant has no refresh token. A static-token provider returns the configured token unchanged. The framework treats every access token as opaque and does not decode JWT claims to make authorization decisions.

## Authentication runs before logging

`AuthenticationInterceptor` modifies the prepared request before the logging interceptor sees it. Logs can therefore show the actual outgoing headers and query parameters, while the formatter redacts names such as `Authorization`, API-key headers, passwords, and client secrets.

Explicit credential headers are preserved. This is useful for an invalid-token test:

```java
RequestOptions options = RequestOptions.builder()
        .header("Authorization", "Bearer invalid.jwt.token")
        .build();
```

The normal bearer authenticator sees the existing header and does not replace it with a valid token. A missing-authentication test uses `disableAuthentication()`, which prevents the service default from being applied.

## Why I did not refresh on every 401

A 401 does not always mean an expired token. It can expose a wrong audience, invalid signature, revoked access, broken server configuration, or an authorization defect. Automatically refreshing and replaying can hide that evidence.

Replay also crosses into retry policy. A second POST may repeat a side effect unless the request is safely repeatable or protected by idempotency. For the first implementation, providers refresh based on known token lifetime. The framework does not react to a 401, switch schemes, or replay the request.

If 401-triggered recovery becomes necessary, it will need an explicit policy for invalidation, single retry limits, repeatable bodies, idempotency, logging, and the distinction between authentication failure and authorization failure.

## The resulting test surface

The common checkout flow now reads like application behavior:

```java
OrderResponse order = orders.create(request).body();
PaymentResponse payment = payments.pay(paymentRequest, idempotencyKey).body();
OrderResponse confirmed = orders.get(order.id()).body();
```

A test that creates a new user dynamically is a useful exception. That identity cannot be declared as a stable suite provider before the suite starts, so the test can authenticate it and use the explicit request options path. The exception stays visible instead of making the global registry mutable.

The main result is not fewer lines around a login call. It is a set of boundaries: API operations select stable policy, request authenticators apply credentials, token providers own lifecycle, credential sources own secret retrieval, and tests retain explicit control when authentication itself is under test.

