# Database Migration Plan

## 目标

把 workspace 的逻辑记录和实际存储位置拆开，让数据库可以表达“会话已创建但尚未绑定工作目录/S3”的状态。

## Schema 变更

1. 新增枚举或 text check：

```sql
create type workspace_storage_kind as enum ('LOCAL', 'S3');
create type workspace_storage_status as enum ('ACTIVE', 'ARCHIVED');
```

2. 新增 `workspace_storage_bindings`：

```sql
create table workspace_storage_bindings (
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
  updated_at timestamptz not null default now()
);
```

3. 约束：

- active binding 按 workspace 唯一：`unique (workspace_id) where status = 'ACTIVE'`。
- active local target 唯一：`unique (local_path_normalized) where status = 'ACTIVE' and kind = 'LOCAL'`。
- active S3 target 唯一：`unique (s3_bucket, s3_prefix) where status = 'ACTIVE' and kind = 'S3'`。
- `LOCAL` 必须有 `local_path_normalized`，`S3` 必须有 `s3_bucket` 和 `s3_prefix`。

4. `creative_workspace` 迁移：

- v1 保留 `local_path` 作为兼容字段，但改成 nullable，并移除或放宽 `unique local_path`。
- 后续 v2 再删除 `local_path`，所有读写都走 binding 表。
- 可选新增 `name text`，用于 `POST /api/workspaces` 创建 logical workspace 时展示。

## 数据回填

1. 对现有 `creative_workspace.local_path is not null` 的行创建 `LOCAL` binding。
2. `local_path_normalized` 用后端统一 normalize 规则生成，数据库只保存结果。
3. 如果发现重复 local path，保留最近 `last_seen_at` 的 workspace 为 active，其余标记为迁移冲突并阻断启动。

## 回滚

1. 保留 `creative_workspace.local_path` 到 v1 完成验收后再删除，因此回滚时旧逻辑仍可读取。
2. 删除新 route 前先停止写入 `workspace_storage_bindings`。
3. 如需回滚数据，按 active local binding 回写 `creative_workspace.local_path`。

## 验收 SQL

```sql
select workspace_id, count(*)
from workspace_storage_bindings
where status = 'ACTIVE'
group by workspace_id
having count(*) > 1;
```

该查询必须返回 0 行。
