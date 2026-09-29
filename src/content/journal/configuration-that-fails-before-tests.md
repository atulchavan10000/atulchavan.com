---
title: "Configuration That Fails Before Your Tests Do"
description: "How I separate configuration loading from test execution, resolve overrides, and turn a YAML catalog into a typed snapshot."
category: "Configuration"
date: "2026-09-29"
part: 1
diagram:
  title: "From external settings to a stable suite configuration"
  steps:
    - title: "TestNG suite starts"
      detail: "SuiteConfigListener selects the environment"
    - title: "ConfigLoader"
      detail: "Read YAML, validate its structure, resolve runtime overrides"
    - title: "FrameworkConfig + ServiceConfig"
      detail: "Typed, immutable settings for the selected environment"
    - title: "Tests and client factory"
      detail: "Choose a service and consume settings; do not re-read YAML"
  caption: "The suite lifecycle owns when configuration is loaded. The loader owns how it is interpreted."
sources:
  - "src/main/java/framework/config/ConfigLoader.java"
  - "src/main/java/framework/config/FrameworkConfig.java"
  - "src/main/java/framework/config/ServiceConfig.java"
  - "src/test/java/support/SuiteConfigListener.java"
  - "src/test/resources/config/config.yaml"
---

A test that fails because a URL was misspelled has not told me anything useful about the application. It has discovered a setup mistake, often after starting clients, creating data, or consuming time in CI.

In my Java API automation framework, I want those mistakes to surface while the suite is being configured. That led to a small configuration subsystem with three distinct jobs: loading external values, representing effective settings, and deciding when the suite receives them.

## Why I did not start with a global ConfigManager

A static method such as `ConfigManager.get("users.url")` is convenient. The trouble begins when any class can call it at any time. Tests become dependent on string keys, environment selection can be scattered, and changing a process property may affect different callers at different moments.

I use `ConfigLoader` to produce `FrameworkConfig`, which contains named `ServiceConfig` instances. A consumer asks for a service and receives typed values such as `URI` and `Duration`, rather than parsing strings during request execution.

The current TestNG listener performs this once per suite. This excerpt shows the lifecycle boundary:

```java
String selected = System.getProperty(
        "environment", suite.getXmlSuite().getParameter("environment"));
FrameworkConfig config = new ConfigLoader()
        .loadFromClasspath(CONFIG_RESOURCE, selected);
suite.setAttribute(CONFIG_ATTRIBUTE, config);
```

`ConfigLoader` does not import TestNG or know which product services exist. A different consumer could call the same loader without adopting my test lifecycle. That separation is more useful than naming everything a manager.

## Validate before resolving

The loader reads YAML into a neutral tree and checks the catalog structure before resolving the selected environment. Unknown properties are rejected. Required fields must have the expected types, timeouts must be positive, and authentication schemes must be recognized.

Duplicate-key detection matters because a second copy of a setting should not silently replace the first. The YAML parser also has bounds on aliases, nesting, and document size. These are deliberately restrictive choices for a small configuration file.

There are two validation stages. Structural checks traverse the catalog; constructing the effective `ServiceConfig` then validates the selected base URI. I would not describe this as a complete semantic audit of every unused environment. For example, the selected URI is checked for an HTTP(S) scheme, host, and absence of embedded credentials, query, or fragment.

Strictness has a cost: adding a configuration field means updating the schema logic. For this framework, an explicit change is preferable to a typo being ignored.

## Precedence needs examples, not slogans

For a particular supported setting, system properties take precedence over environment variables, which take precedence over the resolved YAML value. For example:

```text
-Dservices.user-service.base-url=...
                  ↓ takes precedence over
SERVICES_USER_SERVICE_BASE_URL
                  ↓ takes precedence over
services.user-service.environments.<selected>.baseUrl
```

Specificity is a separate rule. A service-level YAML timeout can replace the framework default, even if that default came from a global runtime override. A service-specific runtime override then wins for that service. Saying “runtime always overrides everything” would hide this distinction.

The loader also rejects a `prod` configuration that enables destructive tests. This is a configuration invariant; it is not a claim that arbitrary HTTP requests are automatically classified or blocked by the transport.

## Share a snapshot, not a mutable settings bag

`FrameworkConfig` copies its service map and exposes it through an unmodifiable wrapper. `ServiceConfig` keeps validated values in final fields. Once the suite starts, a test cannot replace another test's service configuration through that shared map.

This is where encapsulation and immutability help: consumers receive the settings they need without receiving the loader's mutable working state. The benefit comes from controlling ownership, not merely from adding the `final` keyword.

## What I have deliberately left out

There is no hot reload, secret-store integration, or configurable token-refresh policy in this slice. The authentication setting records a scheme; it does not implement authentication. Endpoint paths stay in the API objects, rather than becoming another catalog of strings.

The resulting configuration layer has a narrow purpose: make the suite's inputs explicit and reject invalid setup before ordinary test execution. In the next article, those settings become dependencies of an API client, without making that client responsible for reading configuration files.
