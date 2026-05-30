# Backend Migration Plan

## 目标

后端只把 workspace 当作逻辑会话处理。任何需要文件读写、trace、素材 URL、provider 结果转存的流程，都先解析 active storage binding。

## 新增模块

1. `WorkspaceStorageRepository`
   - `getActiveBinding(workspaceId)`
   - `bindLocal(workspaceId, localPath)`
   - `bindS3(workspaceId, target)`
   - `listWorkspacesWithStorage()`

2. `WorkspaceStorageService`
   - normalize local path。
   - 校验 workspace 存在。
   - 校验 workspace 未绑定其他 active storage。
   - 校验 storage target 未被其他 workspace 绑定。
   - 返回统一 `StorageBindingView`。

3. `WorkspaceStorageResolver`
   - downstream route 调用 `requireActiveStorage(workspaceId)`。
   - 未绑定时抛 `STORAGE_NOT_BOUND`，status route 返回 `nextAction=BIND_STORAGE`。

## Route 语义

| Route | 新语义 |
|---|---|
| `GET /api/workspaces` | 从 DB 返回 workspace 列表和 storage summary，不扫 managed root。 |
| `POST /api/workspaces` | 创建 logical workspace，可选 `name`，不创建目录。 |
| `GET /api/workspaces/:workspaceId/storage` | 返回 active binding 或 `bound=false`。 |
| `POST /api/workspaces/:workspaceId/storage/bind` | 绑定 local/S3；相同 target 幂等，不同 target 返回冲突。 |
| `GET /api/workspaces/:workspaceId/directory` | 从目标契约移除；代码可短期兼容到 storage API。 |
| `POST /api/workspaces/init` | 短期作为本地测试兼容入口：create/find workspace + bind local。 |

## Downstream 改造点

- `workspace.status`：先查 storage；未绑定直接 `BIND_STORAGE`。
- `materials` 上传：必须有 active storage；写入绑定目录或对象存储。
- `asset-url-resolver`：通过 binding 解析 `assetId -> stable URL/dataURL`。
- image/video worker：provider 24h URL 转存到 active storage 后再写 candidate。
- trace 写入：`.daireel/trace/events.jsonl` 路径由 binding 决定。
- final video file/download：通过 binding 解析稳定文件路径。

## 兼容策略

- v1 不删除旧 service 方法，先把内部实现改为 storage-aware。
- `creative_workspace.local_path` 只作为 legacy fallback，不再作为新写入的事实来源。
- Postman 和 OpenAPI 只展示新 storage binding contract。
- 前端迁移完成后再删除 `/directory` 与 managed root 相关代码。

## 错误码

| Code | 场景 |
|---|---|
| `STORAGE_NOT_BOUND` | workspace 存在但没有 active binding。 |
| `WORKSPACE_STORAGE_ALREADY_BOUND` | workspace 已绑定其他 target。 |
| `STORAGE_ALREADY_BOUND` | localPath 或 S3 bucket+prefix 已属于其他 workspace。 |
| `WORKSPACE_NOT_FOUND` | workspace id 不存在。 |
| `INVALID_STORAGE_TARGET` | local/S3 请求字段不完整或不可规范化。 |

## 验收

- 未绑定 workspace 不能上传素材、propose artifact、生成 image/video。
- 绑定后全链路仍可跑通 P0/P1/P2。
- `WORKSPACE_DIR` 不再是业务配置；如保留，只能用于旧兼容测试，不参与新 contract。
