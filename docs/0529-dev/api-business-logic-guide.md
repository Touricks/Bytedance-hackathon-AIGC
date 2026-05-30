# Bytedancehack API 业务分类说明书

更新时间：2026-05-29

本文按业务逻辑梳理当前后端实际暴露的 API，而不是按代码文件分类。接口来源以 `apps/server/src/app.ts` 和 `apps/server/src/modules/*/*.controller.ts` 中注册的 Fastify routes 为准。配套 Postman Collection 位于 `docs/bytedancehack-api.postman_collection.json`。

默认服务地址：

```text
http://localhost:3000
```

## 1. 接口返回约定

当前 API 没有完全统一成单一响应格式，主要有三类：

| 类型 | 常见返回 | 业务范围 |
|---|---|---|
| 直接业务对象 | `{ workspace, manifest }`、`{ workspaceRoot, workspaces }` | Workspace 初始化、状态、旧 pipeline |
| `data` 包装 | `{ data: ... }` | Shot workflow、batch 查询、final video、trace |
| Workflow envelope | `{ data, shotStatus?, nextAction?, warnings?, traceId? }` | 单镜头图片/视频生成链路 |

错误响应通常由 `toHttpError` 转换：

```json
{
  "statusCode": 400,
  "message": "error message",
  "code": "OPTIONAL_CODE"
}
```

以下接口要求请求头 `Idempotency-Key`：

| 接口 | 原因 |
|---|---|
| `POST /api/shots/:shotId/image-batches` | 避免重复创建图片生成批次 |
| `POST /api/shots/:shotId/video-batches` | 避免重复创建视频生成批次 |
| `POST /api/workspaces/:workspaceId/final-videos` | 避免重复创建最终合成任务 |
| `POST /api/shots/:shotId/retry` | 避免重复重试生成任务 |

## 2. 端到端业务主流程

推荐按以下业务顺序调用：

```text
创建/导入 workspace
  -> 上传素材
  -> material intake
  -> brief propose / approve
  -> storyboard propose / approve
  -> shotprompt compile / approve
  -> 查询 shots
  -> 每个 shot: image prompt -> image batch -> selected image
  -> 每个 shot: video script -> video batch -> selected video
  -> final video compose
  -> trace / file 查询
```

## 3. 系统与配置类 API

这类接口用于确认服务状态、获取前端配置和 pipeline contract。

| Method | Path | 业务用途 | 主要返回 |
|---|---|---|---|
| `GET` | `/api/health` | 服务健康检查 | `{ ok, runtime }` |
| `GET` | `/api/config/limits` | 查询批量生成限制、支持画幅 | `{ data: { defaultImageBatchSize, maxImageBatchSize, defaultVideoBatchSize, maxVideoBatchSize, aspectRatios } }` |
| `GET` | `/api/pipeline/contracts` | 获取当前 pipeline contract 定义 | contracts 对象 |
| `GET` | `/api/scripts/:jobId` | 按 job 查询旧脚本数据 | script detail |

## 4. Workspace 生命周期 API

Workspace 是当前业务流的根实体。它绑定本地目录、manifest、当前 script、当前 job 和 pipeline 状态。

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `GET` | `/api/workspaces` | 列出托管目录下的 workspace | 无 |
| `POST` | `/api/workspaces` | 创建托管 workspace | `{ "name": "demo" }`，`name` 可选 |
| `GET` | `/api/workspaces/:workspaceId/directory` | 查询 workspaceId 对应的本地工作目录 | 无 |
| `POST` | `/api/workspaces/directory/select` | 通过本机能力选择目录 | `{}` |
| `POST` | `/api/workspaces/init` | 通过本地目录初始化或重新绑定 workspace | `{ "directory": "/path/to/workspace" }` |
| `POST` | `/api/workspaces/status` | 查询 workspace 当前状态、下一步、素材库、artifacts | `{ "workspaceId": "..." }` 或 `{ "directory": "..." }` |

`GET /api/workspaces/:workspaceId/directory` 返回：

```json
{
  "data": {
    "workspaceId": "workspace-id",
    "directory": "/absolute/local/workspace/path"
  }
}
```

`status` 的业务价值最高，它会返回：

| 字段 | 含义 |
|---|---|
| `workspace` | 当前 workspace 行，包括 `status`、`currentScriptId`、`currentJobId` |
| `manifest` | `.daireel` manifest 视图 |
| `nextAction` | 下一步建议动作，例如人审、生成、轮询、恢复 |
| `materialLibrary` | 本地素材扫描结果 |
| `artifacts` | material / brief / storyboard / shotPrompt 当前 artifact |

## 5. 素材与资产 API

素材有两条线：workspace 内素材用于新 pipeline；legacy product image asset 用于旧资产表。

### 5.1 Workspace 素材

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/materials` | 上传文件到 workspace 的 `.daireel/materials` | JSON: `{ workspaceId, filename, dataBase64 }`，或 multipart: `workspaceId` + `file` |
| `GET` | `/api/workspaces/:workspaceId/materials/*` | 读取 workspace 素材文件 | path wildcard |

上传成功返回：

```json
{
  "workspace": {},
  "material": {
    "ref": "filename.png",
    "bytes": 12345,
    "url": "/api/workspaces/{workspaceId}/materials/filename.png"
  }
}
```

### 5.2 Legacy product image asset

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/materials` | 注册一个已有图片 URL 为 product image asset | `{ "imageUrl": "/uploads/product-images/a.png" }` |
| `POST` | `/api/materials/product-image` | 上传商品图到 legacy upload adapter | `{ filename, contentType, dataBase64 }` |

注意：`/api/materials/product-image` 依赖 `.env` 中同时配置 `UPLOAD_DIR` 和 `UPLOAD_URL_PREFIX`。

## 6. Workspace Artifact Pipeline API

这一组接口驱动旧的 workspace 级 agent pipeline：素材理解、商品 brief、分镜、Seedance prompt、人审与反馈路由。

### 6.1 Material intake

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/material-intake` | 扫描/理解素材并生成 `assets` artifact | `{ workspaceId, prompt?, selectedMaterialRefs? }` |

结果 artifact 类型：`assets`。

### 6.2 Product brief

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/brief/propose` | 基于素材生成 brief 草案 | `{ workspaceId, userDirection?, title?, sellingPoints?, audience?, stylePreference? }` |
| `POST` | `/api/workspaces/artifacts/brief/approve` | 人审通过 brief | `{ workspaceId, data }` |

`data` 必须符合 `ProductBriefArtifact`：

| 顶层字段 | 含义 |
|---|---|
| `product` | 商品名称、类目、事实、关联素材 |
| `audience` | 目标人群和痛点/欲望 |
| `coreSellingPoint` | 核心卖点 |
| `proof` | 证明点 |
| `offer` | 优惠，可为 `null` |
| `platform` | 投放平台 |
| `brandTone` | 品牌语气 |
| `bannedExpressions` | 禁用表达 |
| `landingInfo` | 落地页信息，可为 `null` |
| `assumptions` | 假设 |

### 6.3 Storyboard

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/storyboard/propose` | 基于 approved brief 生成分镜草案 | `{ workspaceId }` |
| `POST` | `/api/workspaces/artifacts/storyboard/approve` | 人审通过 storyboard | `{ workspaceId, data }` |

`data` 必须符合 `StoryboardArtifact`，核心字段：

| 字段 | 含义 |
|---|---|
| `narrative` | 整体叙事 |
| `totalDurationSec` | 总时长 |
| `shots[]` | 分镜数组 |
| `assumptions` | 假设 |

每个 `shots[]` 包含 `index`、`purpose`、`durationSec`、`scene`、`visualDirection`、`productAssetRef`、`voiceover`、`transition`。

### 6.4 Shot prompt

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/shotprompt/compile` | 把 approved storyboard 编译为 Seedance prompt artifact | `{ workspaceId, aspectRatio? }` |
| `POST` | `/api/workspaces/artifacts/shotprompt/approve` | 人审通过 shotprompt，并写入 shot workflow 的 shots | `{ workspaceId, data }` |

`aspectRatio` 支持：

```text
9:16, 16:9, 1:1
```

审批 shotprompt 后，系统会根据 artifact 中的 `shots[]` 创建单镜头 workflow 数据，后续进入 Shot Workflow API。

### 6.5 Feedback route

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/feedback/route` | 根据用户反馈判断要回改 brief/storyboard/shotprompt | `{ workspaceId, feedback, jobId? }` |

返回中 `route.targetArtifact` 表示被回退修改的目标 artifact：

```text
brief | storyboard | shotprompt
```

## 7. Shot Workflow 状态 API

Shot Workflow 是当前图片到视频生成的新主链路。一个 workspace 会有多个 shot，每个 shot 依次完成图片 prompt、图片候选、图片选择、视频脚本、视频候选、视频选择。

| Method | Path | 业务用途 |
|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/shots` | 查询 workspace 下所有 shots |
| `GET` | `/api/shots/:shotId` | 查询单个 shot |
| `GET` | `/api/workspaces/:workspaceId/shot-workflow-status` | 查询所有 shot 的状态、下一步、活跃 batch |

核心状态：

```text
DRAFT
IMAGE_PROMPT_PROPOSING
IMAGE_PROMPT_READY
IMAGE_PROMPT_EDITED
IMAGE_GENERATING
IMAGE_CANDIDATES_READY
IMAGE_SELECTED
VIDEO_SCRIPT_PROPOSING
VIDEO_SCRIPT_READY
VIDEO_SCRIPT_EDITED
VIDEO_GENERATING
VIDEO_CANDIDATES_READY
VIDEO_SELECTED
FAILED
```

常见 `nextAction`：

```text
GENERATE_IMAGE_PROMPT
EDIT_IMAGE_PROMPT
GENERATE_IMAGES
POLL_IMAGE_BATCH
SELECT_IMAGE
GENERATE_VIDEO_SCRIPT
EDIT_VIDEO_SCRIPT
GENERATE_VIDEOS
POLL_VIDEO_BATCH
SELECT_VIDEO
READY_FOR_FINAL_COMPOSE
RETRY
NONE
```

## 8. 单镜头图片生成 API

这组接口完成“文生图 prompt -> 图片批次 -> 选择图片”。

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | agent 生成图片 prompt | `{ referenceAssetIds, userHint?, stylePresetId? }` |
| `PATCH` | `/api/shots/:shotId/image-prompts/:artifactId` | 用户编辑图片 prompt，生成新版本 | `{ promptText, negativePrompt?, referenceAssetIds }` |
| `GET` | `/api/shots/:shotId/image-prompts` | 查询该 shot 的图片 prompt 版本列表 | 无 |
| `POST` | `/api/shots/:shotId/image-batches` | 创建图片生成批次 | `{ imagePromptArtifactId, count?, aspectRatio }`，要求 `Idempotency-Key` |
| `GET` | `/api/shots/:shotId/image-batches/:batchId` | 查询图片批次详情和 candidates | 无 |
| `POST` | `/api/shots/:shotId/selected-image` | 选择最终图片候选 | `{ imageCandidateId, imageGenerationBatchId }` |
| `GET` | `/api/shots/:shotId/selected-image` | 查询已选图片 | 无 |

图片批次查询返回中包含：

| 字段 | 含义 |
|---|---|
| `status` | `PENDING`、`RUNNING`、`SUCCEEDED`、`PARTIAL`、`FAILED`、`CANCELLED` |
| `requestedCount` | 请求生成数量 |
| `succeededCount` | 成功数量 |
| `failedCount` | 失败数量 |
| `candidates[]` | 图片候选列表 |

注意：`GET /api/shots/:shotId/image-batches` 当前已注册，但返回 `501 NOT_IMPLEMENTED`。

## 9. 单镜头视频生成 API

这组接口完成“已选图片 -> 视频脚本 -> 视频批次 -> 选择视频”。

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | 基于已选图片生成视频脚本 | `{ durationSec, useNeighborFrames, userHint? }` |
| `PATCH` | `/api/shots/:shotId/video-scripts/:scriptId` | 用户编辑视频脚本，生成新版本 | `{ baseVersion, durationSec, scriptJson, providerPrompt }` |
| `GET` | `/api/shots/:shotId/video-scripts` | 查询该 shot 的视频脚本版本列表 | 无 |
| `POST` | `/api/shots/:shotId/video-batches` | 创建视频生成批次 | `{ videoScriptArtifactId, count?, aspectRatio }`，要求 `Idempotency-Key` |
| `GET` | `/api/shots/:shotId/video-batches/:batchId` | 查询视频批次详情和 candidates | 无 |
| `POST` | `/api/shots/:shotId/selected-video` | 选择最终视频候选 | `{ videoCandidateId, videoGenerationBatchId }` |
| `GET` | `/api/shots/:shotId/selected-video` | 查询已选视频 | 无 |
| `POST` | `/api/shots/:shotId/retry` | 重试图片或视频批次 | `{ what: "image_batch" }` 或 `{ what: "video_batch" }`，要求 `Idempotency-Key` |

视频脚本生成依赖当前 shot 已经有 selected image，否则返回 `409 NO_SELECTED_IMAGE`。

视频批次查询返回中包含：

| 字段 | 含义 |
|---|---|
| `status` | `PENDING`、`RUNNING`、`SUCCEEDED`、`PARTIAL`、`FAILED`、`CANCELLED` |
| `requestedCount` | 请求生成数量 |
| `succeededCount` | 成功数量 |
| `failedCount` | 失败数量 |
| `candidates[]` | 视频候选列表，包含 `videoUrl`、`thumbnailUrl`、`durationSec` |

注意：`GET /api/shots/:shotId/video-batches` 当前已注册，但返回 `501 NOT_IMPLEMENTED`。

## 10. 最终视频合成 API

当 workspace 内所有 shot 都达到 `VIDEO_SELECTED` 后，可以发起最终视频合成。

| Method | Path | 业务用途 | 请求体 |
|---|---|---|---|
| `POST` | `/api/workspaces/:workspaceId/final-videos` | 创建最终合成任务 | `{ outputAspectRatio }`，要求 `Idempotency-Key` |
| `GET` | `/api/final-videos/:finalVideoJobId` | 查询最终合成任务状态 | 无 |
| `GET` | `/api/workspaces/:workspaceId/final-videos` | 查询 workspace 最近 50 个最终视频任务 | 无 |
| `GET` | `/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | 下载或播放合成后的 mp4 | 无 |

创建合成任务前，后端会检查所有 shot 是否都有 `selectedVideoId`。缺失时返回 `409 MISSING_SELECTIONS`。

## 11. Trace 与观测 API

这组接口用于调试 agent、provider、job 和状态流转。

| Method | Path | 业务用途 | Query |
|---|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/traces` | 查询 workspace 维度 trace | `limit?`、`cursor?` |
| `GET` | `/api/shots/:shotId/traces` | 查询 shot 维度 trace | `limit?`、`cursor?` |

Trace 类型：

```text
agent_run
provider_call
job_event
state_transition
user_action
```

## 12. 静态文件 API

这些接口负责把本地 workspace 和 legacy upload 目录下的文件暴露为 HTTP 资源。

| Method | Path | 业务用途 |
|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/materials/*` | 读取 workspace 素材 |
| `GET` | `/api/workspaces/:workspaceId/videos/*` | 读取 workspace 视频 |
| `GET` | `${UPLOAD_URL_PREFIX}/workspace-videos/:workspaceId/*` | legacy 兼容：读取 workspace 视频 |
| `GET` | `${UPLOAD_URL_PREFIX}/workspace-materials/:workspaceId/*` | legacy 兼容：读取 workspace 素材 |
| `GET` | `${UPLOAD_URL_PREFIX}/*` | legacy 兼容：读取 upload 目录文件 |

所有本地文件读取接口都会做 path traversal 防护，越界路径会返回 `400`。

## 13. 测试与运维辅助 API

| Method | Path | 业务用途 | 启用条件 |
|---|---|---|---|
| `DELETE` | `/api/test-runs/:runId` | 按 workspace id 前缀清理测试数据 | `NODE_ENV=test` 或 `ALLOW_TEST_CLEANUP=true` |

该接口依赖数据库级 cascade 删除关联数据，不应在生产环境开启。

## 14. 当前契约缺口

以下是当前代码中值得注意的 API 契约状态：

| 项 | 状态 | 影响 |
|---|---|---|
| `GET /api/shots/:shotId/image-batches` | 已注册，返回 `501 NOT_IMPLEMENTED` | 前端不能通过列表接口枚举图片批次，只能通过 workflow status 或 batch id 查询 |
| `GET /api/shots/:shotId/video-batches` | 已注册，返回 `501 NOT_IMPLEMENTED` | 前端不能通过列表接口枚举视频批次 |
| `GET/PATCH /api/shots/:shotId/asset-refs` | 前端代码存在调用，但后端当前没有注册 route | asset refs 编辑面板无法依赖后端持久化 |

## 15. 推荐调试顺序

最小可跑通顺序：

1. `GET /api/health`
2. `POST /api/workspaces`
3. `POST /api/workspaces/materials`
4. `POST /api/workspaces/material-intake`
5. `POST /api/workspaces/brief/propose`
6. `POST /api/workspaces/artifacts/brief/approve`
7. `POST /api/workspaces/storyboard/propose`
8. `POST /api/workspaces/artifacts/storyboard/approve`
9. `POST /api/workspaces/shotprompt/compile`
10. `POST /api/workspaces/artifacts/shotprompt/approve`
11. `GET /api/workspaces/:workspaceId/shots`
12. 对每个 shot 依次完成图片和视频选择
13. `POST /api/workspaces/:workspaceId/final-videos`
14. `GET /api/final-videos/:finalVideoJobId`
15. `GET /api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file`
