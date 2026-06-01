# interface — V2 对外接口与业务逻辑

> 后端 HTTP 目标契约。机器可读契约见 [`openapi.yaml`](./openapi.yaml)，架构见 [`arc_v2.md`](./arc_v2.md)，数据模型见 [`erd.md`](./erd.md)。
>
> 本文描述迁移后的 V2 目标接口，不要求兼容旧工作区主链路。

---

## 通用约定

- 全部路由前缀 `/api`，URL 无版本号，全站无鉴权，按单租户开发环境处理。
- 请求校验使用 Zod 或等价 schema；错误统一映射为 `{ code, message, details? }`。
- 标 🔑 的 POST 必须携带 `Idempotency-Key`。
- 宽高比枚举固定为 `9:16 | 16:9 | 1:1`，默认 `9:16`。
- 工作区级模块统一采用 `propose -> approve -> downstream` 语义：
  - `propose` 生成待审创作产物，只写 `status=proposed`。
  - `approve` 将产物变为当前生效产物，只写 current 指针，不自动重置下游。
  - 下游 agent 只读取 `approved/current`。
- 下游查询返回 `upstreamChanged` 提示：它表示上游 current artifact 已变化，继续重生成会有较大差异；它不是 stale，不删除旧候选，不阻塞成片。
- 图像/视频选择是 UPSERT 当前 selection。未选候选持续可见，供用户之后重新选择。

---

## 0. 平台 / 系统

| 方法   | 路径                      | 业务逻辑                                                      | 响应                    |
| ------ | ------------------------- | ------------------------------------------------------------- | ----------------------- |
| GET    | `/api/health`             | 健康检查，返回当前 runtime。                                  | `{ ok, runtime }`       |
| GET    | `/api/config/limits`      | 返回图像/视频候选数量上限、worker/provider 并发和宽高比枚举。 | `{ data }`              |
| GET    | `/api/pipeline/contracts` | 返回 agent 链路、prompt 模板、输入输出 schema 的契约元数据。  | `{ data }`              |
| DELETE | `/api/test-runs/:runId`   | 测试清理专用；只在测试环境开启。                              | `{ data: { deleted } }` |

---

## 1. 素材 Material

| 方法 | 路径                                     | 业务逻辑                                              | 请求                                    |
| ---- | ---------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| POST | `/api/materials`                         | 登记外部商品图为 `asset`。                            | `{ imageUrl }`                          |
| POST | `/api/materials/product-image`           | 上传 base64 商品图，写入本地上传目录并登记 `asset`。  | `{ filename, contentType, dataBase64 }` |
| POST | `/api/workspaces/:workspaceId/materials` | 上传工作区素材，写入 workspace storage 并登记 asset。 | multipart file 或 JSON base64           |

---

## 2. Workspace 与 Storage

| 方法 | 路径                                        | 业务逻辑                                                                                                                                                                                                                             | 请求                                                                                 |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| POST | `/api/workspaces`                           | 新建逻辑工作区；若用户没有选择工作目录，前端不应调用该接口创建可见草稿。                                                                                                                                                             | `{ name? }`                                                                          |
| GET  | `/api/workspaces`                           | 列出 DB 已登记且有有效本地路径的工作区（配置 `WORKSPACE_DISCOVERY_ROOTS` 时仅展示这些 roots 下的 workspace）及其 active storage binding；并扫描 `WORKSPACE_DISCOVERY_ROOTS` 下的磁盘草稿，返回未登记到 DB 的工作区（`discovered`）。 | query 可选                                                                           |
| POST | `/api/workspaces/init`                      | 按本地目录 find-or-create 工作区，绑定 LOCAL storage，写 `.daireel/workspace.json`。                                                                                                                                                 | `{ directory }`                                                                      |
| GET  | `/api/workspaces/:workspaceId/status`       | 返回 workspace、storage、active artifact 摘要、active shot set、下一步建议。                                                                                                                                                         | 无                                                                                   |
| GET  | `/api/workspaces/:workspaceId/storage`      | 返回工作区存储绑定。                                                                                                                                                                                                                 | 无                                                                                   |
| POST | `/api/workspaces/:workspaceId/storage/bind` | 绑定 LOCAL 或 S3 storage。已绑定 active storage 时返回 409。                                                                                                                                                                         | `{ kind:"local", localPath }` 或 `{ kind:"s3", bucket, prefix, region?, endpoint? }` |

`GET /api/workspaces` 响应形如 `{ workspaces: [...], discovered: [{ localPath, workspaceId }] }`。`workspaces` 来自 DB，但空路径 / 未绑定目录的逻辑 workspace 不应展示；配置 `WORKSPACE_DISCOVERY_ROOTS` 后，列表只展示这些 roots 下的 DB workspace。`discovered` 是磁盘上存在 `.daireel/workspace.json` 但 DB 无对应行的工作区（例如 `reset:dev` 清空业务表后仍保留磁盘 `.daireel/`），按 `WORKSPACE_DISCOVERY_ROOTS`（逗号分隔的根目录，有界深度扫描）发现，已登记的路径会从 `discovered` 中去重剔除。

`POST /api/workspaces/init`：当目录在 DB 无对应行时，若磁盘 `.daireel/workspace.json` 仍存在且其 `workspaceId` 未被占用，则**复用该原始 `workspaceId`**（而不是新建一个），使被 reset 的草稿重新打开后接回原始工作区身份；否则新建 id。

---

## 3. Prompt Requirements

Prompt requirements 是用户可编辑的结构化创作要求。用户可以分别约束图像、剧本、故事板、分镜图和分镜视频，但不能直接覆盖系统契约 prompt。

| 方法 | 路径                                                       | 业务逻辑                                             | 请求                      |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------- | ------------------------- |
| GET  | `/api/workspaces/:workspaceId/prompt-requirements`         | 返回当前 proposed 和 approved/current requirements。 | 无                        |
| POST | `/api/workspaces/:workspaceId/prompt-requirements/propose` | 保存一份待审 requirements。通常不调用 provider。     | `{ data }`                |
| POST | `/api/workspaces/:workspaceId/prompt-requirements/approve` | 将指定或内联 requirements 置为 approved/current。    | `{ artifactId? , data? }` |

响应包含：

```json
{
  "data": {
    "artifact": {
      "id": "req_...",
      "status": "approved",
      "isCurrent": true,
      "data": {}
    }
  }
}
```

---

## 4. 工作区级 Agent 模块

以下模块采用同一业务接口模式：

- `material-intake`
- `product-brief`
- `storyboard`
- `shotprompt`

### 4.1 通用接口

| 方法 | 路径                                            | 业务逻辑                                                                                                                         |
| ---- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET  | `/api/workspaces/:workspaceId/{module}`         | 返回模块 proposed artifact、approved/current artifact、上游变更提示和 prompt assembly 摘要。                                     |
| POST | `/api/workspaces/:workspaceId/{module}/propose` | 读取上游 approved/current artifact 与当前 prompt requirements，装配主体 prompt + 契约 prompt，运行 agent，写 proposed artifact。 |
| POST | `/api/workspaces/:workspaceId/{module}/approve` | 批准指定 artifact 或请求体内联 artifact，置为 approved/current。不会重置下游。                                                   |

### 4.2 模块依赖

| 模块              | 上游                                                               | 输出                                                           |
| ----------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `material-intake` | workspace materials + prompt requirements                          | 物料摘要、选用素材、图像输入描述                               |
| `product-brief`   | material intake + prompt requirements                              | 产品卖点、受众、语气、约束                                     |
| `storyboard`      | product brief + material intake + prompt requirements              | 视频结构、节奏、镜头目标                                       |
| `shotprompt`      | storyboard + product brief + material intake + prompt requirements | 每个 shot 的时间段、图像要求 `shotImage`、视频要求 `shotVideo` |

### 4.3 approve 语义

`approve` 只改变本模块 current 指针。特别地：

- `shotprompt approve` 不创建、不删除、不重建 `storyboard_shots`。
- 已存在 active shot set 时，批准新的 shotprompt 只会让 shot set 查询出现 `upstreamChanged=true`。
- 用户需要显式调用 `POST /api/workspaces/:workspaceId/shot-sets` 才会应用新的 shotprompt。

---

## 5. Shot Sets

Shot set 是一次分镜链路实例。它把某个 approved/current shotprompt 固化为一组可生成图像/视频的 shot。

| 方法 | 路径                                                      | 业务逻辑                                                                           | 请求                         |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| GET  | `/api/workspaces/:workspaceId/shot-sets`                  | 列出工作区 shot sets，默认包含 active 和最近 archived。                            | query `{ includeArchived? }` |
| POST | `/api/workspaces/:workspaceId/shot-sets`                  | 将当前 approved shotprompt apply 为新的 active shot set；旧 active shot set 归档。 | `{ shotPromptArtifactId? }`  |
| GET  | `/api/workspaces/:workspaceId/shot-sets/:shotSetId/shots` | 返回某个 shot set 下的 shots、shot requirements、选择状态和上游变更提示。          | 无                           |
| GET  | `/api/workspaces/:workspaceId/shots`                      | 便捷接口：返回 active shot set 的 shots。                                          | 无                           |

apply 行为：

1. 读取指定或当前 approved `shot_prompt_artifacts`。
2. 创建 `shot_sets(status='active')`。
3. 归档旧 active shot set。
4. 创建 `storyboard_shots`。
5. 为每个 shot 写 `shot_prompt_requirements.shot_image` 与 `shot_prompt_requirements.shot_video`。

---

## 6. 分镜图像链路

| 方法 | 路径                                                                 | 业务逻辑                                                                                                                                                                                                                        | 请求                                                |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| GET  | `/api/shots/:shotId`                                                 | 返回单个 shot、requirements、active prompt/script、当前选择、下一步建议。                                                                                                                                                       | 无                                                  |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose`   | 运行图像 prompt agent。输入包含 current prompt requirements、当前 shot 的 `shotImage` dict、产品/素材、前序选择。写 ACTIVE `image_prompt_artifacts`、保存 `image-prompt` subject/contract assembly metadata，并创建图像 batch。 | `{ userDirection?, candidateCount?, aspectRatio? }` |
| GET  | `/api/shots/:shotId/image-prompts`                                   | 列出该 shot 的图像 prompt artifacts。                                                                                                                                                                                           | 无                                                  |
| GET  | `/api/workspaces/:workspaceId/shots/:shotId/image-rounds`            | 按 prompt artifact 聚合图像生成轮次、候选和当前选择。                                                                                                                                                                           | 无                                                  |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-candidates/select` | 选择一张候选图。UPSERT `image_select_artifacts`，不 stale 其他候选。                                                                                                                                                            | `{ candidateId }`                                   |

图像选择校验：

- candidate 必须属于同一个 workspace/shot。
- candidate 必须 `SUCCEEDED`。
- 默认要求 candidate 来自该 shot 的可见候选轮次；前端可继续展示旧轮次候选并重新选择。

---

## 7. 分镜视频链路

| 方法 | 路径                                                                 | 业务逻辑                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 请求                                                |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose`   | 运行视频脚本 agent。输入包含 current prompt requirements、当前 shot 的 `shotVideo` dict、当前 selected image、下一镜 selected image。写 ACTIVE `video_script_artifacts`、保存 `video-script` subject/contract assembly metadata，然后**异步**入队每候选一个 `generate_video_candidate` job，立即返回 PENDING batch + PENDING candidates，shot 进入 `VIDEO_GENERATING`；客户端轮询 `video-rounds` 直到 `VIDEO_CANDIDATES_READY`（响应含 `poll.videoRoundsUrl`）。 | `{ userDirection?, candidateCount?, aspectRatio? }` |
| GET  | `/api/shots/:shotId/video-scripts`                                   | 列出该 shot 的视频脚本 artifacts。                                                                                                                                                                                                                                                                                                                                                                                                                               | 无                                                  |
| GET  | `/api/workspaces/:workspaceId/shots/:shotId/video-rounds`            | 按 video script artifact 聚合视频生成轮次、候选和当前选择。                                                                                                                                                                                                                                                                                                                                                                                                      | 无                                                  |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | 选择一个候选视频。UPSERT `video_select_artifacts`，不 stale 其他候选。                                                                                                                                                                                                                                                                                                                                                                                           | `{ candidateId }`                                   |

视频脚本 propose 前置条件：

- active shot set 内全部需要的视频锚点图已选择；否则返回 `IMAGE_SELECTION_INCOMPLETE`。
- Seedance 单个候选视频时长必须在 4-12 秒范围内。server 会在创建 video script 时把 shot 默认时长夹到 provider 允许范围内，避免 3 秒 storyboard shot 直接传入 Seedance。
- video provider 同时在飞调用数 ≤ `VIDEO_PROVIDER_CONCURRENCY`（进程级信号量）。命中 429/限流时按 `Retry-After` / 指数退避重试，而不是直接失败候选。

---

## 8. 重试与批次

| 方法    | 路径                                                | 业务逻辑                                                                 | 请求                   |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- | ---------------- |
| POST 🔑 | `/api/shots/:shotId/retry`                          | 对当前 active image prompt 或 video script 重新创建 batch。              | `{ what: "image_batch" | "video_batch" }` |
| GET     | `/api/workspaces/:workspaceId/shot-workflow-status` | 返回 active shot set 的整体状态、每个 shot 的候选/选择状态、是否可合成。 | 无                     |

retry 使用调用方提供的 `Idempotency-Key`。普通 propose 路由内部创建 batch，可以由服务端生成幂等键。

`shot-workflow-status` 每个 shot 行除 `selectedImageId` 外还返回 `selectedImageUrl`：当前 shot 已选分镜图候选的图片 URL，未选择时为 `null`。前端分镜列表据此直接渲染已选缩略图，无需为每个 shot 单独调用 `image-rounds`。

---

## 9. 成片 Final Video

| 方法    | 路径                                                              | 业务逻辑                                                                                             | 请求                                 |
| ------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| POST 🔑 | `/api/workspaces/:workspaceId/final-videos`                       | 基于 active shot set 的当前 `video_select_artifacts` 创建成片任务。缺选择返回 `MISSING_SELECTIONS`。 | `{ shotSetId?, outputAspectRatio? }` |
| GET     | `/api/final-videos/:finalVideoJobId`                              | 返回成片作业状态。                                                                                   | 无                                   |
| GET     | `/api/workspaces/:workspaceId/final-videos`                       | 列出最近成片作业。                                                                                   | 无                                   |
| GET     | `/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | 流式返回成片文件。未完成返回 `NOT_READY`。                                                           | 无                                   |

成片任务保存 `shotSetId`、有序 `sourceVideoCandidateIds` 和 `sourceVideoScriptArtifactIds`。上游之后变更不会改变已创建的成片任务。

---

## 10. Campaign

| 方法 | 路径                                                                        | 业务逻辑                 | 请求                                                                                    |
| ---- | --------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| POST | `/api/workspaces/:workspaceId/campaign-publications`                        | 登记一次成片发布。       | `{ finalVideoJobId?, platform, channelName, kolName?, publishUrl?, status?, notes? }`   |
| GET  | `/api/workspaces/:workspaceId/campaign-publications`                        | 列出发布记录和最新指标。 | 无                                                                                      |
| GET  | `/api/workspaces/:workspaceId/campaign-publications/:publicationId`         | 获取单条发布记录。       | 无                                                                                      |
| POST | `/api/workspaces/:workspaceId/campaign-publications/:publicationId/metrics` | 写入一条发布指标。       | `{ impressions?, clicks?, conversions?, spendCents?, capturedAt?, source?, metadata? }` |

---

## 11. Trace

| 方法 | 路径                                  | 业务逻辑                    | 请求                        |
| ---- | ------------------------------------- | --------------------------- | --------------------------- |
| GET  | `/api/workspaces/:workspaceId/traces` | 分页列工作区 trace events。 | query `{ limit?, cursor? }` |
| GET  | `/api/shots/:shotId/traces`           | 分页列 shot trace events。  | query `{ limit?, cursor? }` |

trace 必须能回答 agent 链路调试问题：

- 读了哪些 input artifacts。
- 使用了哪些 subject/contract prompt 模板及其 hash。
- 最终 assembled prompt 是什么。
- provider 请求/响应摘要是什么。
- batch/job 状态如何变化。

---

## 12. 静态文件流

| 方法 | 路径                                       | 业务逻辑                                     |
| ---- | ------------------------------------------ | -------------------------------------------- |
| GET  | `/api/workspaces/:workspaceId/videos/*`    | 从 workspace video storage 流式返回文件。    |
| GET  | `/api/workspaces/:workspaceId/materials/*` | 从 workspace material storage 流式返回文件。 |
| GET  | `{UPLOAD_URL_PREFIX}/*`                    | legacy upload 文件流，仅本地开发开启。       |

---

## 13. 常见错误码

| HTTP | code                                     | 触发                                                                       |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------- |
| 400  | `IDEMPOTENCY_KEY_REQUIRED`               | 🔑 接口缺 `Idempotency-Key`                                                |
| 400  | `NO_CURRENT_APPROVED_ARTIFACT`           | 下游模块缺少所需上游 current approved artifact                             |
| 400  | `NO_ACTIVE_SHOT_SET`                     | shot 级操作前尚未 apply shot set                                           |
| 400  | `IMAGE_SELECTION_INCOMPLETE`             | 视频脚本或成片前仍有 shot 缺少 selected image                              |
| 400  | `INVALID_PROVIDER_DURATION`              | 单个候选视频时长不满足 provider 限制                                       |
| 404  | `NOT_FOUND`                              | 工作区、artifact、shot、candidate 等不存在                                 |
| 404  | `NOT_READY`                              | 成片文件尚未生成                                                           |
| 409  | `STORAGE_ALREADY_BOUND`                  | 工作区已有 active storage                                                  |
| 409  | `CANDIDATE_NOT_SELECTABLE`               | candidate 不属于当前 shot/workspace 或未成功                               |
| 409  | `MISSING_SELECTIONS`                     | 成片时 active shot set 存在未选定视频                                      |
| 409  | `UPSTREAM_CHANGED_CONFIRMATION_REQUIRED` | 若接口选择强制二次确认，可在用户明确覆盖时使用；默认查询只返回提示，不报错 |
