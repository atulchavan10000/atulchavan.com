---
title: "A Test Framework Must Let You Send Bad Requests"
description: "Why typed DTOs need a deliberate raw-body escape hatch, and why response mapping must never discard the evidence from a negative test."
category: "Negative testing"
date: "2026-09-29"
part: 5
diagram:
  title: "Two body paths, one execution pipeline"
  steps:
    - title: "Choose the body representation"
      detail: "Normal DTO or explicit RawBody"
    - title: "ApiClient prepares bytes"
      detail: "Serialize a DTO; preserve RawBody bytes without JSON serialization"
    - title: "Interceptors → HttpClient"
      detail: "Both paths retain common execution behavior"
    - title: "Choose the response representation"
      detail: "Typed ApiResponse or unmapped HttpResponse for direct inspection"
  caption: "Raw input and raw output are independent choices. executeRaw() skips response DTO mapping; it still serializes an ordinary request body."
sources:
  - "src/main/java/framework/client/RawBody.java"
  - "src/main/java/framework/client/ApiClient.java"
  - "src/main/java/framework/client/ApiResponse.java"
  - "src/main/java/framework/client/ResponseMappingException.java"
  - "src/main/java/users/UserApi.java"
  - "src/test/java/users/CreateUserTest.java"
---

Typed request objects make ordinary tests easier to read. They give an operation a clear contract and let the JSON codec handle serialization. But a test framework cannot assume that every request should be well-formed.

Sometimes the purpose of a test is to send an incomplete JSON document, a wrong field type, or a body that the normal DTO cannot express. If my framework prevents that request from reaching the server, it is preventing me from testing the behavior I care about.

## Keep the normal API small

`UserApi.createUser()` normally accepts a `CreateUserRequest`. I do not want equivalent overloads for DTOs, file paths, maps, JSON strings, and byte arrays on every operation. Those overloads would make test authors learn multiple ways to express the same ordinary request.

Instead, raw input has an explicit type: `RawBody`. A string passed as a normal body remains an ordinary value for the JSON serializer. The framework does not inspect its contents and guess whether it “looks like JSON.”

The factory method makes the caller's intent visible:

```java
public static RawBody json(String json) {
    return new RawBody(
            Objects.requireNonNull(json).getBytes(StandardCharsets.UTF_8),
            "application/json");
}
```

This method labels and encodes the payload; it deliberately does not validate its JSON syntax. That omission is the capability the negative test needs.

## A deliberately malformed request

The current user-service test includes this call and its assertions:

```java
HttpResponse response = users.createUserRaw(
        RawBody.json("{"), RequestOptions.empty());
assertThat(response.statusCode(), is(422));
assertThat(response.bodyLength(), greaterThan(0));
```

The expected 422 belongs to this service's test. It is not a universal rule encoded in `RawBody` or the HTTP client. Another application could legitimately have a different contract for malformed JSON.

`ApiClient` recognizes `RawBody`, obtains its copied bytes, and avoids normal JSON serialization. Common headers, correlation, logging, URI preparation, and transport still apply. The escape hatch bypasses one transformation rather than bypassing the framework wholesale.

## Raw input does not imply raw execution everywhere

There are two independent decisions: how to prepare the outgoing body, and how to interpret the response.

`executeRaw()` returns an `HttpResponse` without DTO mapping. Despite its name, it still prepares the request and serializes an ordinary DTO body. `RawBody` is what bypasses request serialization. Conversely, a raw request could receive a JSON response that a caller chooses to map.

Keeping those choices separate avoids an overloaded “raw” mode that disables unrelated capabilities. It also gives tests a way to inspect text, binary data, empty bodies, and error representations that differ from success DTOs.

## Preserve evidence when mapping fails

The typed result is `ApiResponse<T>`, which pairs the mapped body with the original `HttpResponse`. Status, headers, timing, and body bytes remain available after a successful mapping.

If the response is not an appropriate JSON media type, or mapping fails, `ApiClient` throws `ResponseMappingException` and retains the raw response in the exception. Returning null for every mapping problem would lose the difference between “no content” and “content I failed to understand.”

There are legitimate null-body cases: an empty response, `Void.class`, and a mapped JSON null. The current result wrapper does not distinguish all of them. Tests should examine the raw response when that distinction matters.

The typed path also does not select a different DTO automatically for every HTTP status. A negative test expecting an error schema should choose its representation deliberately rather than force a success DTO onto the response.

## Boundaries that support testing

The framework validates its own requirements, such as a usable destination and positive timeout. It does not attempt to enforce every business rule of the application before transmission. That responsibility belongs to the system under test.

This distinction guides the design: reject an invalid framework setup, but preserve deliberately invalid application input. DTOs remain the convenient default, and raw bodies remain a visible, narrowly scoped way to test what the default cannot express.
