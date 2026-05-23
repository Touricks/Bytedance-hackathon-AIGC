export const schemaSql = `
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

create table if not exists generation_job (
  id text primary key,
  product_id text not null references product(id),
  status text not null,
  stage text not null,
  progress integer not null default 0,
  payload jsonb not null,
  trace jsonb not null default '[]'::jsonb,
  error_message text,
  final_asset_id text references asset(id),
  script_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists script (
  id text primary key,
  product_id text not null references product(id),
  job_id text references generation_job(id),
  parent_script_id text references script(id),
  version integer not null,
  narrative text not null,
  visual_style text not null,
  frozen boolean not null default false,
  frozen_at timestamptz,
  raw_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists storyboard_shot (
  id text primary key,
  script_id text not null references script(id),
  shot_index integer not null,
  duration_sec integer not null,
  purpose text,
  visual_prompt text not null,
  camera_motion text not null,
  voiceover text not null,
  subtitle text not null,
  media_asset_id text references asset(id),
  status text not null
);

alter table storyboard_shot add column if not exists purpose text;
`;
