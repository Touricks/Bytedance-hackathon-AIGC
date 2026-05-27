# Review note 2026-05-23: architecture conformance

## Question

观察系统架构，是否满足我们提出的架构文档 `docs/arc_codex_r3.md`、`docs/plan_0523/proposed_architecture.md` 所需的功能？如果满足，参考 `arc_codex_r3.md` 写入当前架构文档 `docs/arc_codex_r4.md`。若不满足，结合 `$to-issue` 提出修正方案。

## Verdict

当前代码版本 **不完全满足** 两份架构文档的承诺。

It does satisfy the V0 demo shape:

- Monorepo layout exists: `apps/web`, `apps/server`, `packages/shared`, `packages/ai`, `packages/config`.
- There is no premature `apps/worker`, `packages/video`, or `packages/ui`.
- `apps/server` is a modular Fastify server with embedded job processors.
- The current user path is two-step: create creative blueprint first, then create a video generation job from `scriptId`.
- `StoryboardShot` is kept as script structure and prompt inspiration, not a render slice.
- Seedance whole-video prompt generation is implemented as a single 12-second prompt.
- Local product-image upload, read-only blueprint preview, job polling, preview/export, mock fallback video, and model-provider fallbacks are present.

However, it does **not** yet satisfy the architecture's durability and runtime contract:

- The architecture says Postgres is the business fact source, but runtime storage is currently in-memory `Map`s.
- The architecture says Product / Script / StoryboardShot / GenerationJob are persisted and retrievable as stable facts, but they are lost on server restart.
- `DATABASE_URL` is present in `.env.example`, and `schema.sql` exists, but the server config and dependencies do not wire Postgres into runtime code.
- Job progress/status semantics are only partially aligned: media generation sets `stage: "media_generating"` but does not set `status: "running"`.
- Real Ark/Seedance validation is not enforced at startup or by a smoke gate, so missing credentials silently falls back to mock/fallback providers. This is useful for local development, but not sufficient as the P0 acceptance path.

Because of these gaps, `docs/arc_codex_r4.md` was **not** generated in this turn. The right next step is to fix the mismatches first, then write r4 as the "current implemented architecture" document.

## Evidence

### Satisfied architecture points

The web app performs the V0 two-step flow:

- `createCreativeBlueprint` happens first.
- The returned `scriptId` is kept in UI state.
- `createGenerationJob({ scriptId })` happens only after user action.
- `useGenerationJob(jobId)` polls the async generation job.

Relevant files:

- `apps/web/src/routes/App.tsx`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/job/useGenerationJob.ts`

The server exposes the two-command API shape:

- `POST /api/creative-blueprints`
- `GET /api/creative-blueprints/:scriptId`
- `POST /api/creation/jobs`
- `GET /api/jobs/:jobId`

Relevant files:

- `apps/server/src/modules/creative-blueprint/creative-blueprint.controller.ts`
- `apps/server/src/modules/creation/creation.controller.ts`

The Seedance prompt follows the r3 architectural decision:

- One whole-video prompt.
- Product image as source of truth.
- 0-3s hero, 3-8s benefit/use context, 8-12s CTA.
- Storyboard shots are inspiration only, not stitched clips.

Relevant file:

- `packages/ai/src/prompts/video.prompt.ts`

### Gaps

#### Gap 1: Postgres fact source is not implemented

`apps/server/src/db/schema/schema.sql` defines the intended tables, but runtime code does not use Postgres. The actual runtime DB is:

```ts
const products = new Map<string, Product>();
const assets = new Map<string, Asset>();
const jobs = new Map<string, GenerationJob>();
const scripts = new Map<string, Script>();
const shotsByScript = new Map<string, StoryboardShot[]>();
```

This makes script IDs, frozen blueprints, generation jobs, traces, and final assets non-durable.

Supporting observations:

- `apps/server/src/db/client.ts` is an in-memory adapter.
- `apps/server/src/common/config.ts` does not read `DATABASE_URL`.
- `apps/server/package.json` has no Postgres client dependency.

#### Gap 2: Job status contract is inconsistent

The architecture describes a status/stage contract where jobs can be queued, running, completed, or failed. Current media generation updates `stage` and `progress`, but does not switch `status` from `queued` to `running`.

Observed behavior:

```ts
db.updateJob(jobId, {
  stage: "media_generating",
  progress: 70
});
```

The frontend displays `job.status`, so a user can see a job that is still `queued` while its stage says media generation has already started.

Relevant files:

- `apps/server/src/jobs/processors/media-generate.processor.ts`
- `apps/web/src/features/creation/JobProgress.tsx`

#### Gap 3: Real model acceptance path is not enforced

The architecture states that P0 must have a real Ark text model and real Seedance path, while mock providers are development/demo fallback only. The code supports real providers, but missing config silently falls back:

- Text generation returns provider `fallback` if no OpenAI-compatible key/model is configured.
- Seedance returns provider `mock` if no Seedance URL/key is configured.

This is useful locally, but it needs an explicit smoke gate or runtime mode so P0 acceptance cannot accidentally pass with fallback providers.

Relevant files:

- `packages/ai/src/workflows/creative-blueprint.workflow.ts`
- `packages/ai/src/providers/seedance-video.provider.ts`
- `.env.example`

## `$to-issue` correction plan

Do not publish these issues yet; this is the proposed vertical-slice breakdown for approval.

### 1. Persistent V0 creative workflow facts

- Type: AFK
- Blocked by: None
- User stories covered: upload product image, generate creative blueprint, retrieve blueprint by `scriptId`, freeze blueprint when a video job is created, create multiple generation attempts from one frozen script.

What to build:

Implement a real Postgres-backed fact source for V0 entities while preserving the existing API and service behavior. Product, Asset, Script, StoryboardShot, and GenerationJob should survive server restarts and remain retrievable by their stable IDs.

Acceptance criteria:

- `DATABASE_URL` is read from server config.
- The server has a Postgres client/migration path for the existing schema.
- `POST /api/creative-blueprints` persists Product / Asset / Script / StoryboardShot.
- `GET /api/creative-blueprints/:scriptId` works after server restart.
- `POST /api/creation/jobs` freezes the script and persists GenerationJob.
- Existing lifecycle tests pass against the durable repository path.

### 2. Durable generation job state and queue semantics

- Type: AFK
- Blocked by: Persistent V0 creative workflow facts.
- User stories covered: create one-key video job, poll progress, read failure reason, retry by creating another generation job from the same frozen script.

What to build:

Align the runtime job state machine with the documented contract and make progress updates durable across in-process and Redis/BullMQ execution.

Acceptance criteria:

- A generation job starts as `queued`.
- When media generation starts, status becomes `running` and stage becomes `media_generating`.
- Completion persists `completed`, `completed`, `100`, and `finalAssetId`.
- Failures persist `failed`, `failed`, `100`, and readable `errorMessage`.
- In-process queue and Redis/BullMQ worker use the same transition helper.
- `GET /api/jobs/:jobId` returns consistent status/stage/progress after server restart.

### 3. Real-provider acceptance mode and smoke gate

- Type: AFK
- Blocked by: None.
- User stories covered: demo operator can prove real Ark text generation and real Seedance video generation are configured before a judged run.

What to build:

Add an explicit runtime mode or smoke command that fails when the system is expected to use real providers but would fall back to mock/template providers.

Acceptance criteria:

- There is a documented `MODEL_MODE=mock|real` or equivalent config.
- In real mode, missing text model credentials fail before blueprint generation silently falls back.
- In real mode, missing Seedance credentials fail before video generation silently uses the fallback video.
- Ark/OpenAI-compatible env aliases are documented and tested.
- A smoke command verifies blueprint generation provider is `ark` and video generation provider is `seedance`.

### 4. Reloadable V0 review links

- Type: AFK
- Blocked by: Persistent V0 creative workflow facts.
- User stories covered: reviewer can refresh or reopen a generated blueprint/job and still inspect the current script, shots, progress, final video, and failure reason.

What to build:

Make the V0 UI resilient to refresh by exposing stable URLs or query-state for `scriptId` and `jobId`, backed by the existing read APIs.

Acceptance criteria:

- After creating a creative blueprint, the UI can reload and recover the blueprint from `scriptId`.
- After creating a generation job, the UI can reload and continue polling from `jobId`.
- A completed job can be reopened and still shows script, shots, and final asset.
- Failure details survive reload.

## Approval questions

1. Is this granularity right, or should Postgres persistence and job state be merged into one larger issue?
2. Should the real-provider smoke gate be required before r4, or can it remain a demo-readiness follow-up?
3. Do reloadable V0 review links belong in P0 bug fix, or should they stay P1 demo hardening?

## Published GitHub issues

Published on 2026-05-23 using `$to-issue` vertical-slice structure and `$triage` labels. Each issue body starts with the required AI triage disclaimer and carries exactly one category label plus one state label.

| Issue | Title | Labels | Blocked by |
| --- | --- | --- | --- |
| [#10](https://github.com/Touricks/Bytedance-hackathon-AIGC/issues/10) | Persist V0 creative workflow facts in Postgres | `bug`, `ready-for-agent` | None |
| [#11](https://github.com/Touricks/Bytedance-hackathon-AIGC/issues/11) | Make generation job state durable and consistent | `bug`, `ready-for-agent` | #10 |
| [#12](https://github.com/Touricks/Bytedance-hackathon-AIGC/issues/12) | Add real-provider acceptance mode and smoke gate | `bug`, `ready-for-agent` | None |
| [#13](https://github.com/Touricks/Bytedance-hackathon-AIGC/issues/13) | Make V0 blueprint and job review links reloadable | `bug`, `ready-for-agent` | #10 |
