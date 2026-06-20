# Interface Contract

Status: Accepted
Owner: Project team
Last Updated: 2026-06-20
Applies To: Fastify HTTP API consumed by `apps/web`
Depends On: `contracts/openapi.yaml`, `architecture/runtime_flow.md`, `architecture/data_model.md`
Blocks: Frontend/backend contract changes
Decision State: Accepted

## 1. Executive Summary

All public backend routes use `/api` without URL versioning. The current system is a single-tenant development API with no authentication. Request validation is handled by Zod or equivalent service validation, and business errors return `{ code, message, details? }`.

## 2. Current Reality

The server registers routes in `apps/server/src/app.ts` and module controllers under `apps/server/src/modules/*`. `pnpm contract:frontend-backend` verifies that `contracts/openapi.yaml` covers the frontend API surface used by `apps/web`.

## 3. Target State

- Workspace module endpoints expose proposed/current state and `upstreamChanged` warnings.
- Mutating async endpoints that can duplicate work require `Idempotency-Key`.
- Candidate selection uses current selection artifact rows and does not stale unselected candidates.
- File streaming goes through server proxy URLs for workspace storage and dashboard video artifacts.
- Dashboard video artifacts may be backed by LOCAL files or S3-compatible `dashboard/{finalVideoJobId}/` objects, but consumers only use server proxy URLs.

## 4. Contracts / Interfaces

### Platform

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/health` | Health check with runtime. |
| GET | `/api/config/limits` | Candidate defaults/maxes, worker/provider concurrency, workspace storage kind, aspect ratios. |
| GET | `/api/pipeline/contracts` | Prompt module contract metadata. |
| GET | `/api/setup-templates/creative-requirements` | Built-in four-factor 创作要求 presets. |
| DELETE | `/api/test-runs/:runId` | Test-only cleanup when enabled. |

### Workspace and Materials

| Method | Path | Behavior |
|---|---|---|
| GET/POST | `/api/workspaces` | List or create managed workspaces. |
| POST | `/api/workspaces/directory/select` | Native local directory picker. |
| POST | `/api/workspaces/init` | Find or create local workspace and `.daireel/workspace.json`. |
| GET | `/api/workspaces/:workspaceId/status` | Workspace state, active artifacts, active shot set, active one-click job, next action. |
| GET | `/api/workspaces/:workspaceId/storage` | Active storage binding. |
| POST | `/api/workspaces/:workspaceId/storage/bind` | Bind LOCAL or S3 workspace storage. |
| DELETE | `/api/workspaces/:workspaceId` | Delete registered workspace after running-job checks. |
| POST/DELETE | `/api/workspaces/:workspaceId/materials` | Upload or delete workspace material. |
| GET | `/api/workspaces/:workspaceId/materials/*` | Stream workspace material. |

### Workspace Module Artifacts

The module set is `prompt-requirements`, `material-intake`, `product-brief`, `storyboard`, and `shotprompt`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/workspaces/:workspaceId/{module}` | Returns latest proposed, current approved, and upstream warning. |
| POST | `/api/workspaces/:workspaceId/{module}/propose` | Creates a proposed artifact. |
| POST | `/api/workspaces/:workspaceId/{module}/approve` | Creates the new approved/current artifact. |
| POST | `/api/workspaces/:workspaceId/storyboard/voiceover/propose` | Creates a proposed storyboard with rewritten voiceover only. |
| POST | `/api/workspaces/:workspaceId/reference-video/import` | Imports a direct video URL, a single video file, or multiple reference files (product images `image/*` and `.txt`/`.md` text), returns a four-factor recommendation (`productCategory`, `dealType`, `audience`, `strategy`), and creates proposed prompt requirements before requirements approval. Reference images/text are transient inputs and are not stored as workspace materials. |

### Shot Set and Per-Shot Flow

| Method | Path | Behavior |
|---|---|---|
| GET/POST | `/api/workspaces/:workspaceId/shot-sets` | Read active shot set or apply an approved 分镜生成要求. |
| GET | `/api/workspaces/:workspaceId/shots` | List active shot-set shots. |
| GET | `/api/shots/:shotId` | Shot detail with active prompts/scripts/selections. |
| GET/PATCH | `/api/shots/:shotId/asset-refs` | List or replace editable shot material references. |
| GET | `/api/workspaces/:workspaceId/shot-workflow-status` | Active shot set aggregate status. |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | Create deterministic image prompt and image batch. |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-prompts/regenerate` | Feedback-based image prompt regeneration and image batch. |
| GET | `/api/shots/:shotId/image-prompts` | List image prompt artifacts. |
| GET | `/api/workspaces/:workspaceId/shots/:shotId/image-rounds` | Image rounds, candidates, selection, upstream warning. |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-candidates/regenerate` | No-feedback image candidate reroll. Reuses an active image batch, otherwise creates a new image prompt artifact and batch. |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-candidates/select` | Select succeeded stable image candidate. |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | Create deterministic video script and async video batch. |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-scripts/regenerate` | Feedback-based video script regeneration and video batch. |
| GET | `/api/shots/:shotId/video-scripts` | List video script artifacts. |
| GET | `/api/workspaces/:workspaceId/shots/:shotId/video-rounds` | Video rounds, candidates, preview/stable status, selection, upstream warning. |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-candidates/regenerate` | No-feedback video candidate reroll. Reuses an active video batch, otherwise creates a new video script artifact and async video batch. |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | Select succeeded stable video candidate. |
| POST | `/api/shots/:shotId/retry` | Retry active image or video batch using caller idempotency key. |

### Final Video, Dashboard, Campaign, Trace

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/workspaces/:workspaceId/shot-image-auto-selections` | Start image auto-selection for current active shot set. |
| GET | `/api/shot-image-auto-selections/:jobId` | Read image auto-selection job. |
| GET | `/api/workspaces/:workspaceId/shot-image-auto-selections` | List recent image auto-selection jobs. |
| POST | `/api/workspaces/:workspaceId/one-click-final-videos` | Start one-click final video from material intake draft. |
| GET | `/api/one-click-final-videos/:jobId` | Read one-click job. |
| GET | `/api/workspaces/:workspaceId/one-click-final-videos` | List recent one-click jobs. |
| POST | `/api/workspaces/:workspaceId/final-videos` | Create final compose job from selected videos. |
| GET | `/api/final-videos/:finalVideoJobId` | Read final video job. |
| GET | `/api/workspaces/:workspaceId/final-videos` | List recent final video jobs. |
| GET | `/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | Stream final video file. |
| POST/GET | `/api/workspaces/:workspaceId/dashboard/videos` | Import or list workspace dashboard video artifacts; repeated imports of the same `finalVideoJobId` return the existing artifact. |
| GET | `/api/dashboard/videos` | List global dashboard video artifacts. |
| GET | `/api/dashboard/videos/:artifactId/file` | Stream dashboard MP4 copy from its internal LOCAL/S3 storage locator. |
| GET | `/api/dashboard/recommendations` | 投放策略推荐: per `商品一级类目 × 商品成交类型` group, the best `适用人群` + `推销手法` ranked by a composite of average ROAS (`Σgmv/Σspend`) and per-video GMV. Optional `roasWeight`/`gmvWeight`/`priorStrength` query knobs. Read-only across all workspaces. |
| GET | `/api/dashboard/recommendations/:productCategory/:dealType` | Single-group recommendation (`{ data, meta }`); 400 on invalid factor value, 404 when the group has no data. |
| POST/GET | `/api/workspaces/:workspaceId/campaign-publications` | Create/list KOL/channel placements (`jobId` validated to the workspace; `platform`, `accountName`, `publishedAt`). |
| GET | `/api/workspaces/:workspaceId/campaign-publications/:publicationId` | Read a placement with its latest cumulative metrics. |
| POST | `/api/workspaces/:workspaceId/campaign-publications/:publicationId/metrics` | Append a cumulative metric snapshot (`impressions/clicks/conversions/spendCents/gmvCents`); `ctr/cvr/roas` derived at read time. |
| GET | `/api/workspaces/:workspaceId/traces` | List workspace trace events. |
| GET | `/api/shots/:shotId/traces` | List shot trace events. |

## 5. Implementation Slices

- Keep `contracts/openapi.yaml` aligned with `apps/server/src/modules/*/*.controller.ts`.
- Keep `apps/web/src/lib/api/*` request/response types aligned with OpenAPI and shared schemas.
- The data dashboard UI consumes `/api/dashboard/videos` by default. Workspace-scoped dashboard listing is an explicit scope, not the default behavior of workspace-origin deep links.
- Use `pnpm contract:frontend-backend` before accepting contract-sensitive changes.

## 6. Acceptance Tests

- `pnpm contract:frontend-backend`
- Targeted API tests in `apps/server/src/modules/**`
- Frontend client tests in `apps/web/src/lib/api/**`

## 7. Open Decisions

- Full OpenAPI schema detail can be expanded further for all response bodies; current coverage gates path/method and core shared payloads.

## 8. Related Docs

- `contracts/openapi.yaml`
- `contracts/contract_mapping.md`
- `architecture/data_model.md`
