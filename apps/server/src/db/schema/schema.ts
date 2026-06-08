export const schemaSql = `
-- current enums (created if missing)
do $$ begin create type shot_status as enum (
  'DRAFT','IMAGE_PROMPT_PROPOSING','IMAGE_PROMPT_READY','IMAGE_PROMPT_EDITED',
  'IMAGE_GENERATING','IMAGE_CANDIDATES_READY','IMAGE_SELECTED',
  'VIDEO_SCRIPT_PROPOSING','VIDEO_SCRIPT_READY','VIDEO_SCRIPT_EDITED',
  'VIDEO_GENERATING','VIDEO_CANDIDATES_READY','VIDEO_SELECTED','FAILED'
); exception when duplicate_object then null; end $$;
do $$ begin create type artifact_status as enum ('DRAFT','ACTIVE','APPROVED','STALE','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type batch_status as enum ('PENDING','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type candidate_status as enum ('PENDING','RUNNING','PERSISTING','SUCCEEDED','FAILED','REJECTED'); exception when duplicate_object then null; end $$;
alter type candidate_status add value if not exists 'PERSISTING';
do $$ begin create type job_status as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','RETRYING','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type final_video_status as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type workspace_storage_kind as enum ('LOCAL','S3'); exception when duplicate_object then null; end $$;
do $$ begin create type workspace_storage_status as enum ('ACTIVE','ARCHIVED'); exception when duplicate_object then null; end $$;

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
  local_path text,
  current_script_id text not null,
  current_job_id text,
  status text not null,
  trace_file text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table if exists creative_workspace alter column local_path drop not null;
alter table if exists creative_workspace drop constraint if exists creative_workspace_local_path_key;
create table if not exists workspace_storage_bindings (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  kind workspace_storage_kind not null,
  status workspace_storage_status not null default 'ACTIVE',
  local_path text,
  local_path_normalized text,
  s3_bucket text,
  s3_prefix text,
  s3_region text,
  s3_endpoint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_storage_local_target check (
    kind <> 'LOCAL' or local_path_normalized is not null
  ),
  constraint workspace_storage_s3_target check (
    kind <> 'S3' or (s3_bucket is not null and s3_prefix is not null)
  )
);
create unique index if not exists idx_workspace_storage_active_workspace
  on workspace_storage_bindings(workspace_id)
  where status = 'ACTIVE';
create unique index if not exists idx_workspace_storage_active_local
  on workspace_storage_bindings(local_path_normalized)
  where status = 'ACTIVE' and kind = 'LOCAL';
create unique index if not exists idx_workspace_storage_active_s3
  on workspace_storage_bindings(s3_bucket, s3_prefix)
  where status = 'ACTIVE' and kind = 'S3';
insert into workspace_storage_bindings (
  id,
  workspace_id,
  kind,
  status,
  local_path,
  local_path_normalized
)
select
  'wsb_' || replace(id, 'ws_', ''),
  id,
  'LOCAL'::workspace_storage_kind,
  'ACTIVE'::workspace_storage_status,
  local_path,
  local_path
from creative_workspace
where local_path is not null
on conflict do nothing;
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

create table if not exists prompt_requirements_artifacts (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  status text not null,
  is_current boolean not null default false,
  data jsonb not null,
  source_fingerprint jsonb not null default '{}'::jsonb,
  prompt_assembly jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index if not exists idx_prompt_requirements_current_approved
  on prompt_requirements_artifacts(workspace_id)
  where status = 'approved' and is_current = true;
create index if not exists idx_prompt_requirements_workspace_status
  on prompt_requirements_artifacts(workspace_id, status, created_at desc);

create table if not exists material_intake_artifacts (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  status text not null,
  is_current boolean not null default false,
  data jsonb not null,
  source_fingerprint jsonb not null default '{}'::jsonb,
  prompt_assembly jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index if not exists idx_material_intake_current_approved
  on material_intake_artifacts(workspace_id)
  where status = 'approved' and is_current = true;
create index if not exists idx_material_intake_workspace_status
  on material_intake_artifacts(workspace_id, status, created_at desc);

create table if not exists product_brief_artifacts (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  status text not null,
  is_current boolean not null default false,
  data jsonb not null,
  source_fingerprint jsonb not null default '{}'::jsonb,
  prompt_assembly jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index if not exists idx_product_brief_current_approved
  on product_brief_artifacts(workspace_id)
  where status = 'approved' and is_current = true;
create index if not exists idx_product_brief_workspace_status
  on product_brief_artifacts(workspace_id, status, created_at desc);

create table if not exists storyboard_artifacts (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  status text not null,
  is_current boolean not null default false,
  data jsonb not null,
  source_fingerprint jsonb not null default '{}'::jsonb,
  prompt_assembly jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index if not exists idx_storyboard_current_approved
  on storyboard_artifacts(workspace_id)
  where status = 'approved' and is_current = true;
create index if not exists idx_storyboard_workspace_status
  on storyboard_artifacts(workspace_id, status, created_at desc);

create table if not exists shot_prompt_artifacts (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  status text not null,
  is_current boolean not null default false,
  data jsonb not null,
  source_fingerprint jsonb not null default '{}'::jsonb,
  prompt_assembly jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index if not exists idx_shot_prompt_current_approved
  on shot_prompt_artifacts(workspace_id)
  where status = 'approved' and is_current = true;
create index if not exists idx_shot_prompt_workspace_status
  on shot_prompt_artifacts(workspace_id, status, created_at desc);

create table if not exists shot_sets (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  shot_prompt_artifact_id text not null references shot_prompt_artifacts(id),
  status text not null,
  source_fingerprint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists idx_shot_sets_active_workspace
  on shot_sets(workspace_id)
  where status = 'active';
create index if not exists idx_shot_sets_workspace_created
  on shot_sets(workspace_id, created_at desc);

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

-- current tables
create table if not exists storyboard_shots (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_set_id text references shot_sets(id) on delete cascade,
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
  updated_at timestamptz not null default now()
);
alter table if exists storyboard_shots
  add column if not exists shot_set_id text references shot_sets(id) on delete cascade;
alter table if exists storyboard_shots
  drop constraint if exists storyboard_shots_workspace_id_order_index_key;
create unique index if not exists idx_storyboard_shots_shot_set_order
  on storyboard_shots(shot_set_id, order_index)
  where shot_set_id is not null;
create index if not exists idx_storyboard_shots_workspace on storyboard_shots(workspace_id);
create index if not exists idx_storyboard_shots_status on storyboard_shots(status);

create table if not exists shot_prompt_requirements (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  shot_set_id text not null references shot_sets(id) on delete cascade,
  shot_id text not null unique references storyboard_shots(id) on delete cascade,
  shot_prompt_artifact_id text not null references shot_prompt_artifacts(id),
  shot_image jsonb not null,
  shot_video jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shot_prompt_requirements_shot_set
  on shot_prompt_requirements(shot_set_id);

create table if not exists shot_asset_refs (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  asset_id text not null references asset(id),
  role text not null,
  weight numeric(4,2) not null default 1.0,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (shot_id, asset_id, role)
);
alter table if exists shot_asset_refs
  add column if not exists position int not null default 0;

create table if not exists image_prompt_artifacts (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  version int not null,
  status artifact_status not null default 'ACTIVE',
  prompt_text text not null,
  negative_prompt text,
  reference_asset_ids text[] not null default '{}',
  prompt_json jsonb not null default '{}'::jsonb,
  source_fingerprint jsonb not null default '{}'::jsonb,
  prompt_assembly jsonb not null default '{}'::jsonb,
  created_by text not null,
  agent_name text,
  prompt_template_version text,
  base_artifact_id text references image_prompt_artifacts(id),
  created_at timestamptz not null default now(),
  unique (shot_id, version)
);
alter table if exists image_prompt_artifacts
  add column if not exists source_fingerprint jsonb not null default '{}'::jsonb;
alter table if exists image_prompt_artifacts
  add column if not exists prompt_assembly jsonb not null default '{}'::jsonb;
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

drop table if exists selected_shot_images cascade;
create table if not exists image_select_artifacts (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  shot_set_id text not null references shot_sets(id) on delete cascade,
  shot_id text not null unique references storyboard_shots(id) on delete cascade,
  image_candidate_id text not null references image_candidates(id),
  image_generation_batch_id text not null references image_generation_batches(id),
  selected_by text,
  selected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_image_select_artifacts_workspace
  on image_select_artifacts(workspace_id, shot_set_id);

create table if not exists video_script_artifacts (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  version int not null,
  status artifact_status not null default 'ACTIVE',
  duration_sec int not null,
  script_json jsonb not null,
  provider_prompt text not null,
  based_on_image_candidate_id text not null references image_candidates(id),
  based_on_prev_image_candidate_id text references image_candidates(id),
  based_on_next_image_candidate_id text references image_candidates(id),
  source_fingerprint jsonb not null default '{}'::jsonb,
  prompt_assembly jsonb not null default '{}'::jsonb,
  created_by text not null,
  agent_name text,
  prompt_template_version text,
  base_artifact_id text references video_script_artifacts(id),
  created_at timestamptz not null default now(),
  unique (shot_id, version)
);
alter table if exists video_script_artifacts
  add column if not exists source_fingerprint jsonb not null default '{}'::jsonb;
alter table if exists video_script_artifacts
  add column if not exists prompt_assembly jsonb not null default '{}'::jsonb;
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

drop table if exists selected_shot_videos cascade;
create table if not exists video_select_artifacts (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  shot_set_id text not null references shot_sets(id) on delete cascade,
  shot_id text not null unique references storyboard_shots(id) on delete cascade,
  video_candidate_id text not null references video_candidates(id),
  video_generation_batch_id text not null references video_generation_batches(id),
  selected_by text,
  selected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_video_select_artifacts_workspace
  on video_select_artifacts(workspace_id, shot_set_id);

create table if not exists generation_jobs (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text references storyboard_shots(id) on delete set null,
  job_type text not null,
  status job_status not null default 'PENDING',
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
  shot_set_id text references shot_sets(id) on delete set null,
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
alter table if exists final_video_jobs
  add column if not exists shot_set_id text references shot_sets(id) on delete set null;

create table if not exists dashboard_video_artifacts (
  id text primary key,
  workspace_id text,
  final_video_job_id text,
  name text not null,
  local_url text not null,
  duration_sec int,
  width int,
  height int,
  creative_factors jsonb not null,
  storage_kind text not null default 'LOCAL',
  storage_bucket text,
  video_object_key text,
  metadata_object_key text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop index if exists idx_dashboard_video_artifacts_factor_combo;
alter table if exists dashboard_video_artifacts
  add column if not exists storage_kind text not null default 'LOCAL',
  add column if not exists storage_bucket text,
  add column if not exists video_object_key text,
  add column if not exists metadata_object_key text,
  drop column if exists factor_combo_key,
  drop column if exists compiled_requirements_hash,
  drop column if exists attribution_eligible,
  drop column if exists creative_tags,
  drop column if exists creative_tags_schema_version,
  drop column if exists factor_prompt_version,
  drop column if exists prompt_requirements_artifact_id,
  drop column if exists shot_prompt_artifact_id,
  drop column if exists metadata;
create index if not exists idx_dashboard_video_artifacts_workspace
  on dashboard_video_artifacts(workspace_id, imported_at desc, created_at desc);
-- Dashboard is a decoupled published-video registry: workspace_id / final_video_job_id
-- are soft text references (no FK, no cascade) so artifacts survive workspace deletion.
alter table if exists dashboard_video_artifacts
  drop constraint if exists dashboard_video_artifacts_workspace_id_fkey,
  drop constraint if exists dashboard_video_artifacts_final_video_job_id_fkey,
  alter column workspace_id drop not null;
create unique index if not exists idx_dashboard_video_artifacts_job
  on dashboard_video_artifacts(final_video_job_id)
  where final_video_job_id is not null;

create table if not exists one_click_final_video_jobs (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  status text not null default 'PENDING',
  current_stage text not null default 'queued',
  stage_state jsonb not null default '{}'::jsonb,
  material_intake_artifact_id text references material_intake_artifacts(id),
  product_brief_artifact_id text references product_brief_artifacts(id),
  storyboard_artifact_id text references storyboard_artifacts(id),
  shot_prompt_artifact_id text references shot_prompt_artifacts(id),
  shot_set_id text references shot_sets(id) on delete set null,
  final_video_job_id text references final_video_jobs(id) on delete set null,
  auto_selection_strategy text not null default 'first_success',
  output_aspect_ratio text not null default '9:16',
  error_code text,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create unique index if not exists idx_one_click_final_video_active_workspace
  on one_click_final_video_jobs(workspace_id)
  where status in ('PENDING', 'RUNNING', 'WAITING');
create index if not exists idx_one_click_final_video_workspace_created
  on one_click_final_video_jobs(workspace_id, created_at desc);

create table if not exists shot_image_auto_selection_jobs (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  status text not null default 'PENDING',
  current_stage text not null default 'image_selection',
  stage_state jsonb not null default '{}'::jsonb,
  shot_set_id text references shot_sets(id) on delete set null,
  candidate_count int not null,
  auto_selection_strategy text not null default 'first_success',
  error_code text,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create unique index if not exists idx_shot_image_auto_selection_active_workspace
  on shot_image_auto_selection_jobs(workspace_id)
  where status in ('PENDING', 'RUNNING', 'WAITING');
create index if not exists idx_shot_image_auto_selection_workspace_created
  on shot_image_auto_selection_jobs(workspace_id, created_at desc);

-- 发布记录 / 投放数据: external KOL placement of a final video and its
-- cumulative metric snapshots. Replaces the retired campaign_* tables.
drop table if exists campaign_publication_metrics cascade;
drop table if exists campaign_publications cascade;

create table if not exists external_kol_publications (
  id text primary key,
  workspace_id text not null references creative_workspace(id) on delete cascade,
  job_id text references final_video_jobs(id) on delete set null,
  platform text not null,
  account_name text not null,
  publish_url text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_external_kol_publications_workspace
  on external_kol_publications(workspace_id, created_at desc);
create index if not exists idx_external_kol_publications_job
  on external_kol_publications(job_id);

create table if not exists external_kol_metrics (
  id text primary key,
  publication_id text not null references external_kol_publications(id) on delete cascade,
  impressions int not null default 0,
  clicks int not null default 0,
  conversions int not null default 0,
  spend_cents int not null default 0,
  gmv_cents int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_external_kol_metrics_publication
  on external_kol_metrics(publication_id, created_at desc);
`;
