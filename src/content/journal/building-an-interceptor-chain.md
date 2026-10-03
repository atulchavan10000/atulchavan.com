---
title: "Building an Interceptor Chain Without a God Object"
description: "How common headers, correlation, and logging wrap HTTP execution—and why ordering, continuations, and exception behavior belong in the design."
category: "Design patterns"
date: "2026-09-29"
series: "framework-design"
part: 3
diagram:
  title: "Current outgoing execution order"
  steps:
    - title: "CommonHeadersInterceptor"
      detail: "Fill missing defaults without overwriting caller values"
    - title: "CorrelationIdInterceptor"
      detail: "Preserve an explicit ID or obtain one from the test context"
    - title: "LoggingInterceptor"
      detail: "Observe the prepared request, then record the returned result"
    - title: "HttpClient"
      detail: "Send the request; return through the nested interceptor calls"
  caption: "Outgoing work follows registration order. Returning work unwinds those method calls in reverse order; each interceptor chooses whether it has after-work."
sources:
  - "src/main/java/framework/interceptor/HttpInterceptor.java"
  - "src/main/java/framework/interceptor/DefaultInterceptorChain.java"
  - "src/main/java/framework/interceptor/CommonHeadersInterceptor.java"
  - "src/main/java/framework/interceptor/CorrelationIdInterceptor.java"
  - "src/main/java/framework/interceptor/LoggingInterceptor.java"
---

Common headers, correlation IDs, and HTTP logs are needed by many operations. Putting each concern directly in `ApiClient.execute()` would work initially, but every additional concern would make that method responsible for another policy.

I use a small interceptor chain to compose behavior around HTTP execution. The current implementation has three interceptors. It does not yet provide a retry policy or automatic authentication refresh, and its interface alone does not guarantee that an interceptor behaves correctly.

## An interceptor receives the remaining work

The central interface accepts a prepared request and a continuation:

```java
HttpResponse intercept(HttpRequest request, InterceptorChain chain);
```

An interceptor can inspect the request, construct a modified copy, delegate, and inspect the response. The following is an illustrative skeleton, not an additional implementation:

```java
HttpResponse intercept(HttpRequest request, InterceptorChain chain) {
    // Work before the downstream execution.
    HttpResponse response = chain.proceed(request);
    // Work after a response has returned.
    return response;
}
```

This resembles Chain of Responsibility, with nested wrapper behavior rather than only “handle this or pass it on.” The useful idea is composition: each participant has a small role while the transport remains the terminal operation.

## Why responses do not need a reverse loop

For two interceptors, ordinary synchronous method calls give this sequence:

```text
A: before
  B: before
    transport.execute(request)
  B: after
A: after
```

The response unwinds the call stack. The chain does not store a response and walk the list backward later. This also explains failure behavior: if downstream execution throws, statements after `proceed()` are skipped unless the interceptor handles the exception. Cleanup that must happen either way belongs in `finally`.

In my logging interceptor, execution failures are logged and the same runtime exception is rethrown. A received HTTP error status is logged as a response; it does not automatically fail the test.

## A fixed position instead of a moving counter

Each `DefaultInterceptorChain` object represents a fixed position in the registration list. Delegation constructs the next continuation:

```java
HttpInterceptor current = interceptors.get(index);
InterceptorChain next = new DefaultInterceptorChain(
        interceptors, httpClient, index + 1);
return Objects.requireNonNull(
        current.intercept(request, next),
        "HTTP interceptor returned null");
```

When the index reaches the list size, the chain calls the transport. The index is not incremented in a shared object, and neither request nor response is stored in a chain field.

The initial constructor snapshots list membership and order. It does not clone the interceptor objects. A fixed chain position therefore avoids one kind of shared mutation, but it cannot make a stateful interceptor thread-safe. Context-bound interceptors still need the right test lifecycle.

## Order is part of the contract

My current order is common headers, correlation, then logging. That places logging after the request has received its default headers and correlation identity. Logging reads the actual outgoing header rather than generating an identity itself.

Explicit values survive. Common headers fill only missing names. Correlation preserves a caller-provided value, including deliberate unusual input for a negative test. This prevents infrastructure from quietly correcting the very condition a test is trying to exercise.

Adding another participant is an Open/Closed extension point: registration can change without adding another conditional to the client's execution code. That does not mean arbitrary orderings are equivalent, or that every concern should become an interceptor. DTO serialization remains request preparation in `ApiClient`.

## What the chain does not enforce

The initial interceptors are expected to call their continuation exactly once. The chain does not enforce that count. Calling it twice can execute the downstream pipeline twice and send two requests. Retaining a continuation for later or sharing it across threads is also outside this synchronous contract.

Retries, short-circuiting, and authentication replay will require explicit policies about repeatable bodies, side effects, ordering, and observability. I would rather expose those limits than describe a generic interface as a finished policy engine.

For the present slice, the result is enough: shared behavior can evolve independently, the client stays readable, and execution order is visible in one place.
