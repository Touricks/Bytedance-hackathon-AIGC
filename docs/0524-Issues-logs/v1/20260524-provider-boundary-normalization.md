# 2026-05-24 Provider Boundary Normalization Log

## Summary

This change set closes the remaining provider-boundary cleanup for issues #37-#40.

The active V0 provider layer is now limited to:

```text
packages/ai/src/providers/ark-text.provider.ts
packages/ai/src/providers/seedance-video.provider.ts
```

Workflows, probes, smoke checks, and server code consume these boundaries instead of constructing model SDK clients directly.

## #37 Seedance Boundary Alignment

- `generateVideoWithSeedance` now returns normalized provider details including `provider`, `model`, `videoUrl`, and `prompt`.
- Seedance still accepts injected `fetch` for tests.
- Existing behavior is preserved:
  - mock video fallback remains available in mock mode when Ark video config is absent;
  - real-provider mode fails loudly without `ARK_API_KEY` and `ARK_VIDEO_ENDPOINT_ID`;
  - data URLs pass through to Ark video after server-side image normalization.
- Trace metadata keeps the Ark video task endpoint family, model, request lifecycle, task polling, completion, and `jobId`.

## #38 Legacy Provider Retirement

- Removed active exports for:
  - legacy Seed text provider shim;
  - P1-only TTS placeholder;
  - old one-click script-generation workflow;
  - old regenerate-script workflow.
- Deleted obsolete active provider shim files:
  - `provider-mode.ts`
  - `seed-text.provider.ts`
  - `tts.provider.ts`
- Moved deterministic script generation to a clearly named compatibility fixture:

```text
packages/ai/src/legacy/deterministic-script.fixture.ts
```

## #39 Provider Boundary Guard

Added a repo-level guard test:

```text
packages/ai/src/providers/provider-boundary.guard.test.ts
```

It scans `packages/ai/src` and `apps/server/src` for direct model SDK or provider transport construction outside approved provider modules. This prevents workflows, probes, smoke checks, or server modules from quietly reintroducing direct OpenAI-compatible client construction.

## #40 Trace Verification

Trace-oriented tests now cover:

- creative blueprint provider request/response lifecycle and redacted image references;
- to-text probe traces under `tests/<traceId>/events.jsonl`;
- Seedance request/create/poll/complete trace events with `jobId`;
- raw data URL redaction while preserving image `sha256`, byte size, model, provider, and output evidence.

Inspect traces at:

```text
{TRACE_LOG_DIR}/users/<scriptId>/events.jsonl
{TRACE_LOG_DIR}/tests/<traceId>/events.jsonl
```

## Validation

Passed validation commands:

```bash
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```
