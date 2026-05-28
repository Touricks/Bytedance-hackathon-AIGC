# Current Data Model (V2 per-shot pipeline)

> Snapshot date: 2026-05-28. Supersedes the V1 ERD. The V1 single-shot tables (`storyboard_shot`, `generation_job`, `workspace_video_archive`) are removed; the per-shot V2 tables below are now the source of truth.

Postgres is the required business fact source. The runtime schema is initialized from `apps/server/src/db/schema/schema.ts` (and mirrored to `apps/server/src/db/schema/schema.sql`).

Local work directories may contain `.daireel/workspace.json`, traces, materials, downloaded source clips, or final video files, but those local files are recovery and artifact storage. The authoritative workspace, shot, artifact, batch, candidate, selection, job, trace, and final-video facts live in Postgres.

## Enums

```text
shot_status          DRAFT | IMAGE_PROMPT_PROPOSING | IMAGE_PROMPT_READY | IMAGE_PROMPT_EDITED |
                     IMAGE_GENERATING | IMAGE_CANDIDATES_READY | IMAGE_SELECTED |
                     VIDEO_SCRIPT_PROPOSING | VIDEO_SCRIPT_READY | VIDEO_SCRIPT_EDITED |
                     VIDEO_GENERATING | VIDEO_CANDIDATES_READY | VIDEO_SELECTED | FAILED
artifact_status_v2   DRAFT | ACTIVE | APPROVED | STALE | ARCHIVED
batch_status         PENDING | RUNNING | SUCCEEDED | PARTIAL | FAILED | CANCELLED
candidate_status     PENDING | RUNNING | SUCCEEDED | FAILED | REJECTED
job_status_v2        PENDING | RUNNING | SUCCEEDED | FAILED | RETRYING | CANCELLED
final_video_status   PENDING | RUNNING | SUCCEEDED | FAILED | CANCELLED
```

## Preserved Upstream Tables (unchanged from V1)

```text
Product
  id
  title
  sellingPoints
  audience
  mainImageAssetId          # optional reference to Asset
  createdAt

Asset
  id
  type                      # product_image | reference_image | generated_clip | final_video | audio | subtitle
  url
  source                    # upload | ark-seedream | seedance | tts | mock | local archive
  metadata
  createdAt

CreativeWorkspace
  id
  localPath                 # unique local project directory path
  currentScriptId           # preallocated current creative-line/script id
  currentJobId              # optional pointer to most recent active generation job
  status                    # draft -> materials_ready -> ... -> video_ready / failed
  traceFile                 # local trace path (.daireel/trace/events.jsonl)
  createdAt
  updatedAt
  lastSeenAt

WorkspaceArtifact
  id
  workspaceId               # FK to CreativeWorkspace
  scriptId                  # creative line id associated with this artifact
  artifactType              # material | brief | storyboard | shotprompt | feedback_route
  status                    # proposed | approved | stale | failed
  data                      # JSON artifact payload
  createdAt
  updatedAt
  approvedAt
  unique(workspaceId, artifactType)

Script
  id
  productId                 # FK to Product
  jobId                     # optional FK to GenerationJob (legacy reference; V2 jobs live in GenerationJobs)
  parentScriptId            # optional FK to Script
  version
  narrative
  visualStyle
  frozen
  frozenAt
  rawJson                   # V0 CreativeBlueprint + trace + improvement hints (legacy)
  createdAt
```

## V2 Per-Shot Tables

```text
StoryboardShots
  id
  workspaceId               # FK to CreativeWorkspace
  scriptId                  # soft pointer to script.id snapshot
  orderIndex                # 0-based shot index within the workspace
  title
  objective
  defaultDurationSec        # nullable
  status                    # shot_status enum
  nextAction                # cached nextAction label (derived from status by shot.state.ts)
  activeImagePromptArtifactId   # read-cache; synced inside the same tx as artifact change
  selectedImageId               # read-cache; synced with selected_shot_images
  activeVideoScriptArtifactId   # read-cache
  selectedVideoId               # read-cache; synced with selected_shot_videos
  lastError                 # nullable; populated when status moves to FAILED
  createdAt
  updatedAt
  unique(workspaceId, orderIndex)

ShotAssetRefs
  id
  shotId                    # FK to StoryboardShots, cascade on delete
  assetId                   # FK to Asset
  role                      # product_identity | reference_style | reference_scene | first_frame_hint | other
  weight                    # numeric(4,2), default 1.0
  createdAt
  unique(shotId, assetId, role)

ImagePromptArtifacts
  id
  shotId                    # FK to StoryboardShots, cascade on delete
  version                   # monotonic per (shotId)
  status                    # artifact_status_v2 enum; at most one ACTIVE per shot
  promptText
  negativePrompt
  referenceAssetIds         # text[]
  promptJson                # full StoryboardImagePromptOutput from the agent (when available)
  createdBy                 # agent | user | system
  agentName                 # nullable
  promptTemplateVersion     # e.g. "v1"
  baseArtifactId            # nullable, FK to ImagePromptArtifacts (the version this was derived from)
  createdAt
  unique(shotId, version)

ImageGenerationBatches
  id
  workspaceId               # FK to CreativeWorkspace
  shotId                    # FK to StoryboardShots, cascade
  imagePromptArtifactId     # FK to ImagePromptArtifacts (must be ACTIVE at create time)
  status                    # batch_status enum
  requestedCount
  succeededCount
  failedCount
  provider                  # ark-seedream
  aspectRatio               # 9:16 | 16:9 | 1:1
  providerRequest           # JSON snapshot of the provider call payload
  errorMessage              # nullable
  idempotencyKey            # unique
  createdAt
  updatedAt

ImageCandidates
  id
  batchId                   # FK to ImageGenerationBatches, cascade
  workspaceId               # FK to CreativeWorkspace
  shotId                    # FK to StoryboardShots, cascade
  imageUrl                  # nullable on FAILED
  objectKey                 # nullable
  width
  height
  seed                      # nullable; provider-supplied
  provider
  providerResponse          # JSON of the raw provider candidate
  status                    # candidate_status enum
  errorMessage              # nullable
  createdAt

SelectedShotImages
  id
  shotId                    # FK to StoryboardShots, cascade; UNIQUE so each shot has one selection
  imageCandidateId          # FK to ImageCandidates
  imageGenerationBatchId    # FK to ImageGenerationBatches
  selectedBy                # nullable; user identifier
  selectedAt

VideoScriptArtifacts
  id
  shotId                    # FK to StoryboardShots, cascade
  version                   # monotonic per (shotId)
  status                    # artifact_status_v2 enum
  durationSec               # 1..8
  scriptJson                # full VideoShotScriptOutput from the agent
  providerPrompt            # the Seedance-ready prompt string used at generation time
  basedOnImageCandidateId   # FK to ImageCandidates — the selected image for this shot
  basedOnPrevImageCandidateId   # nullable, FK to ImageCandidates — neighbor selection at proposal time
  basedOnNextImageCandidateId   # nullable, FK to ImageCandidates
  createdBy                 # agent | user | system
  agentName                 # nullable
  promptTemplateVersion
  baseArtifactId            # nullable, FK to VideoScriptArtifacts
  createdAt
  unique(shotId, version)

VideoGenerationBatches
  id
  workspaceId               # FK to CreativeWorkspace
  shotId                    # FK to StoryboardShots, cascade
  videoScriptArtifactId     # FK to VideoScriptArtifacts (must be ACTIVE at create time)
  status                    # batch_status enum
  requestedCount
  succeededCount
  failedCount
  provider                  # seedance
  aspectRatio
  providerRequest
  errorMessage              # nullable
  idempotencyKey            # unique
  createdAt
  updatedAt

VideoCandidates
  id
  batchId                   # FK to VideoGenerationBatches, cascade
  workspaceId               # FK to CreativeWorkspace
  shotId                    # FK to StoryboardShots, cascade
  videoUrl                  # nullable on FAILED
  objectKey                 # nullable
  thumbnailUrl              # nullable
  durationSec               # nullable on FAILED
  width
  height
  provider                  # seedance
  providerResponse
  status                    # candidate_status enum
  errorMessage              # nullable
  createdAt

SelectedShotVideos
  id
  shotId                    # FK to StoryboardShots, cascade; UNIQUE per shot
  videoCandidateId          # FK to VideoCandidates
  videoGenerationBatchId    # FK to VideoGenerationBatches
  selectedBy                # nullable
  selectedAt

GenerationJobs                              # generic V2 jobs table replacing legacy generation_job
  id
  workspaceId               # FK to CreativeWorkspace
  shotId                    # nullable; FK to StoryboardShots (null for compose jobs)
  jobType                   # generate_images | generate_videos | compose_final_video
  status                    # job_status_v2 enum
  queueName                 # "generation_v2"
  queueJobId                # nullable; BullMQ id when useRedisQueue=true
  relatedBatchType          # image_generation_batch | video_generation_batch | final_video_job
  relatedBatchId            # id of the related batch / final video job
  payload                   # JSON; small metadata only (the batch id is the real anchor)
  progress                  # 0..100
  attemptCount
  maxAttempts               # default 3
  errorMessage              # nullable
  startedAt
  completedAt
  createdAt
  updatedAt

TraceEvents
  id
  workspaceId               # FK to CreativeWorkspace
  shotId                    # nullable; FK to StoryboardShots (null for workspace-level events)
  traceType                 # agent_run | provider_call | job_event | state_transition | user_action
  name                      # human-readable event name
  inputPreview              # nullable; short prefix of the input
  outputPreview             # nullable; short prefix of the output
  metadata                  # JSON; provider/model/latency/counts/etc.
  createdAt
  # index (workspaceId, createdAt desc); index (shotId, createdAt desc)

FinalVideoJobs
  id
  workspaceId               # FK to CreativeWorkspace
  status                    # final_video_status enum
  sourceShotVideoIds        # text[]; snapshot of selected VideoCandidates.ids in order_index order at create time
  sourceVideoScriptArtifactIds  # text[]; parallel snapshot of script ids (audit trail)
  localPath                 # nullable; local mp4 path written by the compose worker
  localUrl                  # nullable; app-served URL for download
  durationSec               # nullable
  width
  height
  compiledManifest          # JSON; { schemaVersion, workspaceId, sources[], transition, outputAspectRatio }
  compiledManifestHash      # sha256:... ; deterministic across identical runs
  ffmpegLog                 # last 2 kB of stderr from the compose ffmpeg call
  errorMessage              # nullable
  idempotencyKey            # unique
  createdAt
  updatedAt
  completedAt
```

## Relationships

```text
Product.mainImageAssetId -> Asset.id
Product 1 -> n Script
Asset n <- m ShotAssetRefs

CreativeWorkspace 1 -> n WorkspaceArtifact
CreativeWorkspace 1 -> n StoryboardShots
CreativeWorkspace 1 -> n GenerationJobs
CreativeWorkspace 1 -> n FinalVideoJobs
CreativeWorkspace 1 -> n TraceEvents

StoryboardShots 1 -> n ImagePromptArtifacts
StoryboardShots 1 -> n ImageGenerationBatches
StoryboardShots 1 -> n ImageCandidates
StoryboardShots 1 -> 0..1 SelectedShotImages
StoryboardShots 1 -> n VideoScriptArtifacts
StoryboardShots 1 -> n VideoGenerationBatches
StoryboardShots 1 -> n VideoCandidates
StoryboardShots 1 -> 0..1 SelectedShotVideos
StoryboardShots 1 -> n ShotAssetRefs
StoryboardShots 1 -> n TraceEvents
StoryboardShots 1 -> n GenerationJobs

ImagePromptArtifacts 1 -> n ImageGenerationBatches
ImagePromptArtifacts 1 -> n ImagePromptArtifacts (baseArtifactId self-FK)
ImageGenerationBatches 1 -> n ImageCandidates
ImageCandidates 1 -> 0..1 SelectedShotImages

VideoScriptArtifacts 1 -> n VideoGenerationBatches
VideoScriptArtifacts 1 -> n VideoScriptArtifacts (baseArtifactId self-FK)
VideoScriptArtifacts.basedOnImageCandidateId          -> ImageCandidates.id (required)
VideoScriptArtifacts.basedOnPrevImageCandidateId      -> ImageCandidates.id (nullable)
VideoScriptArtifacts.basedOnNextImageCandidateId      -> ImageCandidates.id (nullable)
VideoGenerationBatches 1 -> n VideoCandidates
VideoCandidates 1 -> 0..1 SelectedShotVideos

GenerationJobs.relatedBatchId points at one of:
  ImageGenerationBatches.id  (when relatedBatchType = image_generation_batch)
  VideoGenerationBatches.id  (when relatedBatchType = video_generation_batch)
  FinalVideoJobs.id          (when relatedBatchType = final_video_job)
  # soft FK — no SQL FK; resolved by jobType + relatedBatchType

FinalVideoJobs.sourceShotVideoIds[i]            -> VideoCandidates.id (snapshot)
FinalVideoJobs.sourceVideoScriptArtifactIds[i]  -> VideoScriptArtifacts.id (snapshot)
```

## Cache-Column Invariants (StoryboardShots)

The four cache columns on `StoryboardShots` are denormalized read caches. Every transaction that changes the source-of-truth row also updates the cache column in the same transaction:

```text
StoryboardShots.activeImagePromptArtifactId
  <- source: ImagePromptArtifacts row with (shot_id, status='ACTIVE')

StoryboardShots.selectedImageId
  <- source: SelectedShotImages.imageCandidateId for this shot

StoryboardShots.activeVideoScriptArtifactId
  <- source: VideoScriptArtifacts row with (shot_id, status='ACTIVE')

StoryboardShots.selectedVideoId
  <- source: SelectedShotVideos.videoCandidateId for this shot
```

Repository-enforced invariants:

```text
At most one ACTIVE artifact per (shot_id, artifact_type).
  Enforced by SELECT FOR UPDATE + status flip in the same transaction.

Creating a video batch requires the script to be ACTIVE.
  generationService.createVideoBatch validates inside the same tx; otherwise 409 STALE_SCRIPT.

Idempotency keys are unique per batch table.
  POST .../image-batches, POST .../video-batches, POST .../final-videos all require Idempotency-Key
  and dedupe via ON CONFLICT (idempotency_key) DO NOTHING.

A final video job's sources are immutable.
  source_shot_video_ids and source_video_script_artifact_ids are snapshotted at create time
  in order_index order; later changes to selections do not retro-update existing jobs.
```

## Stale Propagation (V2)

```text
USER_EDIT_IMAGE_PROMPT(shotId)
  -> active VideoScriptArtifacts for the shot become STALE
  -> SelectedShotImages is preserved until the user re-selects
  -> Old batches are kept as history

USER_SELECT_IMAGE(shotId, candidateId)  -- when candidateId differs from current selection
  -> active VideoScriptArtifacts become STALE
  -> SelectedShotVideos row is dropped

USER_EDIT_VIDEO_SCRIPT(shotId, scriptId)
  -> prior VideoScriptArtifact (version v-1) becomes STALE
  -> SelectedShotVideos referencing it is dropped

PROPOSE_VIDEO_SCRIPT replacing an existing ACTIVE
  -> prior ACTIVE becomes STALE
  -> SelectedShotVideos referencing it is dropped
```

## Mermaid ERD

```mermaid
erDiagram
  PRODUCT ||--o{ SCRIPT : owns
  ASSET ||--o{ PRODUCT : "main image"
  ASSET ||--o{ SHOT_ASSET_REFS : ref

  CREATIVE_WORKSPACE ||--o{ WORKSPACE_ARTIFACT : has_current
  CREATIVE_WORKSPACE ||--o{ STORYBOARD_SHOTS : has
  CREATIVE_WORKSPACE ||--o{ GENERATION_JOBS : runs
  CREATIVE_WORKSPACE ||--o{ FINAL_VIDEO_JOBS : composes
  CREATIVE_WORKSPACE ||--o{ TRACE_EVENTS : logs

  STORYBOARD_SHOTS ||--o{ SHOT_ASSET_REFS : references
  STORYBOARD_SHOTS ||--o{ IMAGE_PROMPT_ARTIFACTS : versions
  STORYBOARD_SHOTS ||--o{ IMAGE_GENERATION_BATCHES : runs
  STORYBOARD_SHOTS ||--o{ IMAGE_CANDIDATES : produces
  STORYBOARD_SHOTS ||--o| SELECTED_SHOT_IMAGES : picks
  STORYBOARD_SHOTS ||--o{ VIDEO_SCRIPT_ARTIFACTS : versions
  STORYBOARD_SHOTS ||--o{ VIDEO_GENERATION_BATCHES : runs
  STORYBOARD_SHOTS ||--o{ VIDEO_CANDIDATES : produces
  STORYBOARD_SHOTS ||--o| SELECTED_SHOT_VIDEOS : picks
  STORYBOARD_SHOTS ||--o{ TRACE_EVENTS : emits
  STORYBOARD_SHOTS ||--o{ GENERATION_JOBS : owns

  IMAGE_PROMPT_ARTIFACTS ||--o{ IMAGE_GENERATION_BATCHES : drives
  IMAGE_PROMPT_ARTIFACTS ||--o{ IMAGE_PROMPT_ARTIFACTS : base
  IMAGE_GENERATION_BATCHES ||--o{ IMAGE_CANDIDATES : contains
  IMAGE_CANDIDATES ||--o| SELECTED_SHOT_IMAGES : chosen

  VIDEO_SCRIPT_ARTIFACTS ||--o{ VIDEO_GENERATION_BATCHES : drives
  VIDEO_SCRIPT_ARTIFACTS ||--o{ VIDEO_SCRIPT_ARTIFACTS : base
  IMAGE_CANDIDATES ||--o{ VIDEO_SCRIPT_ARTIFACTS : "based_on (self / prev / next)"
  VIDEO_GENERATION_BATCHES ||--o{ VIDEO_CANDIDATES : contains
  VIDEO_CANDIDATES ||--o| SELECTED_SHOT_VIDEOS : chosen

  PRODUCT {
    text id PK
    text title
    text selling_points
    text audience
    text main_image_asset_id
    timestamptz created_at
  }

  ASSET {
    text id PK
    text type
    text url
    text source
    jsonb metadata
    timestamptz created_at
  }

  CREATIVE_WORKSPACE {
    text id PK
    text local_path UK
    text current_script_id
    text current_job_id
    text status
    text trace_file
    timestamptz created_at
    timestamptz updated_at
    timestamptz last_seen_at
  }

  WORKSPACE_ARTIFACT {
    text id PK
    text workspace_id FK
    text script_id
    text artifact_type
    text status
    jsonb data
    timestamptz created_at
    timestamptz updated_at
    timestamptz approved_at
  }

  SCRIPT {
    text id PK
    text product_id FK
    text job_id
    text parent_script_id FK
    integer version
    text narrative
    text visual_style
    boolean frozen
    timestamptz frozen_at
    jsonb raw_json
    timestamptz created_at
  }

  STORYBOARD_SHOTS {
    text id PK
    text workspace_id FK
    text script_id
    int order_index
    text title
    text objective
    int default_duration_sec
    shot_status status
    text next_action
    text active_image_prompt_artifact_id
    text selected_image_id
    text active_video_script_artifact_id
    text selected_video_id
    text last_error
    timestamptz created_at
    timestamptz updated_at
  }

  SHOT_ASSET_REFS {
    text id PK
    text shot_id FK
    text asset_id FK
    text role
    numeric weight
    timestamptz created_at
  }

  IMAGE_PROMPT_ARTIFACTS {
    text id PK
    text shot_id FK
    int version
    artifact_status_v2 status
    text prompt_text
    text negative_prompt
    text_array reference_asset_ids
    jsonb prompt_json
    text created_by
    text agent_name
    text prompt_template_version
    text base_artifact_id FK
    timestamptz created_at
  }

  IMAGE_GENERATION_BATCHES {
    text id PK
    text workspace_id FK
    text shot_id FK
    text image_prompt_artifact_id FK
    batch_status status
    int requested_count
    int succeeded_count
    int failed_count
    text provider
    text aspect_ratio
    jsonb provider_request
    text error_message
    text idempotency_key UK
    timestamptz created_at
    timestamptz updated_at
  }

  IMAGE_CANDIDATES {
    text id PK
    text batch_id FK
    text workspace_id FK
    text shot_id FK
    text image_url
    text object_key
    int width
    int height
    text seed
    text provider
    jsonb provider_response
    candidate_status status
    text error_message
    timestamptz created_at
  }

  SELECTED_SHOT_IMAGES {
    text id PK
    text shot_id FK_UK
    text image_candidate_id FK
    text image_generation_batch_id FK
    text selected_by
    timestamptz selected_at
  }

  VIDEO_SCRIPT_ARTIFACTS {
    text id PK
    text shot_id FK
    int version
    artifact_status_v2 status
    int duration_sec
    jsonb script_json
    text provider_prompt
    text based_on_image_candidate_id FK
    text based_on_prev_image_candidate_id FK
    text based_on_next_image_candidate_id FK
    text created_by
    text agent_name
    text prompt_template_version
    text base_artifact_id FK
    timestamptz created_at
  }

  VIDEO_GENERATION_BATCHES {
    text id PK
    text workspace_id FK
    text shot_id FK
    text video_script_artifact_id FK
    batch_status status
    int requested_count
    int succeeded_count
    int failed_count
    text provider
    text aspect_ratio
    jsonb provider_request
    text error_message
    text idempotency_key UK
    timestamptz created_at
    timestamptz updated_at
  }

  VIDEO_CANDIDATES {
    text id PK
    text batch_id FK
    text workspace_id FK
    text shot_id FK
    text video_url
    text object_key
    text thumbnail_url
    int duration_sec
    int width
    int height
    text provider
    jsonb provider_response
    candidate_status status
    text error_message
    timestamptz created_at
  }

  SELECTED_SHOT_VIDEOS {
    text id PK
    text shot_id FK_UK
    text video_candidate_id FK
    text video_generation_batch_id FK
    text selected_by
    timestamptz selected_at
  }

  GENERATION_JOBS {
    text id PK
    text workspace_id FK
    text shot_id FK
    text job_type
    job_status_v2 status
    text queue_name
    text queue_job_id
    text related_batch_type
    text related_batch_id
    jsonb payload
    numeric progress
    int attempt_count
    int max_attempts
    text error_message
    timestamptz started_at
    timestamptz completed_at
    timestamptz created_at
    timestamptz updated_at
  }

  TRACE_EVENTS {
    text id PK
    text workspace_id FK
    text shot_id FK
    text trace_type
    text name
    text input_preview
    text output_preview
    jsonb metadata
    timestamptz created_at
  }

  FINAL_VIDEO_JOBS {
    text id PK
    text workspace_id FK
    final_video_status status
    text_array source_shot_video_ids
    text_array source_video_script_artifact_ids
    text local_path
    text local_url
    int duration_sec
    int width
    int height
    jsonb compiled_manifest
    text compiled_manifest_hash
    text ffmpeg_log
    text error_message
    text idempotency_key UK
    timestamptz created_at
    timestamptz updated_at
    timestamptz completed_at
  }
```

## Indexes (per `apps/server/src/db/schema/schema.ts`)

```text
idx_storyboard_shots_workspace            (workspace_id)
idx_storyboard_shots_status               (status)
idx_image_prompt_artifacts_shot           (shot_id)
idx_image_prompt_artifacts_status         (status)
idx_image_batches_shot                    (shot_id)
idx_image_candidates_batch                (batch_id)
idx_video_script_artifacts_shot           (shot_id)
idx_video_batches_shot                    (shot_id)
idx_video_candidates_batch                (batch_id)
idx_generation_jobs_status                (status)
idx_generation_jobs_related_batch         (related_batch_type, related_batch_id)
idx_trace_events_workspace                (workspace_id, created_at desc)
idx_trace_events_shot                     (shot_id, created_at desc)
```

## Removed in V2 (compared with V1 ERD)

```text
storyboard_shot          DROP — replaced by storyboard_shots (workspace-scoped, status-machine-driven)
generation_job           DROP — replaced by generation_jobs (generic three-kind queue: images / videos / final compose)
workspace_video_archive  DROP — final mp4 is now persisted under FinalVideoJobs.localPath + localUrl
```

## V2 Workspace Invariants

```text
A CreativeWorkspace is recognized by Postgres localPath plus its local .daireel/workspace.json manifest.
CreativeWorkspace.currentScriptId is the current creative line id.

shotprompt approval seeds StoryboardShots with one DRAFT row per shot.index, ordered by orderIndex.
Re-approving shotprompt wipes prior shots (V2 P0 does not support per-shot insert/delete after seeding).

Per-shot state machine + nextAction map live in apps/server/src/modules/shot/shot.state.ts (pure functions, no DB).
Stale propagation runs inside the same transaction as the upstream change (see Stale Propagation above).

Each shot owns at most one ACTIVE ImagePromptArtifact and at most one ACTIVE VideoScriptArtifact.
Versioning is monotonic per (shot_id, artifact_type); prior ACTIVE flips to STALE in the same tx as the new INSERT.

Each shot owns at most one SelectedShotImages row and at most one SelectedShotVideos row (UNIQUE on shot_id).
Re-selecting the same candidate is a no-op; re-selecting a different candidate fires stale propagation downstream.

Cache columns on StoryboardShots (active_image_prompt_artifact_id, selected_image_id,
active_video_script_artifact_id, selected_video_id) are synchronized in the same tx as the source-of-truth change.

Idempotency-Key is required on POST .../image-batches, POST .../video-batches, POST .../final-videos.
Replay returns the existing row without re-enqueueing.

GenerationJobs is the generic queue lookup. The relatedBatchType + relatedBatchId pair resolves to the
ImageGenerationBatches / VideoGenerationBatches / FinalVideoJobs row the job is processing.

FinalVideoJobs snapshots the source_shot_video_ids and source_video_script_artifact_ids in order_index
order at create time. The compiled_manifest_hash is deterministic across identical runs — re-running with
the same selections + transition + outputAspectRatio reproduces the same hash.

TraceEvents is the canonical queryable trace source. The workspace-local .daireel/trace/events.jsonl
is kept for local debugging via FileTraceLogger.
```

## Legacy V0 Note

V0 invariants (frozen Script, parentScriptId, etc.) still hold for any historical `Script` rows. The V0 single-shot wizard (`creative-blueprint`, `regenerate-shot`, `POST /api/creation/jobs`) is fully removed from the active surface; only package-level legacy schemas in `packages/ai/src/legacy/` remain for compatibility tests.
