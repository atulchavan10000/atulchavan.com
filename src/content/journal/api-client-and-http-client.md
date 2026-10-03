---
title: "Why My Framework Has Both an ApiClient and an HttpClient"
description: "Separating application operations, shared request preparation, and REST Assured transport without introducing an interface for everything."
category: "API architecture"
date: "2026-09-29"
series: "framework-design"
part: 2
diagram:
  title: "One request, distinct responsibilities"
  steps:
    - title: "Test → UserApi"
      detail: "Express an application operation; choose method, path, and response type"
    - title: "ApiClient"
      detail: "Resolve the URI, serialize the body, run interceptors, map the response"
    - title: "HttpClient → RestAssuredHttpClient"
      detail: "Execute the prepared HTTP request through the transport adapter"
    - title: "ApiResponse → Test"
      detail: "Return the typed body and raw HTTP evidence; let the test assert"
  caption: "The response returns through the client. The diagram combines the outgoing path and the result delivered back to the test."
sources:
  - "src/main/java/users/UserApi.java"
  - "src/main/java/framework/client/ApiClient.java"
  - "src/main/java/framework/client/ApiClientFactory.java"
  - "src/main/java/framework/http/HttpClient.java"
  - "src/main/java/framework/http/restassured/RestAssuredHttpClient.java"
---

One of the questions I asked while designing this framework was whether `ApiClient` needed to exist. If REST Assured already sends requests, why place two more names between a test and the network?

The answer depends on whether those names represent different responsibilities. In this implementation, `ApiClient` prepares and coordinates an operation. `HttpClient` is the transport contract for an already-prepared request. The distinction keeps business operations and serialization decisions out of the HTTP adapter.

## Start with the operation a test wants to perform

`UserApi` knows what “create a user” means for the application: the HTTP method, endpoint path, request DTO, and expected response representation. Its core delegation is small:

```java
return client.execute(
        new ApiRequest(HttpMethod.POST, createPath, body, options),
        CreateUserResponse.class);
```

The response class is a mapping instruction, not an assertion. It does not mean the request must return a successful status. The test still decides which outcome is correct.

This API object is intentionally application-specific. Moving its endpoint paths into the reusable transport would make that transport harder to reuse and harder to understand.

## Preparation is different from transmission

An `ApiRequest` describes an operation. Its path may still contain placeholders, and its body can be an application object. It is not ready for an HTTP library.

`ApiClient` resolves that description into an `HttpRequest`. It coordinates URI resolution, selects a timeout, serializes a normal body through `JsonCodec`, and applies a default content type when the caller has not supplied one. It then runs the interceptor chain.

The transport receives the result of that preparation. It should not decide which DTO represents a user, deserialize business responses, or read YAML. Its framework-owned contract is simply:

```java
HttpResponse execute(HttpRequest request);
```

After execution, `ApiClient` can map JSON into the requested response type and pair that value with the raw response. `Void.class` explicitly skips mapping; the raw path can skip DTO mapping entirely.

## The adapter contains the library dependency

`RestAssuredHttpClient` implements the transport contract. It translates framework headers, URI, method, and bytes into REST Assured settings, executes the request, and translates the result back into `HttpResponse`.

That is the Adapter pattern doing concrete work. REST Assured types stay inside the adapter rather than leaking into `UserApi`, test results, or the orchestration layer. Its library-specific Apache HTTP client configuration also stays there.

Dependency Inversion appears at the `ApiClient` boundary: the client receives `HttpClient` and `JsonCodec` abstractions, rather than constructing REST Assured and Jackson directly. `ApiClientFactory` is the place that selects the concrete implementations. There is still coupling, but it is concentrated in the wiring.

I have only implemented one transport adapter. Having an interface does not prove that replacing it will be effortless. A second adapter would need to preserve the same observable behavior and pass appropriate contract checks.

## A boundary must include behavior

The current adapter disables automatic retries and redirects and closes its native client after reading the response. That avoids silently adding behavior the framework has not designed yet, at the cost of connection reuse.

Timeout semantics are another example. The configured duration is applied to connection and socket-read inactivity limits. It is not a whole-request deadline. Calling every duration a “request timeout” without explaining that difference would leave a misleading contract behind a clean interface.

An HTTP error response and a transport failure are also different outcomes. A received 400 or 500 is evidence a test can inspect. Failure to execute the request is normalized as `TransportException`. Assertions belong above both mechanisms.

## Enough abstraction for the current problem

I did not add an interface for every class. `UserApi` and `ApiClient` are concrete because the present variation points are transport and serialization. Constructor injection is ordinary Java; it does not require a dependency-injection container.

The extra layer earns its place through work that already exists: request preparation, shared interception, and response mapping. Supporting hypothetical future protocols is not the justification. The next article looks at the interception mechanism that keeps those shared execution behaviors from accumulating inside `ApiClient` itself.
