-- v2 enums (created if missing)
do $$ begin create type shot_status as enum (
  'DRAFT','IMAGE_PROMPT_PROPOSING','IMAGE_PROMPT_READY','IMAGE_PROMPT_EDITED',
  'IMAGE_GENERATING','IMAGE_CANDIDATES_READY','IMAGE_SELECTED',
  'VIDEO_SCRIPT_PROPOSING','VIDEO_SCRIPT_READY','VIDEO_SCRIPT_EDITED',
  'VIDEO_GENERATING','VIDEO_CANDIDATES_READY','VIDEO_SELECTED','FAILED'
); exception when duplicate_object then null; end $$;
do $$ begin create type artifact_status_v2 as enum ('DRAFT','ACTIVE','APPROVED','STALE','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type batch_status as enum ('PENDING','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type candidate_status as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','REJECTED'); exception when duplicate_object then null; end $$;
do $$ begin create type job_status_v2 as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','RETRYING','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type final_video_status as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED'); exception when duplicate_object then null; end $$;

-- Preserved upstream tables (unchanged)
create table if not exists product (
  id text primary key,
  title text not null,
  selling_points text not null,
  audience text not null,
  main_image_asset_id text,
  created_at timestamptz not null default now()
);
create table if not exists asset (
  id text primary key,
  type text not null,
  url text not null,
  source text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create table if not exists creative_workspace (
  id text primary key,
  local_path text not null unique,
  current_script_id text not null,
  current_job_id text,
  status text not null,
  trace_file text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists workspace_artifact (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  script_id text not null,
  artifact_type text not null,
  status text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (workspace_id, artifact_type)
);
create table if not exists script (
  id text primary key,
  product_id text not null references product(id),
  job_id text,
  parent_script_id text references script(id),
  version integer not null,
  narrative text not null,
  visual_style text not null,
  frozen boolean not null default false,
  frozen_at timestamptz,
  raw_json jsonb not null,
  created_at timestamptz not null default now()
);

-- DROP legacy single-shot tables (must be after creative_workspace exists; no data preserved per spec).
drop table if exists workspace_video_archive cascade;
drop table if exists storyboard_shot cascade;
drop table if exists generation_job cascade;

-- v2 tables
create table if not exists storyboard_shots (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  script_id text not null,
  order_index int not null,
  title text not null,
  objective text,
  default_duration_sec int,
  status shot_status not null default 'DRAFT',
  next_action text,
  active_image_prompt_artifact_id text,
  selected_image_id text,
  active_video_script_artifact_id text,
  selected_video_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, order_index)
);
create index if not exists idx_storyboard_shots_workspace on storyboard_shots(workspace_id);
create index if not exists idx_storyboard_shots_status on storyboard_shots(status);

create table if not exists shot_asset_refs (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  asset_id text not null references asset(id),
  role text not null,
  weight numeric(4,2) not null default 1.0,
  created_at timestamptz not null default now(),
  unique (shot_id, asset_id, role)
);

create table if not exists image_prompt_artifacts (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  version int not null,
  status artifact_status_v2 not null default 'ACTIVE',
  prompt_text text not null,
  negative_prompt text,
  reference_asset_ids text[] not null default '{}',
  prompt_json jsonb not null default '{}'::jsonb,
  created_by text not null,
  agent_name text,
  prompt_template_version text,
  base_artifact_id text references image_prompt_artifacts(id),
  created_at timestamptz not null default now(),
  unique (shot_id, version)
);
create index if not exists idx_image_prompt_artifacts_shot on image_prompt_artifacts(shot_id);
create index if not exists idx_image_prompt_artifacts_status on image_prompt_artifacts(status);

create table if not exists image_generation_batches (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text not null references storyboard_shots(id) on delete cascade,
  image_prompt_artifact_id text not null references image_prompt_artifacts(id),
  status batch_status not null default 'PENDING',
  requested_count int not null,
  succeeded_count int not null default 0,
  failed_count int not null default 0,
  provider text not null,
  aspect_ratio text not null default '9:16',
  provider_request jsonb not null default '{}'::jsonb,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_image_batches_shot on image_generation_batches(shot_id);

create table if not exists image_candidates (
  id text primary key,
  batch_id text not null references image_generation_batches(id) on delete cascade,
  workspace_id text not null references creative_workspace(id),
  shot_id text not null references storyboard_shots(id) on delete cascade,
  image_url text,
  object_key text,
  width int,
  height int,
  seed text,
  provider text not null,
  provider_response jsonb not null default '{}'::jsonb,
  status candidate_status not null default 'PENDING',
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_image_candidates_batch on image_candidates(batch_id);

create table if not exists selected_shot_images (
  id text primary key,
  shot_id text not null unique references storyboard_shots(id) on delete cascade,
  image_candidate_id text not null references image_candidates(id),
  image_generation_batch_id text not null references image_generation_batches(id),
  selected_by text,
  selected_at timestamptz not null default now()
);

create table if not exists video_script_artifacts (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  version int not null,
  status artifact_status_v2 not null default 'ACTIVE',
  duration_sec int not null,
  script_json jsonb not null,
  provider_prompt text not null,
  based_on_image_candidate_id text not null references image_candidates(id),
  based_on_prev_image_candidate_id text references image_candidates(id),
  based_on_next_image_candidate_id text references image_candidates(id),
  created_by text not null,
  agent_name text,
  prompt_template_version text,
  base_artifact_id text references video_script_artifacts(id),
  created_at timestamptz not null default now(),
  unique (shot_id, version)
);
create index if not exists idx_video_script_artifacts_shot on video_script_artifacts(shot_id);

create table if not exists video_generation_batches (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text not null references storyboard_shots(id) on delete cascade,
  video_script_artifact_id text not null references video_script_artifacts(id),
  status batch_status not null default 'PENDING',
  requested_count int not null,
  succeeded_count int not null default 0,
  failed_count int not null default 0,
  provider text not null,
  aspect_ratio text not null default '9:16',
  provider_request jsonb not null default '{}'::jsonb,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_video_batches_shot on video_generation_batches(shot_id);

create table if not exists video_candidates (
  id text primary key,
  batch_id text not null references video_generation_batches(id) on delete cascade,
  workspace_id text not null references creative_workspace(id),
  shot_id text not null references storyboard_shots(id) on delete cascade,
  video_url text,
  object_key text,
  thumbnail_url text,
  duration_sec int,
  width int,
  height int,
  provider text not null,
  provider_response jsonb not null default '{}'::jsonb,
  status candidate_status not null default 'PENDING',
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_video_candidates_batch on video_candidates(batch_id);

create table if not exists selected_shot_videos (
  id text primary key,
  shot_id text not null unique references storyboard_shots(id) on delete cascade,
  video_candidate_id text not null references video_candidates(id),
  video_generation_batch_id text not null references video_generation_batches(id),
  selected_by text,
  selected_at timestamptz not null default now()
);

create table if not exists generation_jobs (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text references storyboard_shots(id) on delete set null,
  job_type text not null,
  status job_status_v2 not null default 'PENDING',
  queue_name text not null,
  queue_job_id text,
  related_batch_type text,
  related_batch_id text,
  payload jsonb not null default '{}'::jsonb,
  progress numeric(5,2) not null default 0,
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_generation_jobs_status on generation_jobs(status);
create index if not exists idx_generation_jobs_related_batch on generation_jobs(related_batch_type, related_batch_id);

create table if not exists trace_events (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text references storyboard_shots(id) on delete set null,
  trace_type text not null,
  name text not null,
  input_preview text,
  output_preview text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_trace_events_workspace on trace_events(workspace_id, created_at desc);
create index if not exists idx_trace_events_shot on trace_events(shot_id, created_at desc);

create table if not exists final_video_jobs (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  status final_video_status not null default 'PENDING',
  source_shot_video_ids text[] not null,
  source_video_script_artifact_ids text[] not null,
  local_path text,
  local_url text,
  duration_sec int,
  width int,
  height int,
  compiled_manifest jsonb not null default '{}'::jsonb,
  compiled_manifest_hash text,
  ffmpeg_log text,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
