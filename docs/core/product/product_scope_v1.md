# Product Scope V1

Status: Accepted
Owner: Product
Last Updated: 2026-06-08
Applies To: V3 merchant-facing AIGC commerce video generation
Depends On: `../../../CONTEXT.md`, `../archived/arc_v3.md`, `../archived/factor_artifact.md`
Blocks: Domain and runtime architecture
Decision State: Accepted with assigned open decisions

## 1. Executive Summary

The product helps merchants turn structured 创作要求 and uploaded 商品素材 into
reviewable creative artifacts and a composed commerce short video. The core value
loop is not raw prompt editing: merchants approve 素材解读, 商品卖点, 分镜脚本,
分镜生成要求, 分镜图选择, 分镜视频选择, and then create a 成片 with campaign
publication tags for later dashboard analysis.

## 2. Current Reality

- Runtime is a pnpm workspace with `apps/server`, `apps/web`,
  `packages/ai`, `packages/shared`, and `packages/storage`.
- The current frontend target is `apps/web`; default local ports are API `3000`
  and web `5173`.
- Backend is Fastify + PostgreSQL + BullMQ/Redis + workspace storage adapters.
- Workspace module artifacts are module-owned tables, not the legacy
  `workspace_artifact` main path.
- Real provider calls use Ark text, Seedream image, and Seedance video through
  `packages/ai`; mock mode remains the default test path.
- There is no official active full real-provider smoke script. Direct provider
  probes under `scripts/` are manual diagnosis only.

## 3. Target State

V3 keeps the merchant in a 创作审核台 where every downstream artifact reads only
approved/current upstream content. The system may surface 上游变更提示, but it
must not automatically delete downstream candidates, selections, or final
outputs. The target experience has two supported routes:

- Manual review chain: approve each artifact, explicitly apply a shot set,
  generate/select per-shot images and videos, then compose final video.
- 一键成片: start from the 素材解读 review page, approve the submitted draft, and
  automatically advance existing artifact/candidate/selection/final-compose
  steps.

## 4. User Stories

| ID | User story | Priority |
|---|---|---|
| U1 | As a merchant, I want to choose or edit structured 创作要求 so downstream creative work matches my product, audience, and selling strategy. | P0 |
| U2 | As a merchant, I want uploaded materials interpreted into roles and relevance so I can approve which facts guide generation. | P0 |
| U3 | As a merchant, I want to review 商品卖点, 分镜脚本, and 分镜生成要求 before media generation so I can control the creative direction. | P0 |
| U4 | As a merchant, I want to generate and select per-shot image/video candidates without losing old choices after upstream changes. | P0 |
| U5 | As a merchant, I want to compose a final video only after every required 分镜视频选择 exists. | P0 |
| U6 | As an operator, I want final videos and publications to preserve creative factor tags for dashboard aggregation. | P1 |

## 5. Demo Scope

```text
workspace is created / bound
-> merchant submits 创作要求 and uploads materials
-> material-intake propose / approve
-> product-brief propose / approve
-> storyboard propose / approve
-> shotprompt propose / approve
-> shot-set apply
-> image prompt propose, image batch, image select
-> video script propose, video batch, video select
-> final compose
-> optional campaign publication with creative tags
```

## 6. Non-Goals

- Merchant-facing raw provider prompt editing.
- Automatic deletion of downstream candidates or selections after upstream
  changes.
- Treating `shotprompt approve` as shot-set creation.
- Treating candidate counts as persistent 创作要求 fields.
- A guarded official full real-provider smoke suite in package scripts.
- Production auth or tenant isolation for the local hackathon demo unless a
  follow-up security slice explicitly adds it.

## 7. Acceptance Tests

- [ ] `pnpm contract:frontend-backend` passes after contract changes.
- [ ] `pnpm --filter @aigc-video/shared test` covers shared schema invariants.
- [ ] `pnpm --filter @aigc-video/ai test` covers prompt assembly and provider
      response repair/validation.
- [ ] `pnpm --filter @aigc-video/server test` covers module artifact lifecycle,
      shot set apply, generation workers, final compose, and campaign tags.
- [ ] `pnpm --filter @aigc-video/web test` covers frontend adapters,
      viewmodels, and review components touched by a slice.
- [ ] Browser or Playwright evidence exists for UX changes in `apps/web`.

## 8. Open Decisions

| Decision | Owner | Current recommendation |
|---|---|---|
| Production auth and tenant model | Backend + Security | Keep out of local demo scope; require a security-sensitive slice before internet exposure. |
| Full real-provider E2E automation | QA + Backend | Keep manual direct probes only until provider-cost and stability gates are agreed. |
| Multi-line creative workspaces | Product + Backend | V1 exposes one current 创作线路 per 创作工作目录. |

## 9. Related Docs

- `../architecture/domain_v1.md`
- `../architecture/runtime_flow_v1.md`
- `../contracts/contract_mapping_v1.md`
- `../testing/test_strategy_v1.md`
