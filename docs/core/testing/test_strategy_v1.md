# Test Strategy V1

Status: Accepted
Owner: QA + Engineering
Last Updated: 2026-06-08
Applies To: Unit, integration, contract, E2E, and provider-probe evidence
Depends On: `../architecture/domain_v1.md`, `../architecture/runtime_flow_v1.md`, `../contracts/contract_mapping_v1.md`
Blocks: Implementation gate
Decision State: Accepted with assigned open decisions

## 1. Executive Summary

Tests should prove the current artifact lifecycle, prompt assembly boundary,
P0 storyboard/shotprompt invariants, candidate/selection persistence, final
compose, and frontend recovery behavior. Mock mode is the default automated
path. Real-provider scripts are direct probes for manual diagnosis and do not
replace workspace-chain tests.

## 2. Test Pyramid

```text
many unit tests: shared schemas, prompt builders, services, workers
some integration/API tests: workspace route chain, generation flow, campaign/dashboard
few E2E/contract tests: frontend-backend API shape and critical browser journeys
manual provider probes: direct image/video endpoint diagnosis only
```

## 3. Ownership Matrix

| Area | Test type | Must cover |
|---|---|---|
| Shared domain schemas | `pnpm --filter @aigc-video/shared test` | creative factors, setup templates, storyboard P0 rules, shotprompt/storyboard match |
| AI workflows | `pnpm --filter @aigc-video/ai test` | module prompt assembly, response formats, provider output repair, shot count/index rejection |
| Workspace API | `pnpm --filter @aigc-video/server test` | propose/approve lifecycle, upstreamChanged, material upload/delete, product-brief image input |
| Shot workflow | server tests | shot-set apply, image/video prompt artifacts, rounds, current selections, upstream hints |
| Generation workers | server tests | image/video provider calls, asset persistence, `PERSISTING`, final compose |
| Orchestrators | server tests | one-click final video and shot-image auto-selection idempotence/selection rules |
| Campaign/dashboard | server/web tests | creative tag copy, metrics mutation, dashboard display |
| Frontend API/viewmodels | `pnpm --filter @aigc-video/web test` | API adapters, requirements form, review desk state, one-click progress/polling, business labels |
| Contract | `pnpm contract:frontend-backend` | frontend client expectations vs backend/OpenAPI shape |
| Browser journey | `pnpm --filter @aigc-video/web test:e2e` when UI changes | critical creative review journey and no mock-only labels in main UI |

## 4. Fixtures

- Use mock provider mode by default for package tests.
- Use workspace-bound temporary local storage for server tests.
- Use deterministic image/video data URLs or tiny media fixtures where possible.
- Do not depend on real provider credentials in CI.
- Manual provider probes:
  - `node scripts/verify-provider-image.mjs --json`
  - `node scripts/verify-provider-video.mjs --image-url <url> --json`

## 5. Implementation Gates

| Slice | Required tests |
|---|---|
| API/contract change | Backend route/service test, shared schema test when schema changes, frontend adapter test, `pnpm contract:frontend-backend` |
| Prompt template or response-format change | AI prompt/response-format tests, provider output parse/repair tests, docs update in prompt workflow/artifact files |
| Per-shot deterministic assembler change | Shot service tests for prompt artifact, reference ordering/filtering, source fingerprint, and no selection deletion |
| Worker/generation change | Unit tests with provider overrides plus trace/persistence assertions |
| Frontend review-flow change | Component/viewmodel tests and Playwright screenshot/browser evidence for visual behavior |
| One-click progress or polling change | `oneClickProgress.test.ts`, `oneClickState.test.ts`, affected review-panel component tests, and typecheck |
| DB migration/schema change | Migration/schema review, repository/service tests, ERD update |
| Security-sensitive change | Negative tests for auth/tenant/upload/trace/secret behavior and security review |

## 6. Commands

```sh
pnpm typecheck
pnpm lint
pnpm contract:frontend-backend
pnpm --filter @aigc-video/shared test
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test
pnpm --filter @aigc-video/web test
```

## 7. Open Decisions

| Decision | Owner | Current recommendation |
|---|---|---|
| Official full real-provider smoke | QA + Backend + Product | Keep absent until cost/stability policy is accepted; direct probes remain manual. |
| E2E fixture standard | QA + Frontend | Prefer mock provider fixtures and stable selectors; avoid live provider dependencies. |
| Contract generation | API + Frontend | Needs Spike before replacing hand-written clients. |
