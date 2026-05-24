# 2026-05-24 Trace Env And Scope Log

## Summary

This change set fixes two related local-runtime observability issues:

1. `TRACE_LOG_DIR` and `UPLOAD_DIR` are now configurable from `.env` and resolve relative paths from the workspace `.env` root instead of the current process cwd.
2. File trace logs are now split into explicit scope directories:

```text
{TRACE_LOG_DIR}/users/<scriptId>/events.jsonl
{TRACE_LOG_DIR}/tests/<traceId>/events.jsonl
```

The intent is to keep real browser/API sessions easy to inspect while preventing automated tests and provider probes from mixing with user-run traces.

## Issue 1: Cwd-Dependent Env Paths

### Problem

Before this change, `UPLOAD_DIR=tmp/uploads` and `TRACE_LOG_DIR=logs/trace` were interpreted through `process.cwd()`. When the server ran from `apps/server`, traces and uploads could land under package-local paths instead of the repository root.

### Fix

- `apps/server/src/common/config.ts` now returns the discovered `.env` directory as workspace root.
- `config.uploadDir` resolves relative `UPLOAD_DIR` values from that workspace root.
- `packages/ai/src/env.ts` now exposes workspace env/path helpers.
- `packages/ai/src/trace/trace-log.ts` loads `.env` before choosing the default trace root and resolves relative `TRACE_LOG_DIR` from the workspace root.

### Result

With repository-root `.env` values:

```text
UPLOAD_DIR=tmp/uploads
TRACE_LOG_DIR=logs/trace
```

runtime paths resolve as:

```text
<repo>/tmp/uploads
<repo>/logs/trace
```

Absolute values such as `/uploads` and `/traces` remain absolute.

## Issue 2: Test Traces Mixed With User Traces

### Problem

Provider tests, API tests, CLI probes, and real user runs all wrote directly under the same trace root. That made `logs/trace/` useful but noisy.

### Fix

- Added `TraceScope = "users" | "tests"`.
- Added `traceScope?: TraceScope` to `createFileTraceLogger`.
- Added env support:

```text
TRACE_LOG_SCOPE=users|tests
```

- Scope priority is:

```text
options.traceScope > TRACE_LOG_SCOPE > users
```

- Invalid `TRACE_LOG_SCOPE` values now fail loudly.
- Production server calls keep default scope and write to `users`.
- Provider probe CLIs explicitly write to `tests`.
- Test scripts set `TRACE_LOG_SCOPE=tests`.

### Result

Real app/API sessions:

```text
{TRACE_LOG_DIR}/users/<scriptId>/events.jsonl
```

Automated tests and provider probes:

```text
{TRACE_LOG_DIR}/tests/<traceId>/events.jsonl
```

Existing historical trace files are not migrated.

## Config Notes

`.env.example` now includes:

```text
UPLOAD_DIR=/uploads
TRACE_LOG_DIR=/traces
TRACE_LOG_SCOPE=users
```

The server test script explicitly overrides local `.env` storage paths:

```text
TRACE_LOG_SCOPE=tests TRACE_LOG_DIR=logs/trace UPLOAD_DIR=tmp/uploads
```

This prevents local absolute paths such as `/uploads` and `/traces` from affecting automated tests.

## Validation

The following checks passed after the change:

```bash
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

## Follow-Up Notes

- Historical trace files may still exist directly under `logs/trace/<id>/events.jsonl`.
- New user traces should be inspected under `logs/trace/users/` unless `.env` points `TRACE_LOG_DIR` somewhere else.
- New automated test and probe traces should be inspected under `logs/trace/tests/`.
