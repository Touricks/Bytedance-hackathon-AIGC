# Capability Map

本文列出产品能力和接口之间的关系。PM 维护“用户动作/业务能力/体验”，技术同学维护接口路径。

## 用户侧 - agent模块
| 模块 | 文件 |
|---|---|
| Material Intake | `modules/material-intake.md` |
| Product Brief | `modules/product-brief.md` |
| Storyboard | `modules/storyboard.md` |
| Shot Prompt | `modules/shotprompt.md` |
| Image Prompt | `modules/image-prompt.md` |
| Video Script | `modules/video-script.md` |
| Feedback Route | `modules/feedback-route.md` |

## 用户侧 - 总列表 (Controller)
| 用户动作 | 系统能力 | 关键接口 | 成功结果 | 当前状态 |
|---|---|---|---|---|
| 创建新会话 | 创建 workspace 和 manifest | `POST /api/workspaces` | 进入项目编辑流 | 已实现 |
| 打开历史会话 | 根据 workspaceId 找到本地目录 | `GET /api/workspaces/:workspaceId/directory` | 恢复项目上下文 | 已实现 |
| 上传素材 | 保存素材并生成素材引用 | `POST /api/workspaces/materials` | 素材出现在素材库 | 已实现 |
| 分析素材 | AI 识别素材并生成素材 artifact | `POST /api/workspaces/material-intake` | 进入 Brief 生成 | 已实现 |
| 生成 Brief | AI 生成商品卖点和创意方向 | `POST /api/workspaces/brief/propose` | Brief 待用户确认 | 已实现 |
| 确认 Brief | 用户审批 Brief | `POST /api/workspaces/artifacts/brief/approve` | 进入 Storyboard 生成 | 已实现 |
| 生成 Storyboard | AI 生成分镜 | `POST /api/workspaces/storyboard/propose` | Storyboard 待用户确认 | 已实现 |
| 确认 Storyboard | 用户审批分镜 | `POST /api/workspaces/artifacts/storyboard/approve` | 进入 Prompt 编译 | 已实现 |
| 编译 Shot Prompt | 系统生成 Seedance prompt | `POST /api/workspaces/shotprompt/compile` | Prompt 待确认 | 已实现 |
| 确认 Shot Prompt | 用户审批并创建 shots | `POST /api/workspaces/artifacts/shotprompt/approve` | 进入逐镜头工作台 | 已实现 |
| 生成图片候选 | 按镜头生成图片 | `POST /api/shots/:shotId/image-batches` | 图片候选生成中 | 已实现 |
| 选择图片 | 确定视频首帧/参考图 | `POST /api/shots/:shotId/selected-image` | 进入视频脚本 | 已实现 |
| 生成视频候选 | 按镜头生成视频 | `POST /api/shots/:shotId/video-batches` | 视频候选生成中 | 已实现 |
| 选择视频 | 确定该镜头视频 | `POST /api/shots/:shotId/selected-video` | shot 完成 | 已实现 |
| 合成最终视频 | 合并所有已选镜头视频 | `POST /api/workspaces/:workspaceId/final-videos` | 最终视频生成中 | 已实现 |
| 保存视频 | 将视频保存到当前工作目录并在数据库中保存生成记录 | 
| 下载视频 | 将视频下载到指定的位置 |
| 上传记录 | 记录该视频发布的平台与kol渠道 |
| 查看记录 | 查看该视频在特定平台和kol渠道上的点击量 |


## 功能侧 (Service)
| 服务 | 关键接口 | 成功结果 | 当前状态 |
|---|---|---|---|---|
| 多模态文本模型调用 | POST |
| 多模态文本模型任务进度轮询 | GET | 
| 多模态文本模型任务结果查看 | GET |  
| 图文生图图片模型调用 | POST |
| 图文生图图片模型任务进度轮询 | GET | 
| 图文生图图片模型任务结果查看 | GET |  
| 首尾帧生视频模型调用 | POST |
| 首尾帧生视频模型任务进度轮询 | GET | 
| 首尾帧生视频模型任务结果查看 | GET |  

| 上传素材保存(到.daireel) | 
| 模型返回的素材信息保存(到.daireel) | 
| 模型返回的Brief保存(到.daireel) | 
| 模型返回的Storyboard保存(到.daireel) | 
| 模型返回的ShotPrompt保存(到.daireel) | 
| 模型返回特定shot的分镜图（多张及批次）保存(到.daireel) | 
| 模型返回特定shot的分镜视频（多张及批次）保存(到.daireel) | 
| 模型返回完整视频保存(到.daireel) | 
| 查找用户指定的宣发平台和kol渠道保存 |
| 查找用户保存的发布于宣发平台和kol渠道的点击量 | 