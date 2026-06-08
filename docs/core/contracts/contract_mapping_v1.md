# Contract Mapping V1

Status: Accepted
Owner: API + Frontend + QA
Last Updated: 2026-06-08
Applies To: API, runtime schemas, persistence, frontend viewmodels, and tests
Depends On: `openapi.yaml`, `interface.md`, `../../../packages/shared/src/schemas`, root compatibility mirrors
Blocks: Contract-changing implementation
Decision State: Accepted with assigned open decisions

## 1. Executive Summary

The template-aligned public API contract is documented in
`docs/core/contracts/openapi.yaml` and `docs/core/contracts/interface.md`.
`docs/core/openapi.yaml` and `docs/core/interface.md` remain compatibility
mirrors for existing repo scripts and guidance. Runtime validation and shared
domain schemas live in `packages/shared/src/schemas/*`; AI/provider response schemas live in
`packages/ai/src/contracts/response-formats.ts` and `packages/ai/src/schemas/*`.
Backend services own persistence and serialization. Frontend clients in
`apps/web/src/lib/api/*` and viewmodels in `apps/web/src/features/*` must be
updated with any contract-changing backend behavior.

## 2. Contract Layers

| Layer | File/module | Owner | Purpose |
|---|---|---|---|
| Product | `docs/core/product/product_scope_v1.md`, `CONTEXT.md` | Product | User value and business language |
| API | `docs/core/contracts/openapi.yaml`, `docs/core/contracts/interface.md`, root mirrors | API + Frontend | Public REST behavior |
| Runtime schema | `packages/shared/src/schemas/artifacts.ts`, `creative-factors.ts`, `storyboard-script.ts`, `packages/ai/src/contracts/response-formats.ts` | API/Core | Zod and provider JSON-schema validation |
| Persistence | `apps/server/src/db/schema/schema.sql` | Backend | Tables, indexes, job facts, artifact lifecycle |
| Backend API | `apps/server/src/modules/*/*.controller.ts`, service modules | Backend | Route parsing, business rules, transactions |
| AI provider | `packages/ai/src/workflows/*`, `packages/ai/src/providers/*` | AI + Backend | Prompt assembly, provider config, response repair |
| Frontend adapter | `apps/web/src/lib/api/*` | Frontend | Request/response projection |
| Frontend viewmodel | `apps/web/src/features/creative-review/**`, dashboard modules | Frontend | UI state and merchant-facing labels |
| Test contract | package tests plus `scripts/frontend-backend-contract-check.mjs` | QA + Engineering | Regression evidence |

## 3. Direction Of Dependency

```text
Product language / product scope
-> docs/core API contract
-> shared/provider runtime schemas
-> backend controller/service/repository
-> frontend API adapter/viewmodel/component
-> package tests and contract check
```

## 4. Current Contract Anchors

| Contract area | Canonical code source | Documentation source |
|---|---|---|
| Creative factors and templates | `packages/shared/src/schemas/creative-factors.ts`, `packages/shared/src/setup_template/creative-requirements.ts` | `../archived/factor_artifact.md`, this file |
| Workspace module artifacts | `packages/shared/src/schemas/artifacts.ts`, workspace services | `../archived/prompt_artifact.md`, `domain_v1.md` |
| Prompt assembly | `packages/ai/src/prompts/module-prompt-assembler.ts`, prompt module dirs | `../archived/prompt_workflow.md`, `../archived/prompt_artifact.md` |
| Per-shot deterministic prompts | `apps/server/src/modules/shot/prompt-assembler.ts` | `../archived/prompt_workflow.md`, `domain_v1.md` |
| P0 storyboard invariant | `packages/shared/src/schemas/storyboard-script.ts` | `../archived/prompt_workflow.md`, `domain_v1.md` |
| Shotprompt/storyboard match invariant | `assertShotPromptMatchesStoryboard` in `packages/shared/src/schemas/artifacts.ts` | `../archived/prompt_workflow.md`, `domain_v1.md` |
| Provider config env | `packages/ai/src/providers/provider-config.ts` | `security_v1.md`, `AGENTS.md` |
| Generation workers | `apps/server/src/modules/generation/*worker*` | `runtime_flow_v1.md`, `test_strategy_v1.md` |
| Campaign/dashboard tags | campaign/dashboard services and schema SQL | `factor_artifact.md`, `domain_v1.md` |

## 5. Drift Checklist

Use this checklist for any contract-changing change:

- [ ] `docs/core/contracts/openapi.yaml` and root mirror
      `docs/core/openapi.yaml` updated when route, request, response, status, or
      error code changes.
- [ ] `docs/core/contracts/interface.md` and root mirror
      `docs/core/interface.md` updated with behavior, lifecycle, and UI notes.
- [ ] `packages/shared` Zod schema updated for runtime contracts.
- [ ] `packages/ai` response format updated when provider output JSON changes.
- [ ] Backend controller/service tests updated.
- [ ] Frontend API adapter and viewmodel tests updated.
- [ ] `pnpm contract:frontend-backend` run when frontend/backend API shape changes.
- [ ] Prompt-chain docs updated when subject/contract templates,
      deterministic assemblers, or trace persistence change.
- [ ] `docs/core/archived/erd.md` and root mirror `docs/core/erd.md` updated when
      table fields, indexes, or job states change.

Creative factor contract notes:

- `creativeFactors.audience` includes `general` for merchant-facing 「不限定」.
- `creativeFactors.strategy` includes `visual-story` for merchant-facing
  「视觉叙事」.
- `creativeFactors.visualStyle` is additive and defaults to `authentic`; reference
  video recommendation responses may omit it and let shared schema fill the
  default.
- Empty `factorGuidance.audience.*` strings are valid saved artifact data and
  mean 不限定特定人群 for prompt context formatting.
- Material-intake artifacts normalize the primary material role from
  `primaryProductRef`: only that asset may remain `product_main`; duplicate
  product-main labels are downgraded by material kind before AI workflow,
  backend persistence, or frontend rendering consumes the artifact.
- One-click final video active polling is frontend-owned in
  `useWorkbenchViewModel`: active `PENDING/RUNNING/WAITING` one-click summary or
  list jobs poll every 5 seconds; idle state polls every 15 seconds. The shared
  progress component is pure display and derives progress from durable job
  stage state.

## 6. Known Drift Controls

- `docs/core/contracts/openapi.yaml` is the template-aligned contract path.
  `docs/core/openapi.yaml` is a compatibility mirror because
  `scripts/frontend-backend-contract-check.mjs` still reads the flat path.
  Keep both copies in sync on contract edits until a sync script or symlink
  policy replaces the mirror.
- `materialIntakeImageInputsForWorkspace` and image-capable workflow options
  exist in code, but `materialIntakeV2Service.propose` currently does not pass
  image inputs. Docs should continue to describe material-intake as text-only
  until that service behavior changes.
- Product-brief real mode is the image-grounded text-provider module; tests
  assert primary image is sent as `image_url`.
- Per-shot image/video prompt docs must point to the server deterministic
  assembler, not `packages/ai/src/prompts/modules/*` subject/contract templates.

## 7. Open Decisions

| Decision | Owner | Current recommendation |
|---|---|---|
| Replace root OpenAPI mirror with generated sync/symlink | API + Docs | Needs Spike; keep the root mirror until `pnpm contract:frontend-backend` reads the template path. |
| Generate typed frontend client from OpenAPI | Frontend + API | Needs Spike; current client is hand-written and guarded by contract tests. |
| Schema version compatibility policy | API + QA | Keep strict parse and repair tests for P0; add compatibility tests before public API versioning. |
