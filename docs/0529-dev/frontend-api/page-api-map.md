# Page API Map

本文按页面/组件列出前端需要接入的接口。具体字段以 `openapi.yaml` 为准。

| 页面/组件 | 接口 | 调用时机 | 备注 |
|---|---|---|---|
| Workspace 首页 | `GET /api/workspaces` | 页面加载 | 展示历史 workspace |
| Workspace 首页 | `POST /api/workspaces` | 点击新建项目 | 返回 `workspaceId` |
| Workspace 恢复 | `GET /api/workspaces/:workspaceId/directory` | 打开历史项目 | 返回本地工作目录 |
| Workspace 状态栏 | `POST /api/workspaces/status` | 进入项目、阶段完成后刷新 | 展示当前阶段和下一步 |
| 素材上传区 | `POST /api/workspaces/materials` | 用户上传文件 | 支持 JSON base64 和 multipart |
| 素材确认区 | `POST /api/workspaces/material-intake` | 点击分析素材 | 生成 material artifact |
| Brief 编辑区 | `POST /api/workspaces/brief/propose` | 点击生成 brief | 返回 proposed artifact |
| Brief 编辑区 | `POST /api/workspaces/artifacts/brief/approve` | 点击确认 brief | 推进状态 |
| Storyboard 编辑区 | `POST /api/workspaces/storyboard/propose` | 点击生成 storyboard | 依赖 approved brief |
| Storyboard 编辑区 | `POST /api/workspaces/artifacts/storyboard/approve` | 点击确认 storyboard | 推进状态 |
| ShotPrompt 编辑区 | `POST /api/workspaces/shotprompt/compile` | 点击编译 prompt | 依赖 approved storyboard |
| ShotPrompt 编辑区 | `POST /api/workspaces/artifacts/shotprompt/approve` | 点击确认 prompt | 创建 shots |
| Shot 列表 | `GET /api/workspaces/:workspaceId/shots` | 进入 shot 工作台 | 获取 shot 列表 |
| Shot 状态条 | `GET /api/workspaces/:workspaceId/shot-workflow-status` | 轮询或阶段完成刷新 | 获取每个 shot 的下一步 |
| 图片 Prompt 面板 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | 点击生成图片 prompt | agent 输出 |
| 图片 Prompt 面板 | `PATCH /api/shots/:shotId/image-prompts/:artifactId` | 用户编辑 prompt | 创建新版本 |
| 图片候选面板 | `POST /api/shots/:shotId/image-batches` | 点击生成图片 | 需要 `Idempotency-Key` |
| 图片候选面板 | `GET /api/shots/:shotId/image-batches/:batchId` | 轮询 batch | 直到终态 |
| 图片候选面板 | `POST /api/shots/:shotId/selected-image` | 用户选择图片 | 推进到视频脚本阶段 |
| 视频脚本面板 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | 点击生成视频脚本 | 依赖 selected image |
| 视频候选面板 | `POST /api/shots/:shotId/video-batches` | 点击生成视频 | 需要 `Idempotency-Key` |
| 视频候选面板 | `GET /api/shots/:shotId/video-batches/:batchId` | 轮询 batch | 直到终态 |
| 视频候选面板 | `POST /api/shots/:shotId/selected-video` | 用户选择视频 | shot 完成 |
| 最终合成区 | `POST /api/workspaces/:workspaceId/final-videos` | 所有 shot 完成后点击合成 | 需要 `Idempotency-Key` |
| 最终合成区 | `GET /api/final-videos/:finalVideoJobId` | 轮询合成任务 | 直到终态 |

