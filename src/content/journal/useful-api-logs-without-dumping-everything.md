---
title: "Useful API Logs Without Dumping Everything"
description: "Designing request and response logs around correlation, bounded body formatting, redaction, and the limits of what a formatter can protect."
category: "Observability"
date: "2026-09-29"
series: "framework-design"
part: 7
diagram:
  title: "A diagnostic view, separate from HTTP evidence"
  steps:
    - title: "Prepared request / returned response"
      detail: "The execution pipeline retains the original values"
    - title: "SensitiveDataRedactor"
      detail: "Format headers and query values using a sensitive-name policy"
    - title: "Optional BodyLogFormatter"
      detail: "Bound input, redact JSON fields, cap output, or omit unsafe-to-format content"
    - title: "SLF4J log event"
      detail: "Test identity, outgoing correlation ID, status or failure, and diagnostic text"
  caption: "This is the diagnostic formatting path, not a sequence of mutations to the request. Redacted log text does not replace the raw response returned to the test."
sources:
  - "src/main/java/framework/interceptor/LoggingInterceptor.java"
  - "src/main/java/framework/logging/BodyLogFormatter.java"
  - "src/main/java/framework/logging/JacksonBodyLogFormatter.java"
  - "src/main/java/framework/logging/SensitiveDataRedactor.java"
  - "src/main/java/framework/client/ApiClientFactory.java"
  - "src/test/java/support/TestLifecycleLogger.java"
---

When an API test fails, I want to know what it sent, what came back, and which execution produced those events. Dumping every byte is an easy starting point, but it can expose credentials and bury the useful information under large payloads.

My framework separates HTTP evidence from its diagnostic presentation. The test retains the raw response. Logging receives a formatted view whose policy can hide values, summarize content, or omit a body without changing the actual request or response.

## Put logs where they can see the right request

The logging interceptor runs after common headers and correlation. It can therefore observe the outgoing correlation header, including a value explicitly supplied by the test. It does not generate an ID while trying to log one.

The log includes the test execution ID, method, formatted URI, headers, and body policy. On return it includes the status and transport-measured duration. Test-support MDC provides human-readable test and step names when available.

Status codes remain evidence. A 400 or 500 is a received response, not an exception invented by the logger. If downstream execution throws a runtime exception, the interceptor logs a compact failure summary and rethrows the same exception.

## Formatting is its own responsibility

`LoggingInterceptor` depends on `BodyLogFormatter`. `JacksonBodyLogFormatter` handles JSON parsing, field redaction, text decoding, and limits. `SensitiveDataRedactor` supplies the sensitive-name policy used for headers, query parameters, and JSON fields in the default setup.

This separation gives each concern a smaller reason to change. A different formatting policy can be provided without changing the transport or embedding JSON-tree traversal inside the interceptor.

Body logging is optional. The factory supplies a formatter when enabled and otherwise supplies null. The interceptor continues to log request and response summaries while displaying that body logging is disabled. Disabling bodies does not disable every potential source of sensitive information.

## Redact by structure before truncating

For JSON, the formatter parses a tree and walks nested objects and arrays. Fields whose normalized names match the configured policy have their values replaced. Normalization treats spellings such as `access-token`, `access_token`, and `accessToken` consistently.

For example, this illustrative input:

```json
{"user":{"name":"Example","access_token":"demo-secret"},"page":2}
```

becomes this diagnostic representation under the default policy:

```json
{"user":{"name":"Example","access_token":"[REDACTED]"},"page":2}
```

The name and page remain visible because the policy is name-based, not a detector for all personal information. Nested structure is why I use a parser rather than a regular expression over arbitrary JSON text.

If JSON parsing or redaction fails, the body is omitted. Falling back to the unfiltered original would defeat the protection precisely when formatting became uncertain. The raw bytes still exist in the test-facing response for deliberate inspection.

## Input and output limits answer different questions

The current default body formatter is constructed with these limits:

```java
return new JacksonBodyLogFormatter(
        65536,
        maxOutputChars,
        SensitiveDataRedactor.defaults().sensitiveNames());
```

The default output setting is 8,000 characters. The 65,536-byte input bound limits which bodies are processed by this formatter; larger inputs receive an omission summary. The output bound caps the resulting text after formatting and control-character escaping.

These are body-formatting limits. They are not a cap on the complete log event, all headers, or the memory required to receive an HTTP response. Confusing those scopes would make the implementation sound more comprehensive than it is.

Binary or unknown content types receive a summary rather than speculative decoding. Plain text can be decoded and truncated, but it is not field-redacted. That makes enabling text-body logs a conscious decision about the test data involved.

## The limits belong in the article

Known-name redaction cannot catch a secret stored under an unexpected field name, sensitive path segments, or every identifier a service might return. Custom names need to be configured consistently across header/query and body policies.

The HTTP failure summary avoids arbitrary exception messages, but other test-support logging currently includes failure messages. That means I cannot claim the entire logging system is secret-proof. The boundaries outside the body formatter deserve review too.

SLF4J provides the logging API; runtime configuration controls destinations and presentation. Retention and who can read those logs are operational concerns beyond this formatter.

## Observability should preserve the experiment

The logger does not rewrite a response, repair a malformed request, retry an operation, or decide whether a scenario passed. It adds a bounded, more deliberate view of execution while leaving assertions and raw evidence with the test.

That separation is the common thread across this series: give each component a clear responsibility, preserve the caller's intent, and describe the limits as carefully as the capabilities.
