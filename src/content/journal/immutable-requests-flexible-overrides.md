---
title: "Immutable Requests, Flexible Overrides: Designing with Builders"
description: "Using defensive copies and explicit defaults to make request construction predictable without preventing unusual test inputs."
category: "Object design"
date: "2026-09-29"
part: 4
diagram:
  title: "Ownership during request preparation"
  steps:
    - title: "Local builder"
      detail: "The caller assembles mutable request options"
    - title: "RequestOptions snapshot"
      detail: "Collections are copied; explicit overrides are retained"
    - title: "Prepared HttpRequest"
      detail: "Resolved URI, headers, timeout, and copied body bytes"
    - title: "Modified copy → next interceptor"
      detail: "toBuilder() changes a new request instead of mutating the old one"
  caption: "The prepared HTTP model protects its bytes and collections. An arbitrary DTO carried before serialization is not automatically deep-immutable."
sources:
  - "src/main/java/framework/client/RequestOptions.java"
  - "src/main/java/framework/client/ApiRequest.java"
  - "src/main/java/framework/http/HttpRequest.java"
  - "src/main/java/framework/http/HttpHeaders.java"
  - "src/main/java/framework/interceptor/CommonHeadersInterceptor.java"
---

A request passes through several components before it reaches the network. If each component can change the same headers or body in place, understanding the final request requires understanding every reference to that object.

I wanted a simpler rule: builders belong to the code constructing a value; built request values protect their own state. An interceptor that needs a change produces a new request and passes it downstream.

## A builder is a construction tool

`RequestOptions` collects caller-supplied headers, path parameters, query parameters, and an optional timeout. This illustrative call uses the implemented builder API:

```java
RequestOptions options = RequestOptions.builder()
        .header("Accept", "application/json")
        .pathParam("teamId", "42")
        .queryParam("tag", "active")
        .addQueryParam("tag", "verified")
        .timeout(Duration.ofSeconds(10))
        .build();
```

Named methods make the optional values clearer than a long constructor full of adjacent maps and nulls. The builder can be mutable because it remains local to its caller. The object returned by `build()` takes independent snapshots of its collections.

This does not make a builder the default answer for every object. `ApiResponse` holds a raw response and a mapped body; a two-argument constructor is sufficient. The pattern should reduce ambiguity, not add ceremony uniformly.

## Final references are not defensive copies

A `final byte[]` still points to an array whose elements can change. Wrapping a map without copying it can also leave the original owner able to mutate the values behind the wrapper.

`HttpRequest` copies body bytes during construction and returns a copy from its body accessor. `RequestOptions` copies both the query map and its nested lists. Strings and `Duration` can be shared because they are immutable values.

These choices define ownership: later edits to a builder or an input collection do not rewrite an already-built request. They also have a cost. Copying large byte arrays consumes memory and CPU; this implementation is not a streaming upload design. That boundary would need revisiting for very large payloads.

There is another important limit. `ApiRequest` carries an `Object` body before serialization. It retains the caller's DTO reference rather than deep-copying an arbitrary object graph. A mutable DTO must not be changed while request preparation is using it. The strong byte-level immutability claim applies to the prepared `HttpRequest`, not automatically to every object in the API.

## Defaults should preserve caller intent

An automation framework is unusual because an invalid value can be intentional. A test may supply an unexpected `Accept` header to exercise server behavior. Replacing it with the framework default would turn that test into a different request.

`CommonHeadersInterceptor` checks whether a name is already present, using the header model's case-insensitive matching. If it exists, the supplied header wins as a whole. Otherwise, all default values for that name are added in order.

This is an excerpt from the interceptor's copy-based approach:

```java
HttpRequest outgoing = request;
if (changed) {
    outgoing = request.toBuilder()
            .headers(mergedHeaders.build())
            .build();
}
return chain.proceed(outgoing);
```

When nothing changes, the original request can continue. When defaults are added, method, URI, body, and timeout are retained while headers change in the new object.

## Represent absence explicitly

An absent timeout override means “use the configured default.” It does not mean zero, unlimited, or whatever the transport library happens to choose. The client selects an effective timeout during preparation.

Bodies have a similar distinction. A missing body and an explicitly supplied zero-length body are different states. The model preserves that difference rather than making both look like an empty array.

Separating operation intent from a prepared request makes these decisions easier to place. `RequestOptions` stores choices; `ApiClient` applies them; `HttpRequest` represents the resolved result. None of those value objects sends an HTTP request.

## What this buys the pipeline

The main benefit is local reasoning. I can inspect an interceptor and see whether it returns the same request or constructs a changed copy. I do not need to look for mutations through unrelated references.

Builders provide readable construction, defensive copies protect ownership, and explicit precedence protects the test author's intent. Those are complementary design decisions; using any one of them alone would not deliver the same contract.
