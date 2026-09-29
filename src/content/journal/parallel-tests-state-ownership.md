---
title: "Parallel Tests Need State Ownership, Not Just Thread Safety"
description: "Separating suite configuration, per-invocation correlation, and thread-local logging so parallel execution does not share the wrong state."
category: "Test isolation"
date: "2026-09-29"
part: 6
diagram:
  title: "Lifetimes in the current framework"
  steps:
    - title: "Suite lifetime"
      detail: "One immutable FrameworkConfig snapshot is shared"
    - title: "Invocation lifetime"
      detail: "Each test call constructs its own TestContext and context-bound client"
    - title: "Step lifetime"
      detail: "Calls within that invocation reuse its correlation identity"
    - title: "Completion"
      detail: "Clean up owned test data; remove logging state from reused worker threads"
  caption: "These are ownership scopes, not a singleton context shared through the whole stack. Each parallel invocation has a separate instance of its mutable test state."
sources:
  - "src/main/java/framework/context/TestContext.java"
  - "src/main/java/framework/interceptor/CorrelationIdInterceptor.java"
  - "src/main/java/framework/client/ApiClientFactory.java"
  - "src/test/java/users/CreateUserTest.java"
  - "src/test/java/support/BaseApiTest.java"
  - "src/test/java/support/TestSteps.java"
  - "src/test/java/support/TestLifecycleLogger.java"
---

Parallel execution makes shared-state mistakes easier to see, but adding locks does not answer the most important question: should two tests be sharing that state at all?

In this framework, suite configuration can be shared. A test's created user ID and correlation identity should not be shared with an unrelated invocation. I design around those ownership rules before considering synchronization.

## The invocation is the unit of ownership

One test method can run several times through a parallel DataProvider. Using the method name as the sole identity would make those executions indistinguishable. Storing mutable values in fields on the test class can also expose them to overlapping invocations.

`CreateUserTest` creates its state inside the test method. This excerpt shows the boundary:

```java
TestContext context = new TestContext(UUID.randomUUID().toString());
UserApi users = new UserApi(client(SERVICE_NAME, context));
```

Each invocation receives a new `TestContext`. API calls belonging to that invocation reuse it. `ApiClientFactory` constructs the context-bound correlation and logging interceptors around that instance.

This is explicit lifetime management through ordinary object construction. The context class does not magically discover which TestNG invocation is running, and it is not stored in a global registry.

## Synchronization solves a different problem

The context lazily creates a correlation ID:

```java
public synchronized String getOrCreateCorrelationId() {
    if (correlationId == null) {
        correlationId = UUID.randomUUID().toString();
    }
    return correlationId;
}
```

Synchronization makes the check-and-create operation atomic for this object. If two callers share the same context, they receive the same generated identity rather than racing to create different ones.

It does not separate two tests that were accidentally given the same context. In that situation, the code would reliably share the wrong identity. Separate instances establish isolation; synchronization protects the operation within an instance. Neither statement proves that every surrounding component is safe for arbitrary concurrent use.

## Correlation belongs to the flow, with an explicit override

When a request has no correlation header, the interceptor asks the context for its ID. Later requests in that test flow receive the same default identity. This makes a create-then-read scenario easier to follow.

A caller-supplied header wins for that request. It does not replace the context's stored default. The logging interceptor reads the actual outgoing header, so a deliberate override is reflected in the log rather than hidden by the context value.

These rules are small, but they prevent different meanings from collapsing into one field: the test execution ID identifies the invocation, while the correlation header identifies a request flow according to the framework's convention.

## Keep shared setup small

`BaseApiTest` receives suite configuration and provides client construction. It does not store tokens, created entity IDs, or a shared mutable context. Sharing its immutable configuration reference is different from sharing scenario data.

The create-user example keeps the returned ID local and uses it for cleanup in `finally`. If the main test has already failed, a cleanup failure is attached as suppressed evidence instead of replacing the primary failure. Cleanup is scoped to the ID this invocation created, rather than deleting broadly by a shared name.

That still has limits: a request could create something and then fail before returning enough information to identify it. Local ownership reduces interference; it is not a complete recovery strategy for every partial failure.

## Thread-local logging needs cleanup too

The test-support layer uses MDC and a thread-local step counter for readable logs. Worker threads are reused, so `TestLifecycleLogger` calls cleanup on completion and `TestSteps.endTest()` removes the values.

This logging context is separate from the explicit `TestContext`. A thread-local value is attached to a worker thread, not inherently to a logical test. It also does not automatically follow work submitted to another executor. Async propagation and retry lifetimes need deliberate treatment if those capabilities are added.

## What I would inspect before adding another lock

For a flaky parallel test, I would first identify who owns its context, data, client, and cleanup target. A synchronized shared object may be behaving exactly as written while violating the intended test boundary.

The current design keeps the useful distinction visible: immutable suite settings can be shared, invocation state is constructed locally, and temporary logging state is cleared before a worker serves the next test.
