# 2026-05-23 Review Note: AI Provider Contract Drift

## Context

Current V4 review found that `packages/ai/src/providers/` does not match the real model configuration available in the repository root `.env`.

Secrets were not copied into this note. Only variable names and non-secret model identifiers were inspected.

## Observed `.env` Model Fields

The real `.env` exposes these current model-related fields:

```text
MODEL_MODE
ARK_API_KEY
ARK_TEXT_ENDPOINT_ID
ARK_VIDEO_ENDPOINT_ID
OPENAI_BASE_URL
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_TOP_P
OPENAI_TEMPERATURE
GEMINI_API_KEY
```

`OPENAI_BASE_URL` currently points to the fallback LLM provider and must not be treated as the primary Ark provider.

The real `.env` does not expose:

```text
SEEDANCE_API_URL
SEEDANCE_API_KEY
SEEDANCE_MODEL
```

## Confirmed Decisions

1. `MODEL_MODE` should stay. It is valid to add it to the real `.env`; API/key fields are the fields that must remain synchronized with the real `.env` because they represent paid provider entry points.
2. `GEMINI_API_KEY` is out of scope for the V0 provider contract. It is present locally but not consumed by current V0.
3. The video-generation contract should use Ark credentials:

```text
ARK_API_KEY
ARK_VIDEO_ENDPOINT_ID
```

4. `Seedance` remains a model capability/name in product and architecture language, but active env/provider code should not require `SEEDANCE_API_URL`, `SEEDANCE_API_KEY`, or `SEEDANCE_MODEL`.
5. The fallback LLM under `OPENAI_BASE_URL` has a narrow role: it may be used only when the Ark text primary entry point is unavailable because of missing config, auth failure, or provider configuration failure.

## Code Drift Found

- `packages/ai/src/workflows/creative-blueprint.workflow.ts` currently prefers `OPENAI_API_KEY` / `OPENAI_MODEL` before `ARK_TEXT_ENDPOINT_ID`, which can make fallback LLM look like the primary Ark provider.
- `packages/ai/src/providers/seedance-video.provider.ts` currently requires `SEEDANCE_API_URL` and `SEEDANCE_API_KEY`, then only falls back to `ARK_VIDEO_ENDPOINT_ID` as a model value. This does not match the real `.env`.
- `.env.example`, `docs/arc_codex_r4.md`, and `docs/plan_0523/current-support/` still document the obsolete `SEEDANCE_*` contract.
- `MODEL_MODE=mock` is consumed only through `isRealProviderMode()`, where any value other than `real` means fallback/mock is allowed.

## Recommended Fix Direction

Update active provider code and active docs so that:

```text
Primary text model: ARK_API_KEY + ARK_TEXT_ENDPOINT_ID
Primary video model: ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID
Fallback LLM: OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL
```

Fallback LLM is only for text/creative-blueprint recovery when Ark text auth or text generation fails. It should not participate in video generation.

More specifically:

```text
creative blueprint:
  try Ark text: ARK_API_KEY + ARK_TEXT_ENDPOINT_ID
  if Ark auth/config invalid:
    try fallback LLM: OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL
  if output invalid:
    repair once with the same selected text provider
  if still invalid:
    deterministic fallback blueprint

video:
  only Ark video: ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID
  no OpenAI fallback
```

Fallback LLM should not be triggered by prompt quality issues, invalid JSON by itself, or video-generation failures.
