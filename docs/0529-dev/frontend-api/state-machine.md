# State Machine

本文给前端控制按钮可用性、步骤显示和轮询终止条件使用。

## Workspace 状态

| 状态 | 产品含义 | 推荐下一步 |
|---|---|---|
| `draft` | 项目刚创建 | 上传素材 |
| `materials_ready` | 素材已准备 | 生成 brief |
| `brief_proposed` | brief 已生成待确认 | 用户审批 brief |
| `brief_approved` | brief 已确认 | 生成 storyboard |
| `storyboard_proposed` | storyboard 已生成待确认 | 用户审批 storyboard |
| `storyboard_approved` | storyboard 已确认 | 编译 shotprompt |
| `shotprompt_proposed` | shotprompt 已生成待确认 | 用户审批 shotprompt |
| `shotprompt_approved` | shots 已创建 | 进入 shot workflow |
| `video_generating` | 旧流程视频生成中 | 轮询状态 |
| `video_ready` | 旧流程视频完成 | 查看成片 |
| `failed` | 工作区失败 | 展示错误和重试入口 |
| `missing` | 工作区缺失 | 引导重新选择或创建 |

## Shot 状态

| 状态 | UI 含义 | 推荐动作 |
|---|---|---|
| `DRAFT` | shot 刚创建 | 生成图片 prompt |
| `IMAGE_PROMPT_PROPOSING` | 图片 prompt 生成中 | 禁用重复提交 |
| `IMAGE_PROMPT_READY` | 图片 prompt 已生成 | 允许编辑或生成图片 |
| `IMAGE_PROMPT_EDITED` | 用户已编辑图片 prompt | 允许生成图片 |
| `IMAGE_GENERATING` | 图片生成中 | 轮询 image batch |
| `IMAGE_CANDIDATES_READY` | 图片候选已就绪 | 选择图片 |
| `IMAGE_SELECTED` | 已选择图片 | 生成视频脚本 |
| `VIDEO_SCRIPT_PROPOSING` | 视频脚本生成中 | 禁用重复提交 |
| `VIDEO_SCRIPT_READY` | 视频脚本已生成 | 允许编辑或生成视频 |
| `VIDEO_SCRIPT_EDITED` | 用户已编辑视频脚本 | 允许生成视频 |
| `VIDEO_GENERATING` | 视频生成中 | 轮询 video batch |
| `VIDEO_CANDIDATES_READY` | 视频候选已就绪 | 选择视频 |
| `VIDEO_SELECTED` | 已选择视频 | 等待所有 shots 完成 |
| `FAILED` | shot 失败 | 展示重试入口 |

## Batch 终态

以下状态可以停止轮询：

```text
SUCCEEDED
PARTIAL
FAILED
CANCELLED
```

