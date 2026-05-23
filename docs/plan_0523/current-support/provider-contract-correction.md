# Provider Contract Correction

## Status

Current support document for the V0 provider-contract correction.

## What Was Wrong

Earlier V0 docs and provider code treated `Seedance` as if it required a standalone API namespace:

```text
SEEDANCE_API_URL
SEEDANCE_API_KEY
SEEDANCE_MODEL
```

That was incorrect for the current local project configuration. The real paid provider entry points are Ark credentials and Ark endpoint IDs. Keeping the standalone `SEEDANCE_*` shape in active docs made future agents likely to require a key that does not exist in the real `.env`.

The text provider was also ambiguous: `OPENAI_BASE_URL` was documented as if it could be the Ark text runtime, but the current local configuration uses it as a fallback LLM.

## Correct Contract

```text
Primary text model: ARK_API_KEY + ARK_TEXT_ENDPOINT_ID
Primary video model: ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID
Fallback LLM: OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL
```

`MODEL_MODE` remains part of the runtime contract:

```text
MODEL_MODE=mock   local fallback allowed
MODEL_MODE=real   real-provider acceptance should fail unless Ark text and Ark video paths are proven
```

`Seedance` remains the video model capability name for product language, traces, and 成片 metadata. It is not a separate active credential namespace.

## Fallback Boundary

The fallback LLM has one narrow role:

```text
creative blueprint:
  try Ark text: ARK_API_KEY + ARK_TEXT_ENDPOINT_ID
  if Ark auth/config is unavailable:
    try fallback LLM: OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL
  if output is invalid:
    repair once with the same selected text provider
  if repair fails:
    deterministic fallback blueprint

video:
  only Ark-backed Seedance: ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID
  no OpenAI fallback
```

Fallback LLM should not be triggered by prompt quality issues, invalid JSON by itself, or video-generation failures.

## Documentation Handling

Historical grill/review notes remain available for audit. Active docs should not instruct operators to configure `SEEDANCE_API_URL`, `SEEDANCE_API_KEY`, or `SEEDANCE_MODEL`.

Use these current docs for setup and reporting:

- `docs/architecture.md`
- `docs/arc_codex_r4.md`
- `docs/plan_0523/current-support/demo-readiness.md`
- `docs/plan_0523/current-support/model-smoke.md`
- this document
