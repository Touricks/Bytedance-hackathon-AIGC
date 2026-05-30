# Data Model Map

本文记录 API 和核心数据模型的关系。详细表结构参考 `../erd.md`。

| 业务模块 | 主要 API | 主要数据 |
|---|---|---|
| Workspace | `/api/workspaces*` | `creative_workspace`, workspace manifest |
| Workspace artifacts | material/brief/storyboard/shotprompt approve/propose | `workspace_artifact` |
| Shot workflow | `/api/workspaces/:workspaceId/shots`, `/api/shots/:shotId` | `shots` |
| Image prompt | `/api/shots/:shotId/image-prompts*` | image prompt artifact/version tables |
| Image generation | `/api/shots/:shotId/image-batches*` | `image_generation_batches`, image candidates, jobs |
| Selected image | `/api/shots/:shotId/selected-image` | `selected_shot_images` |
| Video script | `/api/shots/:shotId/video-scripts*` | video script artifact/version tables |
| Video generation | `/api/shots/:shotId/video-batches*` | `video_generation_batches`, video candidates, jobs |
| Selected video | `/api/shots/:shotId/selected-video` | `selected_shot_videos` |
| Final compose | `/api/workspaces/:workspaceId/final-videos*` | `final_video_jobs`, jobs |
| Trace | `/api/*/traces` | trace events |

## 注意

- Workspace directory 来自 `creative_workspace.local_path`。
- Shot workflow 的下一步动作由状态派生，不建议在前端硬编码业务判断。
- Final compose 依赖所有 shot 都存在 `selectedVideoId`。

