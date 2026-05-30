# Frontend Workflow

本文描述前端如何按业务流程调用 API。字段细节以 `openapi.yaml` 为准。

## 主流程

```text
创建或选择 workspace
  -> 查询 workspace 状态
  -> 上传素材
  -> 运行 material intake
  -> 生成并审批 brief
  -> 生成并审批 storyboard
  -> 编译并审批 shotprompt
  -> 查询 shots
  -> 每个 shot 生成图片 prompt
  -> 创建图片 batch 并轮询
  -> 选择图片 candidate
  -> 生成视频 script
  -> 创建视频 batch 并轮询
  -> 选择视频 candidate
  -> 所有 shot 完成后合成 final video
```

## 主流程接口

| 步骤 | 接口 | 前端保存的关键变量 |
|---|---|---|
| 创建 workspace | `POST /api/workspaces` | `workspaceId`, `scriptId` |
| 查询目录 | `GET /api/workspaces/:workspaceId/directory` | `workspaceDirectory` |
| 查询状态 | `POST /api/workspaces/status` | `workspace.status`, `nextAction`, `artifacts` |
| 上传素材 | `POST /api/workspaces/materials` | `material.ref` |
| 素材理解 | `POST /api/workspaces/material-intake` | material artifact |
| 生成 brief | `POST /api/workspaces/brief/propose` | brief artifact data |
| 审批 brief | `POST /api/workspaces/artifacts/brief/approve` | workspace status |
| 生成 storyboard | `POST /api/workspaces/storyboard/propose` | storyboard artifact data |
| 审批 storyboard | `POST /api/workspaces/artifacts/storyboard/approve` | workspace status |
| 编译 shotprompt | `POST /api/workspaces/shotprompt/compile` | shotprompt artifact data |
| 审批 shotprompt | `POST /api/workspaces/artifacts/shotprompt/approve` | seeded shots |
| 查询 shots | `GET /api/workspaces/:workspaceId/shots` | `shotId` |
| 查询 workflow | `GET /api/workspaces/:workspaceId/shot-workflow-status` | active batch ids |
| 生成最终视频 | `POST /api/workspaces/:workspaceId/final-videos` | `finalVideoJobId` |

## 幂等请求

以下接口前端必须生成并传入 `Idempotency-Key`：

- `POST /api/shots/:shotId/image-batches`
- `POST /api/shots/:shotId/video-batches`
- `POST /api/workspaces/:workspaceId/final-videos`
- `POST /api/shots/:shotId/retry`

建议 key 格式：

```text
{action}-{shotId-or-workspaceId}-{uuid}
```

