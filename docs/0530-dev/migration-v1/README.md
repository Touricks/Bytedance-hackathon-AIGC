# Migration v1: Logical Workspace + Storage Binding

更新时间：2026-05-30

## 背景

当前代码仍把 `creative_workspace.local_path` 当作 workspace 本体，`POST /api/workspaces` 会在 managed root 下自动创建目录，`GET /api/workspaces` 也主要按本地目录扫描/过滤。这会让 workspace id、local path、未来 S3 root 混在一起。

v1 迁移目标是把“启动会话”和“设定工作目录”拆开：

- workspace 是数据库里的逻辑会话。
- local directory / S3 location 是 workspace 的一对一 storage binding。
- `GET /api/workspaces` 从数据库列出所有会话及其绑定状态。
- 未绑定 storage 的 workspace 只能返回 `BIND_STORAGE`，不能上传素材或推进 artifact/shot workflow。
- 废弃自动在 managed root 下新建目录的旧 `POST /api/workspaces` 语义。

## 文件

| 文件 | 内容 |
|---|---|
| `database-plan.md` | 表结构、约束、回填和回滚计划。 |
| `backend-plan.md` | Service、route、storage resolver、兼容入口和状态机改造计划。 |
| `test-contract-plan.md` | `openapi.yaml`、Postman collection、API/unit/integration 测试更新计划。 |

## 推荐执行顺序

1. 数据库先加 `workspace_storage_bindings`，并从现有 `creative_workspace.local_path` 回填 local binding。
2. 后端新增 storage binding repository/service，不改变现有调用方。
3. 修改 `POST /api/workspaces` / `GET /api/workspaces` / status / materials 等入口语义。
4. 更新 `docs/0530-dev/openapi.yaml` 和 Postman collection。
5. 跑 `pnpm --filter @aigc-video/server typecheck`，再跑 `pnpm --filter @aigc-video/server test`。

## 完成定义

- `GET /api/workspaces` 完全由 DB 返回，不依赖 managed root 扫描。
- `POST /api/workspaces` 只创建 logical workspace，不创建目录。
- `POST /api/workspaces/:workspaceId/storage/bind` 支持 local 和 S3 目标，并保证 1:1 唯一性。
- 未绑定 storage 时 downstream route 返回明确业务错误。
- Postman 主流程改为 create workspace -> bind storage -> status -> materials -> artifact/shot workflow。

## 执行记录

2026-05-30 已落地 v1 代码迁移：

- 新增 `workspace_storage_bindings` schema、partial unique indexes 与旧 `creative_workspace.local_path` 回填。
- `POST /api/workspaces` 已改为创建 logical workspace；`/api/workspaces/init` 保留为本地目录兼容入口。
- 新增 `GET /api/workspaces/:workspaceId/storage` 和 `POST /api/workspaces/:workspaceId/storage/bind`。
- workspace status、素材上传、静态文件读取、generated asset 持久化、final compose 均改为通过 active local storage binding 解析路径。
- OpenAPI、Postman collection、Postman plan 与架构注释已同步。
