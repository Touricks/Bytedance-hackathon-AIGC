# 2026-05-24 Trace Env And Scope Log

## Summary

This change set fixes two related local-runtime observability issues:

1. `TRACE_LOG_DIR` and `UPLOAD_DIR` are now configurable from `.env` and resolve relative paths from the workspace `.env` root instead of the current process cwd.
2. File trace logs are now split into explicit scope and process-batch directories:

```text
{TRACE_LOG_DIR}/users/<batchId>/events.jsonl
{TRACE_LOG_DIR}/tests/<batchId>/<traceId>/events.jsonl
```

The batch id is generated once per Node process in local time with `YYYYMMDDHH-MM-SS` format. The intent is to keep real browser/API sessions easy to inspect while preventing automated tests and provider probes from mixing with user-run traces.

## Issue 1: Cwd-Dependent Env Paths

### Problem

Before this change, `UPLOAD_DIR=tmp/uploads` and `TRACE_LOG_DIR=logs/trace` were interpreted through `process.cwd()`. When the server ran from `apps/server`, traces and uploads could land under package-local paths instead of the repository root.

### Fix

- `apps/server/src/common/config.ts` now returns the discovered `.env` directory as workspace root.
- `config.uploadDir` resolves relative `UPLOAD_DIR` values from that workspace root.
- `packages/ai/src/env.ts` now exposes workspace env/path helpers.
- `packages/ai/src/trace/trace-log.ts` loads `.env` before resolving the configured trace root and resolves relative `TRACE_LOG_DIR` from the workspace root.

### Result

With repository-root `.env` values:

```text
UPLOAD_DIR=storage/uploads
UPLOAD_URL_PREFIX=/uploads
TRACE_LOG_DIR=storage/trace
```

runtime paths resolve as:

```text
<repo>/storage/uploads
<repo>/storage/trace
```

Absolute filesystem values such as `/mnt/uploads` remain absolute. Cloud object
URLs such as `s3://...` are not valid `UPLOAD_DIR` values for the current local
upload adapter; use a mounted path there, or add an object-storage adapter.

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
{TRACE_LOG_DIR}/users/<batchId>/events.jsonl
```

Automated tests and provider probes:

```text
{TRACE_LOG_DIR}/tests/<batchId>/<traceId>/events.jsonl
```

In `users` scope, multiple script ids from the same Node process share the batch file; each JSONL event still carries `scriptId`. Existing historical trace files are not migrated.

## Config Notes

`.env.example` now includes:

```text
UPLOAD_DIR=storage/uploads
UPLOAD_URL_PREFIX=/uploads
TRACE_LOG_DIR=storage/trace
TRACE_LOG_SCOPE=users
```

`UPLOAD_DIR`, `UPLOAD_URL_PREFIX`, and `TRACE_LOG_DIR` are required for runtime
defaults. The server test script reuses `.env` trace storage with
`TRACE_LOG_SCOPE=tests`, so API test traces are written under
`storage/trace/tests/<batchId>/...`. It still overrides upload storage with an OS temp root:

```text
TRACE_LOG_SCOPE=tests UPLOAD_DIR=${TMPDIR:-/tmp}/aigc-video-test-uploads UPLOAD_URL_PREFIX=/uploads
```

This keeps API test traces easy to inspect without polluting user-session traces,
while test uploads still stay outside the repository upload directory. Lower-level
trace logger unit tests continue to use OS temp roots for fixed-id isolation.

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

- Historical trace files may still exist directly under `logs/trace/<id>/events.jsonl` or pre-batch scope paths.
- New user traces should be inspected under `{TRACE_LOG_DIR}/users/<batchId>/events.jsonl`.
- New automated test and probe traces should be inspected under `{TRACE_LOG_DIR}/tests/<batchId>/<traceId>/events.jsonl`.
