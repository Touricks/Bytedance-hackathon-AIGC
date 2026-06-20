# Agent And Prompt Architecture

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: `packages/ai` prompt modules and server deterministic assemblers
Depends On: `architecture/data_model.md`, `docs/reference/`
Blocks: Prompt/provider changes without schema and trace updates
Decision State: Accepted

## 1. Executive Summary

Workspace LLM modules use file-based subject and contract prompts. Mock-mode product brief/storyboard artifacts are built by explicit deterministic builders in the server workspace module. Per-shot image and video generation uses deterministic server assembly, then provider workers call Ark Seedream image or Seedance video.

## 2. Current Reality

Workspace prompt templates live under:

```text
packages/ai/src/prompts/modules/<module>/
  subject.md
  contract.md
```

The central assembler is `packages/ai/src/prompts/module-prompt-assembler.ts`. Per-shot deterministic assembly is in `apps/server/src/modules/shot/prompt-assembler.ts`.

## 3. Target State

| Module | Prompt ownership | Output |
|---|---|---|
| `prompt-requirements` | Form/import deterministic compile | Four-factor 创作要求. |
| `material-intake` | subject/contract prompt plus material runtime context | 素材解读. |
| `product-brief` | subject/contract prompt plus material image/runtime context; mock mode uses `deterministic-artifacts` | 商品卖点; deterministic output marks source in assumptions. |
| `storyboard` | subject/contract prompt plus brief/material context; mock mode uses `deterministic-artifacts` | 分镜脚本; deterministic voiceover is derived from brief fields, not fixed copy. |
| `shotprompt` | subject/contract prompt plus approved requirements/brief/storyboard/material | 分镜生成要求 with `shotImage`, `shotVideo`, `tts.voiceProfile`. |
| `image-prompt` | Deterministic server assembler | Static key-frame prompt and image batch. |
| `video-script` | Deterministic server assembler | Seedance provider prompt, frames, voiceover, voice profile, video batch. |

## 4. Contracts / Interfaces

- `subject.md` is the business creative prompt and can change creative strategy.
- `contract.md` is the engineering contract and changes only with input/output/provider constraints.
- `prompt_assembly` records the module id and an assembly preview for workspace modules.
- Full assembled prompts and provider request/response summaries are internal trace facts, not merchant-facing UI content or public API responses.
- Image prompts must not include video movement, duration, voiceover, or subtitle requirements.
- Video prompts must use selected image frames and must not render voiceover text as on-screen captions.

## 5. Implementation Slices

- Update shared Zod schemas and response formats with prompt contract changes.
- Update subject/contract hashes through assembler metadata.
- Keep provider-specific request/response handling aligned with `docs/reference/`.
- Keep deterministic assembler tests for image/video prompt boundaries.
- Keep deterministic product/storyboard builder tests so mock fallback copy cannot silently enter downstream prompt chains.

## 6. Acceptance Tests

- `pnpm --filter @aigc-video/ai test`
- `pnpm --filter @aigc-video/server test`
- Direct provider probes for manual provider diagnosis only.

## 7. Open Decisions

- A typed prompt registry could make subject/contract ownership stricter, but current file-based registry is sufficient.

## 8. Related Docs

- `architecture/data_model.md`
- `testing/test_strategy.md`
