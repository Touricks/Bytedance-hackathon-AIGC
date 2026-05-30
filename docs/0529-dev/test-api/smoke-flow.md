# Smoke Flow

本文定义最小冒烟流程，用于确认服务和主链路没有断。

## 最小接口序列

1. `GET /api/health`
2. `POST /api/workspaces`
3. `GET /api/workspaces/:workspaceId/directory`
4. `POST /api/workspaces/materials`
5. `POST /api/workspaces/material-intake`
6. `POST /api/workspaces/brief/propose`
7. `POST /api/workspaces/artifacts/brief/approve`
8. `POST /api/workspaces/storyboard/propose`
9. `POST /api/workspaces/artifacts/storyboard/approve`
10. `POST /api/workspaces/shotprompt/compile`
11. `POST /api/workspaces/artifacts/shotprompt/approve`
12. `GET /api/workspaces/:workspaceId/shots`
13. 单个 shot 完成 image prompt、image batch、select image
14. 单个 shot 完成 video script、video batch、select video
15. 所有 shot 完成后 `POST /api/workspaces/:workspaceId/final-videos`

## 冒烟通过标准

- 每一步返回 2xx 或预期状态。
- workspaceId、shotId、batchId、finalVideoJobId 能正确传递。
- 生成任务能进入终态。
- trace 查询能返回相关事件。

