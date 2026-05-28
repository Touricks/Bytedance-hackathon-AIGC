# Daireel V2 Current Code Architecture

> Snapshot date: 2026-05-28
>
> This document supersedes `arc_v5.md`. It records the V2 per-shot AIGC video pipeline that replaced the V1 one-shot final-video flow. V1 single-script wizard surface (`features/creation/`, `POST /api/workspaces/video/generate`, `media-generate.processor.ts`, the `storyboard_shot` / `generation_job` tables, `workspace_video_archive`) is removed. V0 `CreativeBlueprint` code remains only as package-level legacy schemas and compatibility tests.

## 1. Repository Topology

```text
Bytedancehack/
├── apps/
│   ├── server/          Fastify API; per-shot orchestration; workers; provider boundary
│   └── web/             React focus-mode workspace UI
├── packages/
│   ├── ai/              Provider clients, OpenAI Agents wrappers, prompts, workflows, schemas, trace helpers
│   ├── shared/          Shared domain types, Zod schemas, DTOs, job payload types, deterministic compilers
│   └── config/          Shared ESLint, Prettier, TypeScript config packages
├── docs/                Architecture, PRDs, spec/plans, agent metadata, archived research
├── infra/               Local Docker dependencies (Postgres, Redis, MinIO)
├── storage/             Local runtime artifacts: traces and uploads
├── CONTEXT.md           Domain language and glossary
└── AGENTS.md            Repo-specific agent instructions
```

TypeScript monorepo managed by `pnpm` + Turbo. `apps/server` remains a modular monolith. Postgres is the business fact source; per-shot artifacts, batches, candidates, jobs, traces, and final videos all live there. Local workspace folders carry recovery manifests and final video files but are not the database of record.

## 2. Runtime Flow

```text
apps/web
  -> apps/server Fastify REST API
  -> Postgres via apps/server/src/db/client.ts (db + db.db2)
  -> packages/ai workflows/providers/agents for model calls
  -> generation_v2 queue (BullMQ when USE_REDIS_QUEUE=true, else in-process setTimeout)
  -> ffmpeg local binary for final compose
  -> workspace .daireel/ for final video storage and local trace files
```

V2 per-shot flow:

```text
workspace init -> material import -> brief -> storyboard -> shotprompt approval
  -> storyboard_shots seeded (one row per shot)
  -> per shot:
       image prompt propose -> image batch (N candidates) -> select image
    -> video script propose -> video batch (M candidates) -> select video
  -> final compose (deterministic ffmpeg concat over selected videos)
  -> downloadable MP4 + hashable compiled manifest
```

Editing prompts/scripts mid-flow triggers stale propagation downstream (active video scripts move to `STALE`, selected videos are dropped, etc.). The state machine + nextAction map live in `apps/server/src/modules/shot/shot.state.ts` and are pure functions.

## 3. apps/server

`apps/server` owns HTTP APIs, config loading, DB access, queue topology, workspace lifecycle, and final orchestration.

```text
apps/server/
├── src/
│   ├── app.ts
│   ├── main.ts
│   ├── common/
│   ├── db/
│   ├── modules/
│   │   ├── workspace/      Workspace CRUD, manifest, materials, brief/storyboard/shotprompt approval + shot seeding
│   │   ├── material/       Asset upload + validation
│   │   ├── pipeline/       Read-only V1/V2 pipeline contract registry API
│   │   ├── script/         Legacy single-script reads (kept until UI fully removes V0 surfaces)
│   │   ├── shot/           NEW V2: shot CRUD, state machine, stale rules
│   │   ├── artifact/       NEW V2: image-prompt + video-script versioning
│   │   ├── generation/     NEW V2: image/video/final-compose batches and workers
│   │   ├── job/            NEW V2: generation_v2 queue + generation_jobs repository
│   │   └── trace/          NEW V2: trace_events read/write API
│   └── test/
└── package.json
```

### Entry And Configuration

- `src/main.ts`: server process entrypoint. Calls `assertFfmpegAvailable()` preflight, registers the `generation_v2` processor for image/video/compose, starts the BullMQ worker if `USE_REDIS_QUEUE=true`, then runs `recoverInflightGenerationJobs()` to re-enqueue PENDING/RUNNING jobs after a crash.
- `src/app.ts`: builds Fastify, registers CORS, static upload routes, all API controllers (workspace, material, pipeline, script, **shot**, **generation**, **trace**), the `/api/config/limits` endpoint, the gated `DELETE /api/test-runs/:runId` cleanup endpoint, and DB lifecycle hooks.
- `src/common/config.ts`: loads `.env`, validates required runtime config, resolves upload/workspace paths, exposes `defaultImageBatchSize` / `maxImageBatchSize` / `defaultVideoBatchSize` / `maxVideoBatchSize` (V2 batch limits), `useRedisQueue`, `redisUrl`.
- `src/common/errors.ts`: `toHttpError(err)` + `HttpError(statusCode, code, message)` class. V2 services throw `HttpError` for 4xx flows (e.g. `STALE_SCRIPT`, `COUNT_EXCEEDS_LIMIT`, `IDEMPOTENCY_KEY_REQUIRED`, `NO_SELECTED_IMAGE`).

### Persistence

- `src/db/client.ts`: Postgres client. Exposes:
  - `db` — V1 adapter (`DbAdapter`) for unchanged upstream tables: `product`, `asset`, `creative_workspace`, `workspace_artifact`, `script`.
  - `db.db2` — V2 adapter (`Db2Adapter`) reusing the same pg pool. Implements insert/get/list/update for all V2 tables: `storyboard_shots`, `shot_asset_refs`, `image_prompt_artifacts`, `image_generation_batches`, `image_candidates`, `selected_shot_images`, `video_script_artifacts`, `video_generation_batches`, `video_candidates`, `selected_shot_videos`, `generation_jobs`, `trace_events`, `final_video_jobs`.
- `src/db/schema/schema.sql` and `schema.ts`: V2 schema as the canonical SQL source. Drops the legacy `storyboard_shot`, `generation_job`, and `workspace_video_archive` tables.

Postgres is the source of truth for shot state, artifact versions, candidate selection, job lifecycle, trace events, and final compose manifests. Local files are recovery and asset/video storage, not authority.

### Shot Module — `modules/shot`

- `shot.routes.ts`, `shot.controller.ts`: Fastify routes for shot CRUD, image-prompt propose/edit/list, image batch create/poll/select, video-script propose/edit/list, video batch create/poll/select, shot retry, asset-refs patch. Every batch POST requires `Idempotency-Key` header.
- `shot.service.ts` (`shotWorkflowService`): orchestration. Reads selected images for neighbor-frame continuity when proposing video scripts; computes `nextAction` from state; calls into agents + artifact versioning + generation service.
- `shot.state.ts`: pure functions `canTransition`, `nextStatusAfter`, `getNextAction`. No DB access.
- `shot.stale.ts`: pure stale-propagation rules (image prompt edit → script STALE; image re-select → script STALE + selected video drop; video script replaced → selected video drop). Applied inside the same DB transaction as the upstream change.
- `shot.schema.ts`: Zod request schemas for all shot routes.

### Artifact Module — `modules/artifact`

- `artifact.repository.ts`: thin lookups for active/list image-prompt and video-script artifacts.
- `artifact.versioning.ts`:
  - `createImagePromptVersionAtomic(input)` — BEGIN/UPDATE old ACTIVE→STALE/SELECT max(version)+1/INSERT new ACTIVE/UPDATE storyboard_shots cache column/COMMIT.
  - `createVideoScriptVersionAtomic(input)` — same shape, plus deletes any `selected_shot_videos` row for the shot (because the underlying script is being replaced).

### Generation Module — `modules/generation`

- `generation.service.ts`:
  - `createImageBatch({ workspaceId, shotId, imagePromptArtifactId, count?, aspectRatio, idempotencyKey })` — `ON CONFLICT (idempotency_key) DO NOTHING` dedupe, enforces `resolveBatchCount("image", count)`, inserts batch + generation job rows, transitions shot to `IMAGE_GENERATING`, enqueues `generate_images`.
  - `createVideoBatch({ ... videoScriptArtifactId, count?, aspectRatio, idempotencyKey })` — same shape; rejects with 409 `STALE_SCRIPT` if the script's status isn't ACTIVE.
  - `createFinalCompose({ workspaceId, outputAspectRatio, idempotencyKey })` — validates every shot has a selected video and an active script; snapshots `source_shot_video_ids` and `source_video_script_artifact_ids` in order_index order; inserts `final_video_jobs` + job rows; enqueues `compose_final_video`.
- `generation.controller.ts`: final-video routes (`POST /api/workspaces/:id/final-videos`, `GET /api/final-videos/:id`, `GET .../final-videos`, `GET .../final-videos/:id/file`).
- `image.worker.ts` (`processGenerateImages`): early-return if batch status ≠ `PENDING` (idempotent), calls Ark image provider via `generateImagesWithArk`, inserts SUCCEEDED candidates + pads FAILED rows when provider returns short, transitions shot to `IMAGE_CANDIDATES_READY` or `FAILED`, records trace.
- `video.worker.ts` (`processGenerateVideos`): rejects 409-style if script's status ≠ ACTIVE, fans out `Promise.allSettled` across N Seedance calls (one task per video), inserts SUCCEEDED/FAILED candidates, transitions shot to `VIDEO_CANDIDATES_READY` or `FAILED`.
- `final-compose.worker.ts` (`processComposeFinalVideo`): downloads candidate videos to `<workspace>/.daireel/final/<jobId>/in/`, writes `concat.txt`, runs ffmpeg concat (`-c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -movflags +faststart`), ffprobes the output, persists compiled manifest + sha256 hash. **Must not** import any text/image/video provider module or agents — enforced by `final-compose.boundary.unit.test.ts`.
- `ffmpeg.ts`: `assertFfmpegAvailable()` boot preflight, `runFfmpeg(args)`, `ffprobe(path)`.

### Job Module — `modules/job`

- `job.repository.ts`: arrow-function delegation to `db.db2.insertGenerationJob` / `getGenerationJob` / `updateGenerationJob` (lazy through the `db.db2` getter).
- `job.queue.ts`: single BullMQ queue `generation_v2` with three job kinds (`generate_images` | `generate_videos` | `compose_final_video`). `enqueueGenerationV2(data)` uses BullMQ when `useRedisQueue`, else `setTimeout(...,0)` against a registered processor. `startGenerationV2Worker()` spawns the worker with `concurrency = max(1, MAX_IMAGE_BATCH_SIZE + MAX_VIDEO_BATCH_SIZE)`. `recoverInflightGenerationJobs()` re-enqueues PENDING/RUNNING jobs and bumps RUNNING batches back to PENDING on boot.

### Trace Module — `modules/trace`

- `trace.repository.ts`: arrow-function delegation to `db.db2.insertTraceEvent` / `listTraceEventsByWorkspace` / `listTraceEventsByShot`.
- `trace.service.ts` (`traceService.record(input)`): writes one `trace_events` row per `agent_run | provider_call | job_event | state_transition | user_action`.
- `trace.routes.ts`: `GET /api/workspaces/:id/traces` and `GET /api/shots/:id/traces` (limit/cursor pagination).

The workspace `.daireel/trace/events.jsonl` (`FileTraceLogger`) is kept for local debugging; the DB `trace_events` table is the canonical queryable source.

### Workspace Module

`modules/workspace` remains the upstream lifecycle surface.

- `workspace.controller.ts`: workspace init/list/status, material upload/intake, brief/storyboard/shotprompt propose+approve, feedback routing. The legacy `POST /api/workspaces/video/generate` is removed.
- `workspace.service.ts`: `approveShotPrompt` now seeds `storyboard_shots` (one DRAFT row per shot, ordered by `shot.index`) inside a transaction immediately after persisting the approved `ShotPromptArtifact`. Re-seeding deletes prior shots — V2 does not yet support per-shot insert/delete after seeding.

### Removed Server Surfaces

- `apps/server/src/modules/creation/` — gone.
- `apps/server/src/jobs/processors/media-generate.processor.ts` — gone.
- `apps/server/src/jobs/queue.ts` (legacy `generation_v1`) — gone.
- `apps/server/src/jobs/job-state.ts` — gone.
- `apps/server/src/modules/workspace/workspace.service.ts::startVideoGeneration` — gone.
- `POST /api/workspaces/video/generate` — gone.
- `GET /api/jobs/:jobId` (creation hydration) — replaced by `GET /api/jobs/:jobId` reading `generation_jobs` (generic V2 lookup).

## 4. apps/web

`apps/web` is the React focus-mode workspace UI.

```text
apps/web/
├── public/
├── src/
│   ├── main.tsx                         pathname-based route switch (/ -> App, /workspaces/:id -> WorkspaceLayout)
│   ├── styles.css
│   ├── routes/
│   │   └── App.tsx                      workspace list landing
│   ├── features/
│   │   └── workspace/
│   │       ├── WorkspaceLayout.tsx
│   │       ├── TopBar.tsx
│   │       ├── LeftRail/                ShotList, StepLadder, FinalComposeCta
│   │       ├── AssetRail/               AssetTile, QuickUpload, refs editor
│   │       ├── Focus/                   FocusRouter + 6 step components + shared bits
│   │       ├── TraceDrawer/             cursor-paginated trace event list
│   │       ├── Toasts/                  inline ToastHost + notify()
│   │       ├── state/                   urlState (codec), focusStore (Zustand), stepDerivation
│   │       └── hooks/                   useShotWorkflowStatus, useImageBatch, useVideoBatch, useFinalVideo, useTraceStream, useConfigLimits, useVisibilityActive, useShotAssetRefs
│   └── lib/
│       └── api/                         client.ts (envelope types + fetchJson + brief/storyboard/shotprompt helpers) + 11 per-endpoint modules
└── package.json
```

### Focus Model

- One step in the main area at a time. URL is canonical: `/workspaces/<id>?shot=<shotId>&step=<image_prompt|image_candidates|video_script|video_candidates|review|final_compose>`.
- A Zustand store mirrors URL for ergonomics; both update each other.
- LeftRail keeps shot list + step ladder + final-compose CTA; AssetRail keeps refs + materials + drag-drop + quick upload; TraceDrawer is a collapsible right overlay.
- Default focus on entering a shot matches the backend `nextAction`. Auto-advance after a successful action moves focus to the new `nextAction`'s step.

### Polling

- `useShotWorkflowStatus(workspaceId)` — 3s while any shot is in a `*_GENERATING` or `*_PROPOSING` state, else 30s. Aborts when `document.visibilityState === "hidden"`.
- `useImageBatch(shotId, batchId)` / `useVideoBatch(shotId, batchId)` — 3s / 5s while non-terminal, off when terminal or tab hidden.
- `useFinalVideoJob(jobId)` — 5s while non-terminal.

### Removed Frontend Surfaces

- `apps/web/src/features/creation/` (single-script wizard, JobProgress, VideoPreview) — gone.
- `apps/web/src/lib/job/useGenerationJob.ts` — gone.
- `apps/web/src/lib/api/client.ts::startWorkspaceVideo` and the V1 `/api/jobs/:id` polling helper — gone.

CTA copy is data-driven via `/api/config/limits` — the UI never hard-codes "3 images" or "5 videos".

## 5. packages/ai

`packages/ai` is server-only model integration and pipeline logic. UI code does not import it.

```text
packages/ai/src/
├── agents/                  OpenAI Agents SDK wrappers
│   ├── runner.ts            buildRunner(cfg) + runAgent + loadSystemPrompt + RunnerContext
│   ├── storyboard-image-prompt.agent.ts
│   └── video-shot-script.agent.ts
├── prompts/
│   ├── storyboard-image-prompt/v1.system.md
│   ├── video-shot-script/v1.system.md
│   └── ...                  V1 brief/storyboard/shotprompt/feedback-route prompts kept
├── providers/
│   ├── provider-config.ts   three independent triplets (text/image/video) + maskSecret
│   ├── ark-text.provider.ts unchanged
│   ├── ark-image.provider.ts NEW: Ark Seedream async-task + polling client
│   ├── seedance-video.provider.ts unchanged
│   └── provider-boundary.guard.test.ts boundary scanner allowlist (now includes ark-image)
├── schemas/                 NEW V2 Zod schemas for agent outputs
│   ├── image-prompt.schema.ts  StoryboardImagePromptOutputSchema
│   └── video-script.schema.ts  VideoShotScriptOutputSchema
├── workflows/               brief/storyboard/shotprompt/feedback-route + NEW mock-mode wrappers for the two new agents
│   ├── storyboard-image-prompt.workflow.ts  runStoryboardImagePromptAgent
│   └── video-shot-script.workflow.ts        runVideoShotScriptAgent
├── trace/trace-log.ts       FileTraceLogger; pipeline union now includes "shot_image"
├── contracts/, probes/, legacy/, smoke/, env.ts, index.ts
```

### Provider Config — Three Independent Triplets

```text
TEXT_API_KEY      > AI_TEXT_API_KEY      > ARK_API_KEY
TEXT_BASE_URL     > AI_TEXT_BASE_URL     > ARK_BASE_URL  > DEFAULT_ARK_BASE_URL
TEXT_ENDPOINT_ID  > AI_TEXT_ENDPOINT_ID  > ARK_TEXT_ENDPOINT_ID

IMAGE_API_KEY     > AI_IMAGE_API_KEY                              (no ARK alias)
IMAGE_BASE_URL    > AI_IMAGE_BASE_URL    > DEFAULT_ARK_BASE_URL
IMAGE_ENDPOINT_ID > AI_IMAGE_ENDPOINT_ID

VIDEO_API_KEY     > AI_VIDEO_API_KEY     > ARK_API_KEY
VIDEO_BASE_URL    > AI_VIDEO_BASE_URL    > ARK_BASE_URL
VIDEO_ENDPOINT_ID > AI_VIDEO_ENDPOINT_ID > ARK_VIDEO_ENDPOINT_ID
```

Each resolver returns `null` when required fields are missing. With `MODEL_MODE=real`, service boot fails fast. Secrets pass through `maskSecret(value)` before any log/trace output.

### Agents (OpenAI Agents SDK)

- `buildRunner(cfg)` wires an `@openai/agents@0.0.5` Runner against an OpenAI-compatible base URL via `OpenAIProvider({ apiKey, baseURL, useResponses: false })`.
- `buildStoryboardImagePromptAgent(model)` and `buildVideoShotScriptAgent(model)` build agents with `instructions` loaded from the v1 system prompts and `outputType` bound to the Zod schemas.
- `runAgent({ agent, input, context, runner, maxTurns? })` `JSON.stringify`s the input, calls `runner.run(...)`, throws `AGENT_EMPTY_FINAL_OUTPUT` if no final output, returns the typed result.
- Workflow wrappers short-circuit to deterministic fixtures when `MODEL_MODE != "real"` so dev and unit tests run without provider keys.

### Provider Boundary

`final-compose.worker.ts` must not import any text/image/video provider or `packages/ai/agents` module. Enforced by a static-import scan in `final-compose.boundary.unit.test.ts`.

## 6. packages/shared

```text
packages/shared/src/
├── constants/
├── dto/
├── jobs/types.ts          V1 generation_v1 types + V2: GENERATION_V2_QUEUE_NAME, GenerationV2JobData (generate_images | generate_videos | compose_final_video)
├── schemas/               V1 artifacts (brief/storyboard/shotprompt/feedback) + V0 legacy
├── shotprompt/compiler.ts deterministic compiler from approved storyboard to shotprompt artifact
├── types/domain.ts
└── index.ts
```

Shared rule: keep provider SDKs and server-only deps out.

## 7. packages/config

Centralized ESLint / Prettier / TypeScript config packages, imported by workspace packages.

## 8. docs

```text
docs/
├── arc_v6.md                       this current code-structure map
├── arc_v5.md                       prior snapshot (kept for context)
├── erd.md                          V2 data model reference
├── architecture.md                 short architecture entrypoint
├── 0528-agent-arc/
│   ├── spec/                       V2 design spec (per-shot pipeline)
│   ├── plans/                      backend + frontend implementation plans
│   └── ...                         supporting design docs
├── agents/                         issue tracker, labels, routing
├── archived/                       older arc/discussion/PRD history
├── reference/                      provider/API reference notes
└── deep_research/
```

## 9. infra and storage

### infra

- `infra/docker-compose.yml`: local Postgres, Redis, MinIO. Postgres required. Redis optional (BullMQ when `USE_REDIS_QUEUE=true`).
- `ffmpeg` must be on `PATH` for the final-compose worker. Server boot runs `assertFfmpegAvailable()` and fails fast with an install hint.

### storage

`storage/` is local runtime data, not product source. Repo-local `storage/trace` is deprecated for current product traces; the system writes:

- Postgres `trace_events` rows — canonical queryable source.
- Workspace-local `.daireel/trace/events.jsonl` — local debugging via `FileTraceLogger`.

Per-workspace `.daireel/` layout:

```text
<workspace>/
├── .daireel/
│   ├── workspace.json
│   ├── trace/events.jsonl
│   ├── materials/                  managed material files
│   └── final/<finalVideoJobId>/    downloaded source clips + concat.txt + final.mp4
└── user material files
```

## 10. Boundaries and Ownership Rules

- Frontend calls `apps/server` APIs through `apps/web/src/lib/api/*.ts`; it does not call provider SDKs directly.
- Server modules call `packages/ai` workflows / providers / agents; they do not construct model clients inline.
- `packages/ai` may depend on `packages/shared`; `packages/shared` must not depend on `packages/ai`.
- `apps/server/src/modules/generation/final-compose.worker.ts` must not import text/image/video providers or agents (boundary-tested).
- Postgres owns shot state, artifact versions, batch/candidate facts, job lifecycle, and final-compose manifests. Local workspace manifests + downloaded clips support recognition and recovery.
- Provider trace belongs at provider/workflow boundaries (DB `trace_events` + workspace JSONL), not in UI components.
- V2 exposes one creative line per workspace (`creative_workspace.current_script_id`). Per-shot edit/insert/delete after seeding remains future scope.

## 11. Idempotency, Recovery, Limits

- Every batch POST and final-compose POST requires an `Idempotency-Key` header. `ON CONFLICT (idempotency_key) DO NOTHING RETURNING *` dedupes; conflict returns the existing row without re-enqueueing.
- `GET /api/workspaces/:id/shot-workflow-status` returns per-shot status + `activeImageBatchId` / `activeVideoBatchId` so the UI can resume polling after a refresh without remembering anything.
- `recoverInflightGenerationJobs()` on boot: bumps RUNNING batches back to PENDING and re-enqueues any PENDING/RUNNING `generation_jobs` whose `queue_job_id` is null (in-process mode). BullMQ persistence handles the Redis case.
- `GET /api/config/limits` returns `{ defaultImageBatchSize, maxImageBatchSize, defaultVideoBatchSize, maxVideoBatchSize, aspectRatios }`. Defaults `3 / 6 / 5 / 10`. UI labels are data-driven.

## 12. Testing

- Unit tests run via `node --test` + `tsx`. Two new gates: `apps/server/src/modules/shot/shot.state.unit.test.ts` (state machine + nextAction exhaustiveness), `apps/server/src/modules/generation/final-compose.boundary.unit.test.ts` (provider-boundary static import scan).
- Integration tests under `apps/server/test/integration/`, tagged `@smoke` / `@provider` / `@expensive`. They hit real provider endpoints (no mocks in integration scope). Gated by `RUN_REAL_PROVIDER_TESTS=true`; `@expensive` additionally requires `ALLOW_EXPENSIVE_TESTS=true`.
- CI: PR runs unit. Main merge runs `@smoke`. Nightly + manual dispatch runs `@provider` and `@expensive`.

## 13. Removed / Deprecated (compared with arc_v5)

- Legacy V1 single-shot pipeline: `creation` module, `media-generate.processor.ts`, legacy `jobs/queue.ts`, `startVideoGeneration`, `POST /api/workspaces/video/generate`.
- Legacy V1 schema tables: `storyboard_shot`, `generation_job`, `workspace_video_archive`.
- Legacy frontend wizard: `features/creation/*`, "one-click video" CTA, `useGenerationJob`.
- V0 `creative-blueprint` / `regenerate-shot` workflows remain only in `packages/ai/src/legacy/` for compatibility tests; they are not on any active V2 path.

## 14. Deferred (explicit non-goals)

- Per-shot insert/delete/reorder after seeding.
- PromptReviewAgent / ScriptReviewAgent / ArtifactRepairAgent (auto-repair loop hooks exist in spec but no runtime path yet).
- DecisionPlannerAgent + tree/model/hybrid decision modes.
- Final-compose enhancements: crossfade, BGM, TTS, subtitles. Manifest schema reserves nullable fields.
- Partial-candidate re-generation (retry only failed videos within a batch).
- SSE / WebSocket for batch and trace streaming.
- Removal of `workspace_video_archive` references in archived design docs.
