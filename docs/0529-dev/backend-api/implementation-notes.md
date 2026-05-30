# Implementation Notes

本文记录后端实现约定和容易踩坑的地方。

## Workspace directory lookup

`GET /api/workspaces/:workspaceId/directory` 是只读轻量接口，只读取 `creative_workspace.local_path`，不触发 manifest 校验、素材扫描或状态刷新。

适用场景：

- 前端打开历史项目时恢复本地路径。
- 调试项目路径问题。

不适用场景：

- 判断 workspace 是否健康。
- 刷新 artifacts。
- 推进 pipeline 状态。

这些场景应使用 `POST /api/workspaces/status`。

## 幂等任务

创建生成任务的接口必须要求 `Idempotency-Key`，避免用户重复点击造成多批次生成：

- image batch
- video batch
- final video
- retry

## 静态文件读取

所有本地文件读取都必须确保目标路径在 workspace 管理目录内，防止 path traversal。

