# Regression Cases

本文记录每次改接口后容易回归的点。

## Workspace

- `GET /api/workspaces/:workspaceId/directory` 必须只读，不应触发 manifest 状态刷新。
- workspaceId 不存在必须返回 404。
- `POST /api/workspaces/status` 仍负责完整状态刷新。

## Generation

- 缺少 `Idempotency-Key` 时必须返回 400。
- 相同 `Idempotency-Key` 重复请求不应创建重复 batch/job。
- batch 查询必须返回 candidates。

## Final compose

- 任意 shot 缺少 selected video 时必须返回 409。
- 合成成功后 file endpoint 返回 `video/mp4`。
- 文件未准备好时返回 `NOT_READY`。

## Known gaps

- `GET /api/shots/:shotId/image-batches` 当前返回 `501`。
- `GET /api/shots/:shotId/video-batches` 当前返回 `501`。
- `GET/PATCH /api/shots/:shotId/asset-refs` 前端已有调用，但后端未实现。

