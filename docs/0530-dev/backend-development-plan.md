# Backend Development Plan

更新时间：2026-05-30

## 目标

本阶段目标是把 0529 产品与 Prompt API 文档落到后端契约和测试闭环：

- 统一 workspace artifact pipeline 与 per-shot image/video workflow 的公开 API。
- 补齐后端状态机不变量：approve 后 seed shots、image select 后解锁下一镜头、所有图片选定后才解锁视频、所有视频选定后才 final compose。
- 固化 provider 边界：Ark 只负责可确认的中间 artifact 草稿；Seedream / Seedance 只消费后端注入后的确定性上下文。
- 建立 OpenAPI + Postman + Node test 三层测试入口。

## 当前代码基线

| 层 | 当前位置 | 说明 |
|---|---|---|
| Fastify app | `apps/server/src/app.ts` | 注册 system、workspace、material、shot、generation、campaign、trace 路由；静态文件读取已有 path traversal 防护。 |
| Workspace pipeline | `apps/server/src/modules/workspace/*` | 创建/恢复 workspace、上传素材、material/brief/storyboard/shotprompt propose/approve。 |
| Shot workflow | `apps/server/src/modules/shot/*` | image prompt、image batch、image select、video script、video batch、video select、retry。 |
| Generation | `apps/server/src/modules/generation/*` | image/video batch job 与 final compose job 创建；worker 负责 provider 调用和 ffmpeg。 |
| Persistence | `apps/server/src/db/schema/schema.sql` | `creative_workspace`、`workspace_artifact`、`storyboard_shots`、prompt artifacts、candidates、selections、jobs、campaign publications / metrics、trace events。 |
| Provider/prompt | `packages/ai/src/*`、`packages/shared/src/*` | Prompt workflow、provider adapter、artifact schema、shotprompt compiler。 |
| Tests | `apps/server/src/**/*.test.ts`、`apps/server/test/integration/*.integration.test.ts` | 已有 API/unit/provider smoke 基础，但需要按 0529 新契约补齐断言。 |

## 0529 -> 0530 差距

| 问题 | 当前表现 | 0530 决策 |
|---|---|---|
| 路径命名不完全一致 | Prompt 文档倾向 workspace-scoped select，如 `/api/workspaces/:workspaceId/shots/:shotId/image-candidates/select`；代码当前还有 `/api/shots/:shotId/selected-image`。 | 保留当前兼容路径，新增 workspace-scoped 路径作为前端稳定契约。 |
| image-prompt 职责分裂 | Prompt 文档说 propose 可直接产出候选；代码当前是 propose prompt artifact 后再 create batch。 | 0530 后端先保留两步兼容接口，同时新增 round 视图，把一轮 prompt + batch + candidates 聚合给前端。 |
| select stale 规则冲突 | 0529 Prompt 文档要求 select 不 stale；当前 `selectImage` 会调用 stale rule。 | 修改为 select 只 UPSERT selection；stale 仅发生在 re-propose / re-generate。补回归测试。 |
| scene reference 注入不足 | image prompt 当前依赖 `referenceAssetIds`，未强制注入上一 shot selected image。 | 后端按 shot order 注入：shot 0 用 primary product asset，shot N 用 shot N-1 selected image URL。 |
| video script 解锁条件偏宽 | 当前只要求当前 shot 有 selected image。 | 按文档改为所有 shots 都 image-selected 后才能批量/并行生成视频；单 shot 也要校验 first/last frame 来源。 |
| provider 边界需要护栏 | 已有 provider guard 测试，但成片 prompt 不应再经 Ark text 需要更明确。 | 增加测试：approved shotprompt -> Seedance/final prompt 不调用 Ark text；每个 `shots[].providerPrompt` byte-level 进入最终 prompt。 |
| 候选选择校验不足 | select 入参只校验 schema，业务上还要校验 candidate 状态、shot 归属、ACTIVE 轮次。 | select service 统一校验 candidate 属于当前 shot、当前 ACTIVE round、状态 `SUCCEEDED`。 |
| OpenAPI/Postman 需同步 | 0529 OpenAPI 偏“当前实际路由”，Postman 可跑但缺 0530 新同步点。 | `docs/0530-dev/openapi.yaml` 定义目标契约，Postman 计划按 contract/regression/provider 三层组织。 |

## 目标后端架构

```mermaid
flowchart LR
  FE["Frontend / Postman"] --> C["Fastify Controllers"]
  C --> Z["Zod Request Schemas"]
  Z --> WS["WorkspaceService"]
  Z --> SH["ShotWorkflowService"]
  Z --> GEN["GenerationService"]
  WS --> ART["workspace_artifact repository"]
  SH --> SHDB["storyboard_shots / artifacts / candidates / selections"]
  GEN --> JOB["generation_jobs + BullMQ"]
  JOB --> WK["image/video/final workers"]
  WK --> PROV["Ark / Seedream / Seedance providers"]
  WS --> TRACE["trace_events + .daireel/trace/events.jsonl"]
  SH --> TRACE
  GEN --> TRACE
```

架构分层约束：

- Controller 只做 route、Zod parse、HTTP error mapping，不写业务分支。
- Service 负责业务不变量和事务，例如 approve seed shots、select UPSERT、all-shots selected gate、idempotency。
- Repository/DB client 只封装 SQL，不推断下一步业务动作。
- Provider adapter 不读 DB，不知道 workspace 状态，只消费已经组装好的 provider request。
- Worker 可以持久化 provider 24h URL，但不能重新解释 artifact 语义。

## 开发阶段

### Phase 0: 契约冻结与现状保护

输出：

- `docs/0530-dev/openapi.yaml`。
- Postman 测试计划。
- 现有测试基线：`pnpm --filter @aigc-video/server test`。

验收：

- OpenAPI 能被 YAML parser 读取。
- 当前兼容路径不被删除。
- 对已存在 dirty worktree 不做 reset / clean。

### Phase 1: API 契约对齐

任务：

- 新增 storage binding 契约：
  - `GET /api/workspaces/:workspaceId/storage`
  - `POST /api/workspaces/:workspaceId/storage/bind`
- `POST /api/workspaces` 改为只创建 logical workspace；如果未绑定 storage，`/api/workspaces/status` 返回 `BIND_STORAGE`，素材上传与 artifact/shot workflow 返回 `STORAGE_NOT_BOUND` 或等价业务错误。
- `GET /api/workspaces` 从数据库列出 workspace 和 storage summary，不再按 managed root 扫描目录。
- 新增 workspace-scoped alias：
  - `POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select`
  - `POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select`
  - `GET /api/workspaces/:workspaceId/shots/:shotId/image-rounds`
  - `GET /api/workspaces/:workspaceId/shots/:shotId/video-rounds`
- 保留 `/api/shots/:shotId/selected-image`、`/api/shots/:shotId/selected-video` 兼容现有前端/测试。
- 请求字段统一使用 `userDirection`；兼容 `userHint`，服务层归一化。

验收：

- 新旧路径返回同一业务结构。
- OpenAPI 与 Zod request schema 对齐。
- storage binding 唯一性测试覆盖：同 workspace 不能绑定不同 storage，同 localPath/S3 `bucket+prefix` 不能绑定多个 workspace。
- 未绑定 storage 的 workspace 只能进入 `BIND_STORAGE` 状态，不能上传素材或推进 artifact/shot workflow。
- Postman contract smoke 能跑通 system + workspace + artifact + shot list。
- 当前状态：已实现 workspace-scoped select alias、image/video rounds 聚合查询，并在 `docs/0530-dev/openapi.yaml` 与 `docs/0530-dev/bytedancehack-0530.postman_collection.json` 中同步。

### Phase 2: Workflow 不变量修复

任务：

- `selectImage` / `selectVideo` 改成纯同步点，不触发 stale。
- image propose 自动注入 `image_ref`：
  - shot 0: `materialIntake.primaryProductRef` 的稳定素材 URL。
  - shot N: `selected_shot_images[shot N-1].url`。
- video propose 校验 workspace 内所有 shot 都 image-selected，再注入 first/last frame。
- candidate select 校验 ACTIVE round、candidate 归属、状态 `SUCCEEDED`。
- final compose 保持拉模式：每次读取当下 `selected_shot_videos`。

验收：

- `shot.stale.unit.test.ts` 覆盖 select 不 stale、re-propose stale。
- `shot.workflow.api.test.ts` 覆盖 image/video select 幂等、非法 candidate、失败 candidate。
- `final-compose-contract.integration.test.ts` 覆盖重新 select 后 final compose 使用最新选择。

### Phase 3: Provider boundary hardening

任务：

- `approved shotprompt -> Seedance prompt` 只走 deterministic compiler。
- 成片任务优先使用 `job.payload.shotprompt`，legacy script 只作为 fallback。
- Seedance prompt 的“逐镜头时间线”包含每个 `shots[].providerPrompt` 原文。
- video export 阶段不调用 Ark text provider，只调用 Seedance video provider / deterministic compiler。
- 所有 provider-facing prompt 使用中文组装。

验收：

- provider boundary 测试断言 Ark text provider 在 video export 阶段调用次数为 0。
- unit test 断言最终 prompt 包含每个 `shots[].providerPrompt`。
- real provider smoke 前执行 `pnpm db:clear -- --yes`，并使用新的测试 workspace。

### Phase 4: 后端测试闭环

任务：

- Unit/API tests:
  - Zod schema parse / error code。
  - workspace storage 404、未绑定、重复绑定。
  - material upload size/type/path。
  - approve seed shots。
  - idempotency key dedupe。
  - selected image/video UPSERT。
- Integration tests:
  - mock full pipeline。
  - image provider smoke。
  - video provider expensive smoke。
  - final compose with ffmpeg。
- Postman tests:
  - contract smoke。
  - regression negative cases。
  - provider runbook。

验收：

- `pnpm --filter @aigc-video/server test` 通过。
- provider smoke 可通过环境变量显式开启，默认不跑真实模型。
- Postman Runner 能按顺序自动回填 `workspaceId`、`shotId`、candidate/batch/job ids。

### Phase 5: Campaign / KOL 接口预留

任务：

- 新增 `campaign` 模块，提供 workspace-scoped 发布记录与数据回填接口：
  - `POST /api/workspaces/:workspaceId/campaign-publications`
  - `GET /api/workspaces/:workspaceId/campaign-publications`
  - `GET /api/workspaces/:workspaceId/campaign-publications/:publicationId`
  - `POST /api/workspaces/:workspaceId/campaign-publications/:publicationId/metrics`
- 新增 `campaign_publications` 和 `campaign_publication_metrics` 表，只保存本地业务记录，不调用外部平台。
- `finalVideoJobId` 可选；提供时必须属于同一个 workspace。
- metrics 以手动快照方式回填 `impressions/clicks/conversions/spendCents`，后端返回 `ctr = clicks / impressions`。

验收：

- Contract test 覆盖 publication 创建、列表、指标写入、workspace 隔离。
- OpenAPI 与 Postman collection 包含 Campaign / KOL 分组。
- `pnpm db:clear -- --yes` 会清理 campaign 业务表。

## 需要优先落地的代码任务

| 优先级 | 任务 | 代码入口 | 测试入口 |
|---|---|---|---|
| P0 | 修正 select 不 stale | `apps/server/src/modules/shot/shot.service.ts` | `shot.stale.unit.test.ts`、`shot.workflow.api.test.ts` |
| P0 | candidate select 业务校验 | `shot.service.ts` + DB helper | `shot.workflow.api.test.ts` |
| P0 | all-shots image-selected gate | `proposeVideoScript` | `shot.workflow.api.test.ts` |
| P0 | deterministic Seedance prompt 护栏 | `packages/shared/src/shotprompt/compiler.ts` / generation worker | provider boundary tests |
| P1 | workspace-scoped select aliases | `shot.controller.ts` | API tests + Postman |
| P1 | image/video rounds 聚合查询 | `shot.service.ts` | API tests |
| P1 | OpenAPI 与 Postman collection 生成/同步 | docs + optional script | YAML validation + collection smoke |
| P2 | KOL 发布/点击量接口预留 | `apps/server/src/modules/campaign/*` | `campaign.api.test.ts` + Postman Campaign / KOL |

## 完成定义

- 后端公开 API 有 `openapi.yaml` 对应。
- 每个新增或调整 route 有成功、关键失败、幂等/状态机测试。
- Postman 测试计划覆盖本地 mock、真实 provider smoke、expensive video flow 三种运行模式。
- provider boundary 能回答：“最终 Seedance prompt 的每一句来自哪个 artifact 字段。”
- 用户确认过的 artifact 在下游不会被 LLM 静默改写。
