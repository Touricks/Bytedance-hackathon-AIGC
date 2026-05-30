# Storyboard → Image → Video Per-Shot Pipeline — Design Spec

> Date: 2026-05-28
> Status: Approved for implementation (P0)
> Scope: Backend per-shot pipeline (image prompts, image candidates, video scripts, video candidates, final compose) + provider config refactor + frontend focus-mode overhaul. No back-compatibility with the existing single-shot `POST /api/workspaces/video/generate` flow.
> Source design docs: `../openai_agents_sdk_api_design.md`, `../storyboard_image_video_workflow_design.md`, `../backend_module_test_strategy.md`, `../PRD Engineering Side.pdf`.

---

## 1. Goals

Replace the current one-shot final-video pipeline with a per-shot workflow that supports:

1. Per-shot image prompt → N candidate images → user select.
2. Per-shot video script (based on the selected image and neighbor frames) → M candidate videos → user select.
3. User edits to prompts and scripts at any step, with stale propagation downstream.
4. Configurable batch counts (default 3 images, 2 videos) per request, with server-enforced caps.
5. Configurable per-task model providers — text, image, and video each have their own independent API key, base URL, and endpoint id.
6. Final video compose by deterministic ffmpeg concat over the selected shot videos, with a hashable manifest of source artifacts.
7. Focus-mode frontend: one step in view at a time, with persistent awareness of available assets and overall progress.
8. Real-HTTP integration tests against real providers (no mocked providers in integration scope).

Out of scope for this iteration is everything listed in §13 "Deferred".

## 2. Module architecture

```
apps/server/src/modules/
  workspace/                  # unchanged: workspace CRUD, manifest, materials
  material/                   # unchanged
  pipeline/                   # unchanged: contracts endpoint
  script/                     # shrunk: legacy single-script reads kept until UI migrates
  shot/                       # NEW
    shot.routes.ts
    shot.controller.ts
    shot.service.ts           # ShotWorkflowService — orchestration
    shot.repository.ts
    shot.state.ts             # pure functions: canTransition, nextStatusAfter, getNextAction
    shot.stale.ts             # stale propagation rules
  artifact/                   # NEW
    artifact.service.ts
    artifact.repository.ts
    artifact.versioning.ts
  generation/                 # NEW
    generation.routes.ts
    generation.service.ts
    image.provider.ts         # Ark Seedream client (wraps packages/ai/providers/ark-image)
    video.provider.ts         # existing Seedance wrapper
    image.worker.ts
    video.worker.ts
    final-compose.worker.ts
  job/                        # NEW
    job.queue.ts
    job.repository.ts
    job.polling.ts
  trace/                      # NEW
    trace.service.ts
    trace.repository.ts

packages/ai/src/
  agents/                     # NEW: @openai/agents wrappers
    runner.ts
    storyboard-image-prompt.agent.ts
    video-shot-script.agent.ts
  schemas/                    # NEW Zod outputType schemas (in addition to existing)
    image-prompt.schema.ts
    video-script.schema.ts
  providers/
    provider-config.ts        # rewritten: three independent triplets
    ark-text.provider.ts      # unchanged
    ark-image.provider.ts     # NEW
    seedance-video.provider.ts# unchanged
  prompts/
    storyboard-image-prompt/v1.system.md   # NEW
    video-shot-script/v1.system.md         # NEW
```

Removed:

- `apps/server/src/modules/workspace/workspace.service.ts::startVideoGeneration`
- `apps/server/src/jobs/processors/media-generate.processor.ts`
- `apps/server/src/modules/creation/` (legacy single-script wizard backing routes)
- `POST /api/workspaces/video/generate`

Preserved upstream: brief, storyboard, shotprompt builders and their workflows continue to produce the upstream artifacts that the per-shot flow consumes.

## 3. Database schema

Postgres. Migrations run via the existing inline `schemaSql` mechanism plus a one-shot guarded drop step for the replaced tables. Tables added in this spec do not coexist with the legacy `storyboard_shot` / `generation_job` tables — those are removed.

### 3.1 Enums

```sql
CREATE TYPE shot_status AS ENUM (
  'DRAFT','IMAGE_PROMPT_PROPOSING','IMAGE_PROMPT_READY','IMAGE_PROMPT_EDITED',
  'IMAGE_GENERATING','IMAGE_CANDIDATES_READY','IMAGE_SELECTED',
  'VIDEO_SCRIPT_PROPOSING','VIDEO_SCRIPT_READY','VIDEO_SCRIPT_EDITED',
  'VIDEO_GENERATING','VIDEO_CANDIDATES_READY','VIDEO_SELECTED','FAILED'
);
CREATE TYPE artifact_status AS ENUM ('DRAFT','ACTIVE','APPROVED','STALE','ARCHIVED');
CREATE TYPE batch_status   AS ENUM ('PENDING','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED');
CREATE TYPE candidate_status AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','REJECTED');
CREATE TYPE job_status     AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','RETRYING','CANCELLED');
CREATE TYPE final_video_status AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED');
```

### 3.2 Shot tables

`active_image_prompt_artifact_id`, `selected_image_id`, `active_video_script_artifact_id`, and `selected_video_id` on `storyboard_shots` are denormalized read caches synchronized with the source of truth in the corresponding artifact / selection tables (`status='ACTIVE'` rows for artifacts; the singleton `selected_shot_images` / `selected_shot_videos` row for selections). Every transaction that changes a source-of-truth row also updates the cache columns in the same transaction.



```sql
CREATE TABLE storyboard_shots (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES creative_workspace(id),
  script_id    text NOT NULL,                 -- soft pointer to script.id snapshot
  order_index  int NOT NULL,
  title        text NOT NULL,
  objective    text,
  default_duration_sec int,
  status       shot_status NOT NULL DEFAULT 'DRAFT',
  next_action  text,
  active_image_prompt_artifact_id text,
  selected_image_id text,
  active_video_script_artifact_id text,
  selected_video_id text,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, order_index)
);

CREATE TABLE shot_asset_refs (
  id text PRIMARY KEY,
  shot_id  text NOT NULL REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES asset(id),
  role     text NOT NULL,                     -- product_identity | reference_style | reference_scene | first_frame_hint | other
  weight   numeric(4,2) NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shot_id, asset_id, role)
);
```

### 3.3 Image artifacts and candidates

```sql
CREATE TABLE image_prompt_artifacts (
  id text PRIMARY KEY,
  shot_id text NOT NULL REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  version int NOT NULL,
  status  artifact_status NOT NULL DEFAULT 'ACTIVE',
  prompt_text     text NOT NULL,
  negative_prompt text,
  reference_asset_ids text[] NOT NULL DEFAULT '{}',
  prompt_json jsonb NOT NULL DEFAULT '{}',
  created_by text NOT NULL,                   -- agent | user | system
  agent_name text,
  prompt_template_version text,
  base_artifact_id text REFERENCES image_prompt_artifacts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shot_id, version)
);

CREATE TABLE image_generation_batches (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES creative_workspace(id),
  shot_id text NOT NULL REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  image_prompt_artifact_id text NOT NULL REFERENCES image_prompt_artifacts(id),
  status batch_status NOT NULL DEFAULT 'PENDING',
  requested_count int NOT NULL,
  succeeded_count int NOT NULL DEFAULT 0,
  failed_count    int NOT NULL DEFAULT 0,
  provider text NOT NULL,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  provider_request jsonb NOT NULL DEFAULT '{}',
  error_message text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE image_candidates (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES image_generation_batches(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES creative_workspace(id),
  shot_id text NOT NULL REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  image_url text, object_key text,
  width int, height int, seed text,
  provider text NOT NULL,
  provider_response jsonb NOT NULL DEFAULT '{}',
  status candidate_status NOT NULL DEFAULT 'PENDING',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE selected_shot_images (
  id text PRIMARY KEY,
  shot_id text NOT NULL UNIQUE REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  image_candidate_id text NOT NULL REFERENCES image_candidates(id),
  image_generation_batch_id text NOT NULL REFERENCES image_generation_batches(id),
  selected_by text,
  selected_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.4 Video script artifacts and candidates

```sql
CREATE TABLE video_script_artifacts (
  id text PRIMARY KEY,
  shot_id text NOT NULL REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  version int NOT NULL,
  status artifact_status NOT NULL DEFAULT 'ACTIVE',
  duration_sec int NOT NULL,
  script_json jsonb NOT NULL,
  provider_prompt text NOT NULL,
  based_on_image_candidate_id text NOT NULL REFERENCES image_candidates(id),
  based_on_prev_image_candidate_id text REFERENCES image_candidates(id),
  based_on_next_image_candidate_id text REFERENCES image_candidates(id),
  created_by text NOT NULL,
  agent_name text,
  prompt_template_version text,
  base_artifact_id text REFERENCES video_script_artifacts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shot_id, version)
);

CREATE TABLE video_generation_batches (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES creative_workspace(id),
  shot_id text NOT NULL REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  video_script_artifact_id text NOT NULL REFERENCES video_script_artifacts(id),
  status batch_status NOT NULL DEFAULT 'PENDING',
  requested_count int NOT NULL,
  succeeded_count int NOT NULL DEFAULT 0,
  failed_count    int NOT NULL DEFAULT 0,
  provider text NOT NULL,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  provider_request jsonb NOT NULL DEFAULT '{}',
  error_message text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE video_candidates (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES video_generation_batches(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES creative_workspace(id),
  shot_id text NOT NULL REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  video_url text, object_key text, thumbnail_url text,
  duration_sec int, width int, height int,
  provider text NOT NULL,
  provider_response jsonb NOT NULL DEFAULT '{}',
  status candidate_status NOT NULL DEFAULT 'PENDING',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE selected_shot_videos (
  id text PRIMARY KEY,
  shot_id text NOT NULL UNIQUE REFERENCES storyboard_shots(id) ON DELETE CASCADE,
  video_candidate_id text NOT NULL REFERENCES video_candidates(id),
  video_generation_batch_id text NOT NULL REFERENCES video_generation_batches(id),
  selected_by text,
  selected_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.5 Generic jobs, traces, final video

```sql
CREATE TABLE generation_jobs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES creative_workspace(id),
  shot_id text REFERENCES storyboard_shots(id) ON DELETE SET NULL,
  job_type text NOT NULL,                      -- generate_images | generate_videos | compose_final_video
  status job_status NOT NULL DEFAULT 'PENDING',
  queue_name text NOT NULL,
  queue_job_id text,
  related_batch_type text,                     -- image_generation_batch | video_generation_batch | final_video_job
  related_batch_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  progress numeric(5,2) NOT NULL DEFAULT 0,
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  error_message text,
  started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trace_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES creative_workspace(id),
  shot_id text REFERENCES storyboard_shots(id) ON DELETE SET NULL,
  trace_type text NOT NULL,                    -- agent_run | provider_call | job_event | state_transition | user_action
  name text NOT NULL,
  input_preview text, output_preview text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE final_video_jobs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES creative_workspace(id),
  status final_video_status NOT NULL DEFAULT 'PENDING',
  source_shot_video_ids text[] NOT NULL,
  source_video_script_artifact_ids text[] NOT NULL,
  local_path text,
  local_url text,
  duration_sec int,
  width int, height int,
  compiled_manifest jsonb NOT NULL DEFAULT '{}',
  compiled_manifest_hash text,
  ffmpeg_log text,
  error_message text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
```

### 3.6 Replacements

- Drop `storyboard_shot` (legacy single-table).
- Drop `generation_job` (replaced by `generation_jobs`).
- Keep `workspace_artifact` and its `UNIQUE (workspace_id, artifact_type)` constraint for brief/storyboard/shotprompt — those remain one-per-workspace upstream.
- Keep `workspace_video_archive` row, but the new code does not write it. Removal happens in a later pass.

### 3.7 Standard indexes

- FK indexes on every `workspace_id`, `shot_id`, `status` column listed above.
- `idx_generation_jobs_related_batch` on `(related_batch_type, related_batch_id)`.
- `idx_trace_events_workspace` on `(workspace_id, created_at DESC)`.
- `idx_trace_events_shot` on `(shot_id, created_at DESC)`.

## 4. API surface

All new routes return:

```ts
interface WorkflowResponse<T> {
  data: T;
  shotStatus?: ShotStatus;
  nextAction?: NextAction;
  warnings?: string[];
  traceId?: string;
}
```

All POSTs that create a batch require an `Idempotency-Key` header; absence returns 400. Honored headers on every new POST: `Idempotency-Key`, `X-Trace-Id`, `X-Validation-Mode` (only `strict` implemented in P0).

```http
# Shot CRUD & state
GET    /api/workspaces/:workspaceId/shots
POST   /api/workspaces/:workspaceId/shots
GET    /api/shots/:shotId
GET    /api/workspaces/:workspaceId/shot-workflow-status
PATCH  /api/shots/:shotId/asset-refs

# Image prompt
POST   /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose
PATCH  /api/shots/:shotId/image-prompts/:artifactId
GET    /api/shots/:shotId/image-prompts

# Image batches
POST   /api/shots/:shotId/image-batches                       # Idempotency-Key required
GET    /api/shots/:shotId/image-batches
GET    /api/shots/:shotId/image-batches/:batchId

# Image selection
POST   /api/shots/:shotId/selected-image
GET    /api/shots/:shotId/selected-image

# Video script
POST   /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose
PATCH  /api/shots/:shotId/video-scripts/:scriptId
GET    /api/shots/:shotId/video-scripts

# Video batches
POST   /api/shots/:shotId/video-batches                       # Idempotency-Key required
GET    /api/shots/:shotId/video-batches
GET    /api/shots/:shotId/video-batches/:batchId

# Video selection
POST   /api/shots/:shotId/selected-video
GET    /api/shots/:shotId/selected-video

# Retry
POST   /api/shots/:shotId/retry                                # body: { what: "image_batch" | "video_batch" }

# Generic job / trace
GET    /api/jobs/:jobId
GET    /api/workspaces/:workspaceId/traces
GET    /api/shots/:shotId/traces

# Final video
POST   /api/workspaces/:workspaceId/final-videos               # Idempotency-Key required
GET    /api/final-videos/:finalVideoJobId
GET    /api/workspaces/:workspaceId/final-videos
GET    /api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file

# Config / limits
GET    /api/config/limits                                      # default + max batch sizes, aspect ratios

# Unchanged upstream
POST   /api/workspaces                                         # existing
POST   /api/workspaces/materials                               # existing
POST   /api/workspaces/brief/propose                           # existing
POST   /api/workspaces/storyboard/propose                      # existing
POST   /api/workspaces/shotprompt/compile                      # existing — now also seeds storyboard_shots
```

Removed: `POST /api/workspaces/video/generate`. The legacy `GET /api/jobs/:jobId` is replaced by the new generic version reading `generation_jobs`.

Shots are seeded server-side as part of shotprompt approval — no separate seeding endpoint required for the happy path; `POST .../shots` exists for manual add/insert.

Polling response shape (same for image and video batches):

```json
{
  "data": {
    "batchId": "img-batch-1",
    "status": "SUCCEEDED",
    "requestedCount": 3,
    "succeededCount": 3,
    "failedCount": 0,
    "candidates": [
      { "id": "img-candidate-1", "imageUrl": "https://…", "status": "SUCCEEDED" }
    ]
  },
  "shotStatus": "IMAGE_CANDIDATES_READY",
  "nextAction": "SELECT_IMAGE"
}
```

## 5. State machine and stale rules

### 5.1 Types

```ts
export type ShotStatus =
  | "DRAFT"
  | "IMAGE_PROMPT_PROPOSING" | "IMAGE_PROMPT_READY" | "IMAGE_PROMPT_EDITED"
  | "IMAGE_GENERATING" | "IMAGE_CANDIDATES_READY" | "IMAGE_SELECTED"
  | "VIDEO_SCRIPT_PROPOSING" | "VIDEO_SCRIPT_READY" | "VIDEO_SCRIPT_EDITED"
  | "VIDEO_GENERATING" | "VIDEO_CANDIDATES_READY" | "VIDEO_SELECTED"
  | "FAILED";

export type NextAction =
  | "GENERATE_IMAGE_PROMPT" | "EDIT_IMAGE_PROMPT"
  | "GENERATE_IMAGES" | "POLL_IMAGE_BATCH" | "SELECT_IMAGE"
  | "GENERATE_VIDEO_SCRIPT" | "EDIT_VIDEO_SCRIPT"
  | "GENERATE_VIDEOS" | "POLL_VIDEO_BATCH" | "SELECT_VIDEO"
  | "READY_FOR_FINAL_COMPOSE" | "RETRY" | "NONE";
```

`shot.state.ts` exports pure functions: `canTransition(from, to)`, `nextStatusAfter(event, from)`, `getNextAction(status)`. No DB access.

### 5.2 Transition table

| From | Event | To |
|---|---|---|
| `DRAFT` | `PROPOSE_IMAGE_PROMPT` | `IMAGE_PROMPT_PROPOSING` → `IMAGE_PROMPT_READY` |
| `IMAGE_PROMPT_READY` / `IMAGE_PROMPT_EDITED` / `IMAGE_CANDIDATES_READY` | `USER_EDIT_IMAGE_PROMPT` | `IMAGE_PROMPT_EDITED` |
| `IMAGE_PROMPT_READY` / `IMAGE_PROMPT_EDITED` | `ENQUEUE_IMAGE_BATCH` | `IMAGE_GENERATING` |
| `IMAGE_GENERATING` | `IMAGE_BATCH_DONE_OK` | `IMAGE_CANDIDATES_READY` |
| `IMAGE_CANDIDATES_READY` | `USER_SELECT_IMAGE` | `IMAGE_SELECTED` |
| `IMAGE_SELECTED` / `VIDEO_SCRIPT_READY` / `VIDEO_SCRIPT_EDITED` / `VIDEO_CANDIDATES_READY` | `PROPOSE_VIDEO_SCRIPT` | `VIDEO_SCRIPT_PROPOSING` → `VIDEO_SCRIPT_READY` |
| `VIDEO_SCRIPT_READY` / `VIDEO_SCRIPT_EDITED` / `VIDEO_CANDIDATES_READY` | `USER_EDIT_VIDEO_SCRIPT` | `VIDEO_SCRIPT_EDITED` |
| `VIDEO_SCRIPT_READY` / `VIDEO_SCRIPT_EDITED` | `ENQUEUE_VIDEO_BATCH` | `VIDEO_GENERATING` |
| `VIDEO_GENERATING` | `VIDEO_BATCH_DONE_OK` | `VIDEO_CANDIDATES_READY` |
| `VIDEO_CANDIDATES_READY` / `VIDEO_SELECTED` | `USER_SELECT_VIDEO` | `VIDEO_SELECTED` |
| any | `IMAGE_BATCH_FAILED` / `VIDEO_BATCH_FAILED` | `FAILED` |

### 5.3 nextAction map

| `shot.status` | `nextAction` |
|---|---|
| `DRAFT` | `GENERATE_IMAGE_PROMPT` |
| `IMAGE_PROMPT_PROPOSING` / `VIDEO_SCRIPT_PROPOSING` | `NONE` |
| `IMAGE_PROMPT_READY` / `IMAGE_PROMPT_EDITED` | `GENERATE_IMAGES` |
| `IMAGE_GENERATING` | `POLL_IMAGE_BATCH` |
| `IMAGE_CANDIDATES_READY` | `SELECT_IMAGE` |
| `IMAGE_SELECTED` | `GENERATE_VIDEO_SCRIPT` |
| `VIDEO_SCRIPT_READY` | `EDIT_VIDEO_SCRIPT` |
| `VIDEO_SCRIPT_EDITED` | `GENERATE_VIDEOS` |
| `VIDEO_GENERATING` | `POLL_VIDEO_BATCH` |
| `VIDEO_CANDIDATES_READY` | `SELECT_VIDEO` |
| `VIDEO_SELECTED` | `READY_FOR_FINAL_COMPOSE` |
| `FAILED` | `RETRY` |

### 5.4 Stale propagation

Applied inside the same transaction as the upstream change.

- `USER_EDIT_IMAGE_PROMPT(shotId)` → active `video_script_artifacts` for the shot become `STALE`. Old `image_generation_batches` rows are kept as history (their `batch_status` is not modified — they were already terminal). Existing `selected_shot_images` is left alone until the user re-selects.
- `USER_SELECT_IMAGE(shotId, candidateId)` where `candidateId` differs from current selection → active `video_script_artifacts` become `STALE`, `selected_shot_videos` row dropped. No-op when same candidate is re-selected.
- `USER_EDIT_VIDEO_SCRIPT(shotId, scriptId)` → prior `video_script_artifact(version v-1)` becomes `STALE`. `selected_shot_videos` row whose underlying candidate references the prior script is dropped.
- `PROPOSE_VIDEO_SCRIPT` replacing an existing ACTIVE → prior active becomes `STALE`; `selected_shot_videos` row referencing it is dropped.

Two invariants enforced by repositories:

1. At most one `ACTIVE` artifact per `(shot_id, artifact_type)`. Enforced via `SELECT … FOR UPDATE` then status update in the same transaction.
2. Creating a video batch requires the script to be `ACTIVE`. `GenerationService.createVideoBatch` validates inside the same transaction; otherwise returns 409 `STALE_SCRIPT`.

### 5.5 Cross-shot continuity

When `proposeVideoScript` reads neighbor frames, it compares the current `selected_shot_images.image_candidate_id` of the neighbor against the value captured in the prior `video_script_artifact.based_on_prev_image_candidate_id`. If they differ, the response includes `warnings: ["NEIGHBOR_IMAGE_CHANGED"]`. No automatic stale firing.

### 5.6 Failure recovery

`FAILED` shots carry `last_error`. `POST /api/shots/:shotId/retry` accepts `{ what: "image_batch" | "video_batch" }`, re-enqueues using the most recent ACTIVE upstream artifact, creates a new batch row, and moves the shot back to `IMAGE_GENERATING` / `VIDEO_GENERATING`. The previously failed batch remains as history.

## 6. Agents and provider configuration

### 6.1 Provider config — three independent triplets

Rewritten `packages/ai/src/providers/provider-config.ts`:

```ts
export interface TaskProviderConfig {
  task: "text" | "image" | "video";
  provider: string;
  apiKey: string;
  endpointId: string;
  baseURL: string;
  timeoutMs?: number;
}
```

Env precedence (first non-empty wins):

```
TEXT_API_KEY      > AI_TEXT_API_KEY      > ARK_API_KEY
TEXT_BASE_URL     > AI_TEXT_BASE_URL     > ARK_BASE_URL  > DEFAULT_ARK_BASE_URL
TEXT_ENDPOINT_ID  > AI_TEXT_ENDPOINT_ID  > ARK_TEXT_ENDPOINT_ID

IMAGE_API_KEY     > AI_IMAGE_API_KEY                              (no ARK alias — new triplet)
IMAGE_BASE_URL    > AI_IMAGE_BASE_URL    > DEFAULT_ARK_BASE_URL
IMAGE_ENDPOINT_ID > AI_IMAGE_ENDPOINT_ID

VIDEO_API_KEY     > AI_VIDEO_API_KEY     > ARK_API_KEY
VIDEO_BASE_URL    > AI_VIDEO_BASE_URL    > ARK_BASE_URL
VIDEO_ENDPOINT_ID > AI_VIDEO_ENDPOINT_ID > ARK_VIDEO_ENDPOINT_ID
```

Each resolver returns `null` when required fields are missing. With `MODEL_MODE=real`, service boot fails fast listing only the absent keys. No fallback. Secrets masked via the existing helper before any log/trace output.

Updated `.env.example`:

```
TEXT_API_KEY=
TEXT_BASE_URL=
TEXT_ENDPOINT_ID=

IMAGE_API_KEY=
IMAGE_BASE_URL=
IMAGE_ENDPOINT_ID=

VIDEO_API_KEY=
VIDEO_BASE_URL=
VIDEO_ENDPOINT_ID=

DEFAULT_IMAGE_BATCH_SIZE=3
MAX_IMAGE_BATCH_SIZE=6
DEFAULT_VIDEO_BATCH_SIZE=5
MAX_VIDEO_BATCH_SIZE=10
```

### 6.2 New Ark image provider

`packages/ai/src/providers/ark-image.provider.ts` mirrors the Seedance video provider shape — Ark async task create + poll. Returns up to `count` `ArkImageCandidate { imageUrl, objectKey?, seed? }`. Emits trace events: `image.task_create_started`, `image.task_polled`, `image.completed`, `image.failed`. Provider-boundary contract: only `ImageGenerationWorker` calls this module.

### 6.3 Agents

Two new agents in `packages/ai/src/agents/`, wrapping `@openai/agents`. Existing brief/storyboard/shotprompt workflows keep their direct `generateTextWithArk` path.

```ts
// storyboard-image-prompt.agent.ts
export const StoryboardImagePromptOutputSchema = z.object({
  promptText: z.string().min(20),
  negativePrompt: z.string().optional(),
  visualStyle: z.string().optional(),
  composition: z.string().optional(),
  lighting: z.string().optional(),
  productVisibilityRule: z.string(),
  referenceImageUsage: z.array(z.object({
    assetId: z.string(),
    usage: z.enum(["product_identity","style_reference","scene_reference","composition_reference"]),
    instruction: z.string()
  })).default([]),
  qualityChecklist: z.array(z.string()).default([])
});

// video-shot-script.agent.ts
export const VideoShotScriptOutputSchema = z.object({
  durationSec: z.number().int().min(1).max(8),
  shotGoal: z.string(),
  startFrameDescription: z.string(),
  endFrameDescription: z.string(),
  continuityWithPrevious: z.string().optional(),
  continuityWithNext: z.string().optional(),
  cameraMotion: z.string(),
  subjectMotion: z.string(),
  productVisibility: z.string(),
  sceneConsistency: z.string(),
  voiceover: z.string().optional(),
  onscreenText: z.string().optional(),
  providerPrompt: z.string().min(30),
  negativePrompt: z.string().optional(),
  riskNotes: z.array(z.string()).default([])
});
```

Shared runner:

```ts
const runner = new Runner({
  modelProvider: createOpenAICompatibleModelProvider(textProviderConfig)
});
export async function runAgentWithTrace<T>({ agent, payload, context, maxTurns = 6 }): Promise<T>;
```

`runAgentWithTrace` writes a `trace_events` row (`trace_type='agent_run'`) with agent name, prompt template version, input/output preview, latency.

### 6.4 Prompt registry

`packages/ai/src/prompts/storyboard-image-prompt/v1.system.md` and `.../video-shot-script/v1.system.md` ship in the repo. Template version stamped into the artifact's `prompt_template_version` column.

### 6.5 Mock mode

When `MODEL_MODE != "real"`, both new agents short-circuit to deterministic fixtures so dev and the unit suite run without provider keys. Integration tests always run against real providers.

### 6.6 Configurable counts

```ts
function resolveBatchCount(kind: "image"|"video", requested: number|undefined): number {
  const def = kind === "image" ? cfg.DEFAULT_IMAGE_BATCH_SIZE : cfg.DEFAULT_VIDEO_BATCH_SIZE;
  const max = kind === "image" ? cfg.MAX_IMAGE_BATCH_SIZE     : cfg.MAX_VIDEO_BATCH_SIZE;
  const n = requested ?? def;
  if (n < 1 || n > max) throw new HttpError(400, "COUNT_EXCEEDS_LIMIT");
  return n;
}
```

Persisted to `image_generation_batches.requested_count` / `video_generation_batches.requested_count`. `/api/config/limits` exposes resolved defaults so the UI can label CTAs without hard-coding numbers.

## 7. Jobs, workers, idempotency, recovery

### 7.1 Queue topology

Single BullMQ queue `generation_v2`. Job kinds:

```ts
type GenerationJobData =
  | { kind: "generate_images"; jobId: string; batchId: string; shotId: string; workspaceId: string; imagePromptArtifactId: string; count: number; aspectRatio: "9:16"|"16:9"|"1:1" }
  | { kind: "generate_videos"; jobId: string; batchId: string; shotId: string; workspaceId: string; videoScriptArtifactId: string; count: number; aspectRatio: "9:16"|"16:9"|"1:1" }
  | { kind: "compose_final_video"; jobId: string; finalVideoJobId: string; workspaceId: string };
```

When `USE_REDIS_QUEUE != true`, jobs run via `setTimeout(…,0)` after the API returns. When true, a BullMQ worker is spawned with `concurrency = max(1, MAX_IMAGE_BATCH_SIZE + MAX_VIDEO_BATCH_SIZE)`.

Legacy queue (`media-generate.processor.ts`, the existing `generation_v1` queue) is removed.

### 7.2 Image worker

```ts
async function processGenerateImages(data) {
  const batch = await db.getImageBatch(data.batchId);
  if (batch.status !== "PENDING") return;
  await db.updateImageBatch(batch.id, { status: "RUNNING" });
  await db.updateJob(data.jobId, { status: "RUNNING", started_at: now() });

  const artifact = await db.getImagePromptArtifact(data.imagePromptArtifactId);
  const refUrls  = await assetService.urlsByIds(artifact.reference_asset_ids);

  const result = await generateImagesWithArk({
    prompt: artifact.prompt_text,
    negativePrompt: artifact.negative_prompt ?? undefined,
    referenceImageUrls: refUrls,
    count: data.count,
    aspectRatio: data.aspectRatio,
  }, imageProviderConfig, { traceLogger, jobId: data.jobId });

  for (const c of result.candidates) {
    await db.createImageCandidate({ batchId: batch.id, shotId: batch.shot_id, ..., status: "SUCCEEDED" });
  }
  for (let i = result.candidates.length; i < data.count; i++) {
    await db.createImageCandidate({ ..., status: "FAILED", error_message: "provider_returned_short" });
  }

  const finalStatus = result.candidates.length === data.count ? "SUCCEEDED"
                    : result.candidates.length > 0           ? "PARTIAL"
                    :                                          "FAILED";
  await db.updateImageBatch(batch.id, { status: finalStatus, succeeded_count: result.candidates.length, failed_count: data.count - result.candidates.length });
  await db.updateJob(data.jobId, { status: finalStatus === "FAILED" ? "FAILED" : "SUCCEEDED", completed_at: now() });
  await transitionShot(batch.shot_id, finalStatus === "FAILED" ? "IMAGE_BATCH_FAILED" : "IMAGE_BATCH_DONE_OK");
}
```

### 7.3 Video worker

Mirrors image worker, parallel per-candidate via `Promise.allSettled` since Seedance is one-task-per-video. Candidate status is `SUCCEEDED` for fulfilled, `FAILED` (with `error_message`) for rejected. Batch terminal status: all fulfilled → `SUCCEEDED`; mixed → `PARTIAL`; none → `FAILED`.

### 7.4 Idempotency

On `POST .../image-batches` and `POST .../video-batches`:

1. Read `Idempotency-Key` header (required, else 400).
2. `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`.
3. If conflict, `SELECT` existing row and return its current state. No new job enqueued.

Documented client key shape: `workspaceId:shotId:operation:artifactId:artifactVersion:nonce`.

### 7.5 Refresh recovery

`GET /api/workspaces/:workspaceId/shot-workflow-status` returns aggregated state per shot, including `activeImageBatchId` / `activeVideoBatchId` so the UI can resume polling without remembering anything:

```json
{
  "data": {
    "workspaceId": "wsp_1",
    "shots": [{
      "shotId": "shot_1", "orderIndex": 1,
      "status": "VIDEO_GENERATING", "nextAction": "POLL_VIDEO_BATCH",
      "activeImagePromptArtifactId": "...", "selectedImageId": "...",
      "activeVideoScriptArtifactId": "...", "selectedVideoId": null,
      "activeImageBatchId": "...", "activeVideoBatchId": "video_batch_1"
    }],
    "canComposeFinalVideo": false
  }
}
```

### 7.6 Crash recovery

On worker boot:

- `SELECT * FROM generation_jobs WHERE status IN ('PENDING','RUNNING')`. For each, re-enqueue if `queue_job_id` is null (in-process mode) or rely on BullMQ persistence (Redis mode).
- Batch rows in `RUNNING` are bumped back to `PENDING` so the re-enqueued worker can re-claim them. Workers are idempotent on `status !== "PENDING"` so this is safe.
- Jobs exceeding `max_attempts` are marked `FAILED` with `MAX_ATTEMPTS_EXCEEDED`.

### 7.7 Trace events

Workers emit `provider_call` (provider_name, model, latency, candidate counts, masked secrets) plus `job_event` for `enqueued / started / completed / failed`. Workspace-local `.daireel/trace/events.jsonl` (existing FileTraceLogger) is kept for local debugging; the DB `trace_events` table is the canonical queryable source.

## 8. Final video compose

### 8.1 Lifecycle

1. UI POSTs `POST /api/workspaces/:workspaceId/final-videos` with an `Idempotency-Key`. Body: `{ transition: "cut", outputAspectRatio: "9:16" }`.
2. Server validates:
   - Every shot has a `selected_shot_videos` row, else 409 `MISSING_SELECTIONS` with the missing shot ids.
   - Every selected video's underlying `video_script_artifact.status='ACTIVE'`, else 409 `STALE_SELECTIONS` with the stale ids.
3. Server snapshots `source_shot_video_ids` and `source_video_script_artifact_ids` into the `final_video_jobs` row in `order_index` order, creates a `generation_jobs` row with `job_type='compose_final_video'`, enqueues.
4. Worker (`final-compose.worker.ts`) runs ffmpeg concat.
5. Manifest + hash written to the row.

### 8.2 Worker pseudocode

```ts
async function processFinalCompose(jobData) {
  const job = await db.getFinalVideoJob(jobData.finalVideoJobId);
  if (job.status !== "PENDING") return;
  await db.updateFinalVideoJob(job.id, { status: "RUNNING" });

  const candidates = await db.getVideoCandidatesByIds(job.source_shot_video_ids);
  const orderedUrls = candidates.sort(byShotOrderIndex).map(c => c.video_url);

  const workspace = await db.getWorkspace(job.workspace_id);
  const workDir = path.join(workspace.localPath, ".daireel", "final", job.id);
  const inputs = await downloadAll(orderedUrls, path.join(workDir, "in"));

  const listFile = path.join(workDir, "concat.txt");
  await writeFile(listFile, inputs.map(p => `file '${p}'`).join("\n"));

  const outPath = path.join(workDir, "final.mp4");
  await runFfmpeg([
    "-f","concat","-safe","0","-i", listFile,
    "-c:v","libx264","-preset","veryfast","-crf","20",
    "-c:a","aac","-b:a","160k",
    "-movflags","+faststart",
    outPath
  ]);

  const meta = await ffprobe(outPath);
  const manifest = {
    schemaVersion: "final-video.v1",
    workspaceId: job.workspace_id,
    sources: candidates.map(c => ({
      shotId: c.shot_id,
      videoCandidateId: c.id,
      videoScriptArtifactId: c.video_script_artifact_id,
      providerPromptHash: sha256(c.provider_prompt),
      providerUrl: c.video_url
    })),
    transition: "cut",
    outputAspectRatio: jobData.outputAspectRatio,
  };
  const manifestHash = sha256(JSON.stringify(manifest));

  await db.updateFinalVideoJob(job.id, {
    status: "SUCCEEDED",
    local_path: outPath,
    local_url: `/api/workspaces/${job.workspace_id}/final-videos/${job.id}/file`,
    duration_sec: meta.durationSec, width: meta.width, height: meta.height,
    compiled_manifest: manifest, compiled_manifest_hash: manifestHash,
    completed_at: now(),
  });
}
```

### 8.3 Provider boundary contract

`final-compose.worker.ts` must not import any text/image/video provider module or `packages/ai/agents`. Enforced two ways:

1. An eslint rule (or a small unit test that statically scans imports) covering the file.
2. The trace contract test in §9 confirms zero `provider_call` events with `providerType ∈ {text,image,video}` are emitted for any `compose_final_video` job.

### 8.4 ffmpeg dependency

Workers require `ffmpeg` on PATH. `apps/server/Dockerfile` (or the equivalent Docker Compose service) installs it. Dev preflight at server boot runs `which ffmpeg` and fails fast with a clear "install ffmpeg" message if missing.

### 8.5 Out of scope for P0

Crossfades, BGM, TTS, subtitles. The manifest schema reserves nullable fields so adding them later is backward-compatible.

## 9. Testing strategy

Unit tests use mocks for providers, integration tests do not. Integration tests require `RUN_REAL_PROVIDER_TESTS=true` and a fully populated env; boot fails fast listing missing keys.

### 9.1 Unit tests (vitest, `*.unit.test.ts`)

| File | Verifies |
|---|---|
| `shot.state.unit.test.ts` | every transition; nextAction map exhaustive |
| `shot.stale.unit.test.ts` | prompt edit → script stale; image re-select → script stale + selected_video drop; script edit → prior stale + selected_video drop; no-op re-select doesn't fire stale |
| `artifact.versioning.unit.test.ts` | new version increments, flips prior `ACTIVE→STALE` in same tx |
| `image-prompt.schema.unit.test.ts` / `video-script.schema.unit.test.ts` | Zod schemas accept valid, reject boundary cases |
| `provider-config.unit.test.ts` | each triplet resolves with new names, falls back to ARK_* for text/video, returns null when keys missing, masks secrets, real-mode boot throws listing only absent keys |
| `batch-count.unit.test.ts` | resolveBatchCount: default, override, over-cap → 400 |
| `shot.workflow.unit.test.ts` | ShotWorkflowService orchestration with fake repos |
| `image.worker.unit.test.ts` / `video.worker.unit.test.ts` | idempotency on `status!=PENDING`; partial / failed batches; pads short returns |
| `final-compose.manifest.unit.test.ts` | manifest ordering, hash deterministic |
| `final-compose.boundary.unit.test.ts` | static import scan — fails if worker imports any provider |
| `idempotency.unit.test.ts` | ON CONFLICT returns existing batch without re-enqueue |

### 9.2 Integration tests (real-provider only)

Tagged tests, real HTTP against `TEST_API_BASE_URL`. No `supertest`, no in-process app.

| File | Tag | Verifies |
|---|---|---|
| `workspace.integration.test.ts` | `@smoke` | create / status / restore |
| `material-upload.integration.test.ts` | `@smoke` | multipart upload + listing |
| `shot-seeding.integration.test.ts` | `@smoke` | shotprompt approval seeds storyboard_shots |
| `image-prompt.integration.test.ts` | `@provider` | propose v1, edit v2, stale visible in status |
| `image-batch.integration.test.ts` | `@provider` | POST with Idempotency-Key, dedupe, poll until terminal, N candidates returned |
| `image-select.integration.test.ts` | `@provider` | select → IMAGE_SELECTED, downstream stale fires on different selection |
| `video-script.integration.test.ts` | `@provider` | propose with neighbors → artifact with based_on_prev/next; PATCH v2 |
| `video-batch.integration.test.ts` | `@expensive` | N-video batch, idempotency, partial results allowed |
| `video-select.integration.test.ts` | `@expensive` | select → VIDEO_SELECTED, READY_FOR_FINAL_COMPOSE |
| `final-compose.integration.test.ts` | `@expensive` | POST → poll → mp4 plays, manifest hash deterministic across two identical runs |
| `final-compose.contract.integration.test.ts` | `@expensive` | trace shows zero text/image/video provider_call rows during compose |
| `refresh-recovery.integration.test.ts` | `@smoke` | mid-flight GET shot-workflow-status restores state |
| `concurrency.integration.test.ts` | `@provider` | shot A `VIDEO_GENERATING` while shot B proposes prompt — independent state |
| `count-config.integration.test.ts` | `@provider` | request 4 images, get 4 candidates |

Naming hygiene: every test prefixes workspace name with `it-${TEST_RUN_ID}`. Cleanup endpoint `DELETE /api/test-runs/:runId` is gated by `NODE_ENV=test`.

### 9.3 Test commands

```json
{
  "test": "pnpm test:unit",
  "test:unit": "vitest run --config vitest.unit.config.ts",
  "test:integration": "RUN_REAL_PROVIDER_TESTS=true vitest run --config vitest.integration.config.ts",
  "test:integration:smoke": "RUN_REAL_PROVIDER_TESTS=true vitest run --config vitest.integration.config.ts -t '@smoke'",
  "test:integration:provider": "RUN_REAL_PROVIDER_TESTS=true vitest run --config vitest.integration.config.ts -t '@provider'",
  "test:integration:expensive": "RUN_REAL_PROVIDER_TESTS=true ALLOW_EXPENSIVE_TESTS=true vitest run --config vitest.integration.config.ts -t '@expensive'"
}
```

CI: PR runs unit only; main merge runs `@smoke`; nightly + manual dispatch runs `@provider` and `@expensive`.

## 10. Frontend overhaul (focus mode)

### 10.1 Layout

```
TopBar:          workspace name · current shot · breadcrumb · trace toggle
LeftRail:        shot list + step ladder for active shot + final-compose CTA
Focus panel:     exactly one step component for the active shot
AssetRail:       references in use for this shot + workspace materials + quick upload
TraceDrawer:     collapsible right-side overlay
```

Three sticky regions and a single focused work area. URL-synced focus state: `?shot=<id>&step=<image_prompt|image_candidates|video_script|video_candidates|review|final_compose>`.

### 10.2 Focus model

```ts
type FocusedStep =
  | "image_prompt" | "image_candidates"
  | "video_script" | "video_candidates"
  | "review" | "final_compose";

interface FocusState { activeShotId: string | "workspace"; focusedStep: FocusedStep | null; }
```

Rules:

1. Default focus on entering a shot matches its `nextAction`.
2. Auto-advance after a successful action moves focus to the new `nextAction`'s step.
3. Manual backward via the step ladder opens prior step read-only; toggling Edit triggers stale propagation and re-derives focus.
4. Leaving a shot mid-batch does not cancel. LeftRail keeps showing the spinner; a toast fires on completion.

### 10.3 Step components

| Step | Component | Highlights |
|---|---|---|
| `image_prompt` | `ImagePromptStep` | textarea + negative prompt + reference chips + "Generate N images" + version chips |
| `image_candidates` | `ImageCandidatesStep` | batch progress → tile grid → click-to-select |
| `video_script` | `VideoScriptStep` | structured form + selected image thumbnail + optional neighbor frames + version chips |
| `video_candidates` | `VideoCandidatesStep` | batch progress → tile grid with mp4 preview → click-to-select |
| `review` | `ReviewStep` | locked thumbnail for shots in `VIDEO_SELECTED` |
| `final_compose` | `FinalComposeStep` | timeline of selected videos, compose button, polling progress, download |

Each step renders an "Assets referenced here" strip at the top showing the model inputs; the strip is bound to `shot_asset_refs` and editable from AssetRail.

### 10.4 LeftRail aggregate

- Shot list with per-row status, progress, and next action label.
- Step ladder for the active shot.
- `Compose final video` sticky CTA at the bottom: enabled iff `canComposeFinalVideo`.

### 10.5 AssetRail

- "References in use for this shot" chips bound to `shot_asset_refs`.
- "Workspace materials" paginated list; drag-drop into prompt panels or click "Use as reference".
- Inline quick upload.

### 10.6 Polling strategy

- `useShotWorkflowStatus(workspaceId)` — 3s while any shot is in a `*_GENERATING` state, else 30s.
- `useBatchPolling(batchId)` — drives the active focus panel.
- `useFinalVideoPolling(finalVideoJobId)` — drives `FinalComposeStep`.
- All polling aborts on `document.visibilitychange` (tab hidden).

### 10.7 Module tree

```
apps/web/src/features/workspace/
  WorkspaceLayout.tsx
  LeftRail/
    ShotList.tsx
    StepLadder.tsx
    FinalComposeCta.tsx
  Focus/
    FocusRouter.tsx
    ImagePromptStep.tsx
    ImageCandidatesStep.tsx
    VideoScriptStep.tsx
    VideoCandidatesStep.tsx
    ReviewStep.tsx
    FinalComposeStep.tsx
  AssetRail/
    AssetRail.tsx
    AssetTile.tsx
    QuickUpload.tsx
  TraceDrawer.tsx
  hooks/
    useShotWorkflowStatus.ts
    useBatchPolling.ts
    useFinalVideoPolling.ts
    useFocusState.ts
  url-state.ts
```

### 10.8 Removed UI

- `apps/web/src/features/creation/*` (single-script wizard)
- "One-click video" CTA
- `demo-readiness.test.ts` updated to point at the new flow.

CTA copy is data-driven via `/api/config/limits` so the UI never hard-codes "3 images" / "5 videos".

## 11. Backend module summary

| Module | Responsibility | Does NOT |
|---|---|---|
| `workspace` | workspace CRUD, manifest, materials | per-shot generation |
| `material` | asset upload + validation | prompt generation |
| `shot` | shot CRUD, state machine, nextAction map, stale rules | direct provider calls |
| `artifact` | image_prompt + video_script versioning, stale flips | business flow decisions |
| `generation` | image / video / final-compose batches and workers | text agent calls |
| `job` | unified `generation_jobs` table, polling, retry, recovery | business semantics |
| `trace` | `trace_events` writes and read API | influence flow decisions |
| `packages/ai/agents` | StoryboardImagePromptAgent, VideoShotScriptAgent | persist business state |
| `packages/ai/providers` | text / image / video provider HTTP clients | orchestration |

## 12. Rollout

Wave-by-wave; each wave keeps `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` green.

**Wave 1 — Foundations.** Provider-config rewrite into three triplets with ARK_* aliases; new Ark image provider + mock fixture; new Zod schemas + prompt files; OpenAI Agents SDK runner + the two new agents (off the hot path, smoke-tested via probes).

**Wave 2 — Schema migration and module skeleton.** New enums and tables; drop legacy `storyboard_shot` and `generation_job` behind a guarded migration; register new modules; remove `creation` module and `media-generate.processor.ts`; wire shot seeding into shotprompt approval.

**Wave 3 — Image flow end-to-end.** ImagePromptArtifact propose/edit + state transitions + stale; ImageGenerationBatch + worker + idempotency + polling; SelectedShotImage + downstream stale; image integration tests pass.

**Wave 4 — Video flow end-to-end.** VideoScriptArtifact propose/edit (with neighbor lookup) + state; VideoGenerationBatch + worker (`Promise.allSettled`) + idempotency + polling; SelectedShotVideo + stale; video integration tests pass.

**Wave 5 — Final compose.** `final_video_jobs` table + endpoint + worker; ffmpeg dependency declared; provider-boundary static check; final-compose integration tests pass.

**Wave 6 — Frontend overhaul.** New `features/workspace` layout (LeftRail / Focus / AssetRail / TraceDrawer); each step wired to its API; URL-synced focus state; FinalComposeStep + download UI; remove `features/creation`; refresh `demo-readiness.test.ts`.

**Wave 7 — Polish.** `/api/config/limits`; trace drawer pagination + filtering; refresh-recovery integration test + crash-recovery worker sweep on boot; cleanup endpoint for integration runs.

## 13. Deferred (explicit non-goals)

These are intentionally out of scope for this iteration. Each has a clear hook for the next iteration to pull it in:

- **PromptReviewAgent and ScriptReviewAgent** — would slot between `propose` and artifact persist in `ShotWorkflowService`; outputs collected as `warnings` or trigger auto-repair.
- **ArtifactRepairAgent + auto-repair `X-Validation-Mode`** — `generateAndValidateArtifact` helper would gain a repair loop; the validation envelope contract (§4.2 of the source design doc) is already aligned.
- **DecisionPlannerAgent + tree/model/hybrid decision modes** — would gate template selection and provider fallback; current code hard-codes the workflow order in `ShotWorkflowService`.
- **TraceSummaryAgent and other P2 agents** (A/B optimizer, comment-driven re-creation).
- **Final compose enhancements**: crossfade, BGM, TTS, subtitles. Manifest schema reserves nullable fields.
- **Partial-candidate re-generation**: retry only failed videos in a batch.
- **Historical batch comparison / rollback UI**.
- **SSE / WebSocket** for batch and trace streaming.
- **Removal of `workspace_video_archive`** table.

## 14. Open issues to revisit during implementation

- Hard FK vs soft pointer for `storyboard_shots.script_id`. Currently soft. If we re-version scripts in this iteration, revisit.
- Whether to expose the per-shot `asset-refs` editing as a dedicated panel or piggyback on existing prompt panels.
- ffmpeg installation strategy in CI runners (use the Docker image we already build, vs install step).

## 15. Acceptance checklist

- [ ] All Wave 1–7 work merged on the `codex/aigc_v2_0528_s1` branch.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` all green.
- [ ] `pnpm test:integration:smoke` passes against a real provider env.
- [ ] One end-to-end manual run: workspace → material → brief → storyboard → shotprompt → for each shot (image prompt → 3 images → select → video script → 5 videos → select) → final compose → downloadable mp4 plays.
- [ ] `final-compose.contract.integration.test.ts` passes (no text/image/video provider calls during compose).
- [ ] All env keys documented in `.env.example`; boot fails fast in `MODEL_MODE=real` when any required key is missing.
