# 数据看板视频收藏入口

Status: Proposed
Owner: Project team
Created: 2026-06-20
Applies To: Data dashboard, dashboard video list, dashboard diagnosis deep links
Depends On: Global dashboard video registry semantics

## Summary

用户希望在数据看板中收藏一个视频。收藏后，用户切到数据看板的视频列表时，可以在顶部快速找到该视频的数据看板入口，并直接进入对应诊断页面。

该能力应被定义为“用户对数据看板视频的个人入口偏好”，而不是视频资产本身的业务属性。`DashboardVideoArtifact` 仍表示一个视频已经进入数据面板视频库；收藏表示当前用户希望它在视频列表顶部更容易被访问。

## Business Logic

- 收藏作用域应默认跟随全局 dashboard 视频库，而不是 workspace 局部状态。
- workspace id 在 dashboard 深链中主要是返回上下文；不应导致收藏的视频在全局列表和 workspace 来源入口之间表现不一致。
- 推荐支持多收藏。视频列表顶部展示一个“收藏的视频”区域，按收藏时间倒序排列。
- 如果未来需要“默认诊断入口”或“主收藏”，再在收藏记录上增加 `is_primary` 或 `pin_order`，不要一开始把收藏限制为单条。
- 收藏必须是幂等操作：重复收藏同一个视频不会创建重复记录；取消收藏已取消的视频也不应报错。

## Recommended Data Model

推荐新增独立表，而不是在 `dashboard_video_artifacts` 上直接加全局 `is_pinned`：

```sql
create table dashboard_video_pins (
  id text primary key,
  dashboard_video_artifact_id text not null references dashboard_video_artifacts(id) on delete cascade,
  user_id text not null,
  pinned_at timestamptz not null default now(),
  pin_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uniq_dashboard_video_pins_user_artifact
  on dashboard_video_pins(user_id, dashboard_video_artifact_id);

create index idx_dashboard_video_pins_user_pinned_at
  on dashboard_video_pins(user_id, pinned_at desc);
```

当前项目仍是单租户开发 API。实现时可以先使用固定 `user_id = 'current-user'`，但表结构和 API 语义应保留用户维度，避免以后从全局布尔值迁移。

## API Shape

新增接口：

```text
PUT /api/dashboard/videos/:artifactId/pin
DELETE /api/dashboard/videos/:artifactId/pin
```

扩展现有列表接口：

```text
GET /api/dashboard/videos
```

`DashboardVideoArtifact` response 增加：

```ts
{
  pinnedAt: string | null;
  pinOrder?: number | null;
}
```

前端仍从同一个全局视频列表派生收藏区：

```ts
const pinnedDashboardVideos = dashboardVideos
  .filter((video) => video.pinnedAt)
  .sort((a, b) => String(b.pinnedAt).localeCompare(String(a.pinnedAt)));
```

## Frontend UX

- 在 `DashboardVideoList` 顶部增加“收藏的视频”区域。
- 收藏区域中的每个条目展示缩略图、名称、核心生成因子、进入诊断按钮、取消收藏按钮。
- 普通视频列表行增加收藏/取消收藏操作。
- 点击收藏入口进入：

```text
/dashboard?view=diagnosis&videoId=<dashboardVideoArtifactId>
```

- 如果入口来自工作台深链，应保留：

```text
returnWorkspaceId=<workspaceId>
```

这样全局视频库和返回工作台两个语义不会混在一起。

## Migration Plan

1. Additive DB migration: create `dashboard_video_pins` and indexes.
2. Backend service: add `pin`, `unpin`, and list join logic.
3. API contract: add pin/unpin endpoints and `pinnedAt` response field.
4. Frontend API client: add `pinDashboardVideoArtifact` and `unpinDashboardVideoArtifact`.
5. View model: derive `pinnedDashboardVideos` from the global dashboard video list.
6. UI: render the pinned section above the normal video list.
7. Docs: update `docs/core/architecture/data_model.md`, `docs/core/contracts/interface.md`, `docs/core/contracts/openapi.yaml`, and `docs/core/architecture/frontend.md`.

## Tests

- API test: repeated pin is idempotent and returns the same pinned state.
- API test: repeated unpin is idempotent.
- API test: global video list returns `pinnedAt`.
- UI/view model test: pinned videos appear at the top section without removing them from the normal list.
- Route test: pinned entry opens diagnosis with `videoId` and preserves `returnWorkspaceId` when present.

## Open Decisions

- Whether pinning should update `pinnedAt` when the user clicks an already-pinned item. Recommendation: no for plain “收藏”; yes only if the UI exposes “置顶”.
- Whether future authenticated users should have separate personal pins or team-shared pins. Recommendation: start with personal pins, add shared collection later if requested.
