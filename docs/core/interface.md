# interface — 对外接口与业务逻辑

> 后端 HTTP 接口清单，逐个标注**业务逻辑功能**。机器可读契约见 [`openapi.yaml`](./openapi.yaml)；架构见 [`arc_v2.md`](./arc_v2.md)。
>
> **通用约定**
> - 全部路由前缀 `/api`，**URL 无版本号**；**全站无鉴权**（单租户）。
> - 校验：每个 handler 内 Zod `schema.parse()`；错误经 `toHttpError` 映射（`NotFoundError`→404，普通 `Error`→400，其余→500）。
> - 响应包络**不一致**：多数 `{ data: ... }`，部分裸对象 / 文件流——下表「响应」列按实际形态标注。
> - **幂等头**：标 🔑 的 POST **必须**带请求头 `Idempotency-Key`，缺失→400 `IDEMPOTENCY_KEY_REQUIRED`。
> - **公开幂等边界**：当前公开 API 只有 `/api/shots/:shotId/retry` 与 `/api/workspaces/:workspaceId/final-videos` 要求调用方传幂等头；图像/视频 batch 由 propose 路由内部创建，服务端自行合成或省略幂等键。
> - 宽高比枚举固定 `9:16 | 16:9 | 1:1`，默认 `9:16`。
> - 真实 provider 限制：Seedance 单个视频候选 `durationSec` 必须为 4–12 秒；Ark/Seedance 账号存在 TPM/RPM 限流，验收环境会用退避重试和每 shot 1 个视频候选降低限流干扰。
> - ⚠️ `nextAction` 提示里出现的 `/api/workspaces/video/generate`、`/api/jobs/:id` 为 V1 残留，**代码未实现**，不计入本表与 OpenAPI。

---

## 0. 平台 / 系统

| 方法 | 路径 | 业务逻辑 | 响应 |
|---|---|---|---|
| GET | `/api/health` | 健康检查，回当前 `runtime`（all/api/worker）。 | `{ ok, runtime }` |
| GET | `/api/config/limits` | 返回批量大小上下限与可选宽高比，供前端约束输入：`defaultImageBatchSize/maxImageBatchSize/defaultVideoBatchSize/maxVideoBatchSize` + `aspectRatios`。`defaultVideoBatchSize` 影响 video propose/retry 的默认候选数；真实并行验收通常覆盖为 1 以避开 Seedance RPM。 | `{ data: {...} }` |
| GET | `/api/pipeline/contracts` | 返回构建管线契约元数据（各步骤 id、provider、prompt builder、激活 prompt 版本、输入输出 schema）。来自 `@aigc-video/ai` 的 `getPipelineContracts()`，不读 DB。 | 契约对象 |
| DELETE | `/api/test-runs/:runId` | **测试清理专用**，仅 `ALLOW_TEST_CLEANUP==="true"` 时启用（否则 403 `DISABLED_IN_THIS_ENV`）。删 `creative_workspace.id like %runId%` 的工作区（级联）。 | `{ data: { deleted } }` |

---

## 1. 素材 Material

| 方法 | 路径 | 业务逻辑 | 请求 |
|---|---|---|---|
| POST | `/api/materials` | 登记一张商品图为 `asset`（`type=product_image`）。已存在则复用。 | `{ imageUrl }`（URL 或 `/...`） |
| POST | `/api/materials/product-image` | base64 上传商品图：解码→校验为合法位图→写 `<UPLOAD_DIR>/product-images/<nanoid>.<ext>`→登记 asset。**需 legacy `UPLOAD_DIR`+`UPLOAD_URL_PREFIX`**，否则报错。 | `{ filename, contentType:^image/, dataBase64 }` |

---

## 2. 工作目录 Workspace（构建管线 V1）

工作区 `status` 线性推进：`draft → materials_ready → brief_proposed/approved → storyboard_proposed/approved → shotprompt_proposed/approved`。每个 propose/compile 步骤 real 模式调 Ark 文本 provider，否则确定性 builder，结果 upsert 进 `workspace_artifact`。多数请求体含工作区定位字段（`directory` 或 `workspaceId`，下文记作 `…dir`）。

| 方法 | 路径 | 业务逻辑 | 请求要点 |
|---|---|---|---|
| POST | `/api/workspaces/directory/select` | 调起本机原生文件夹选择器（osascript/PowerShell/zenity/kdialog），返回所选目录。 | 无 |
| POST | `/api/workspaces` | 新建受管工作区（`status=draft`，未绑定存储）。 | `{ name?≤80 }` |
| GET | `/api/workspaces` | 列出全部受管工作区 + 存储绑定视图。 | — |
| POST | `/api/workspaces/init` | 按本地目录 find-or-create 工作区，绑定 LOCAL 存储并写 `.daireel/workspace.json`。 | `{ directory }` |
| GET | `/api/workspaces/:workspaceId/directory` | 解析该工作区绑定的本地路径。 | — |
| GET | `/api/workspaces/:workspaceId/storage` | 返回存储绑定视图。 | — |
| POST | `/api/workspaces/:workspaceId/storage/bind` | 绑定存储：LOCAL（建目录+写 manifest）或 S3（存 bucket/prefix/region/endpoint）。已绑定→409。 | `{kind:"local",localPath}` \| `{kind:"s3",bucket,prefix,region?,endpoint?}` |
| POST | `/api/workspaces/materials` | 上传素材（multipart 文件，或 JSON base64）。校验 mime/大小(≤50MB)→写 `.daireel/materials/`→登记 asset（含 sha256/storagePath）。 | multipart `workspaceId`+file，或 `{workspaceId,filename,dataBase64}` |
| POST | `/api/workspaces/status` | 触达工作区，刷新作业派生状态，扫描素材库，返回 `{workspace, manifest, storage, nextAction, materialLibrary, artifacts}`。`nextAction` 是状态机提示（stage/endpoint/method/willCallProvider/provider）。 | `{ directory? \| workspaceId? }`（其一必填） |
| POST | `/api/workspaces/material-intake` | 物料解读：把选中的根目录素材复制进受管目录，扫描/校验素材库，构建物料解读 prompt 视图；real 模式调 `generateMaterialIntakeWithArk`（带图像输入）。upsert `assets` artifact(approved)，status→`materials_ready`。 | `{ …dir, prompt?, selectedMaterialRefs?[] }` |
| POST | `/api/workspaces/brief/propose` | 生成产品 brief：读 assets artifact，real→`generateProductBriefWithArk` 否则 `toProductBrief`。upsert `brief`(proposed)，status→`brief_proposed`。返回 `form`（中文字段表单）。 | `{ …dir, userDirection?, title?, sellingPoints?, audience?, stylePreference? }` |
| POST | `/api/workspaces/artifacts/brief/approve` | 校验并 upsert `brief`(approved)，status→`brief_approved`。 | `{ …dir, data: ProductBriefArtifact }` |
| POST | `/api/workspaces/storyboard/propose` | 生成故事板：读 brief+assets，real→`generateStoryboardWithArk` 否则 `toStoryboard`。upsert `storyboard`(proposed)，status→`storyboard_proposed`。 | `{ …dir }` |
| POST | `/api/workspaces/artifacts/storyboard/approve` | upsert `storyboard`(approved)，status→`storyboard_approved`。 | `{ …dir, data: StoryboardArtifact }` |
| POST | `/api/workspaces/shotprompt/compile` | 编译分镜提示：读 brief+assets+storyboard，real→`generateShotPromptWithArk` 否则 `compileShotPrompt`。upsert `shotprompt`(proposed)，status→`shotprompt_proposed`。 | `{ …dir, aspectRatio? }` |
| POST | `/api/workspaces/artifacts/shotprompt/approve` | upsert `shotprompt`(approved) → **`seedShotsFromShotPrompt`**：事务内清空并按 shotprompt 重建 `storyboard_shots`（每分镜一行 DRAFT，`defaultDurationSec=endSec-startSec`）+ `shot_asset_refs`。**这是进入逐分镜管线的桥接点**。status→`shotprompt_approved`。真实 Seedance 候选视频要求单镜时长 4–12 秒，当前批准接口不做数据库层时长兜底，所以上游 shotprompt 应保证每个 shot span 至少 4 秒。 | `{ …dir, data: ShotPromptArtifact }` |
| POST | `/api/workspaces/feedback/route` | 反馈路由：解析自然语言反馈，real→`generateFeedbackRouteWithArk` 否则关键词正则路由到 brief/storyboard/shotprompt；写 `feedbackRoute` artifact 并重新 propose 目标 artifact，工作区状态回退到对应 `*_proposed`。 | `{ …dir, feedback, jobId? }` |

---

## 3. 分镜 Shot（逐分镜管线 V2）

每个 shot 走 `shot_status` 状态机。`/api/shots/...` 为 shot 维度；`/api/workspaces/:workspaceId/shots/:shotId/...` 为工作区维度变体（功能等价，便于前端按工作区调用）。`storyboard_shots.default_duration_sec` 来自 approved shotprompt 的 `endSec-startSec`，视频链路会把它传入脚本/候选生成。

### 3.1 查询

| 方法 | 路径 | 业务逻辑 |
|---|---|---|
| GET | `/api/workspaces/:workspaceId/shots` | 列出全部 shot + 参考素材引用 + `nextAction`。 |
| GET | `/api/shots/:shotId` | 单个 shot（富化）。 |
| GET | `/api/workspaces/:workspaceId/shot-workflow-status` | 全工作区逐分镜状态 + 活跃 batch id + `canComposeFinalVideo`（全部 shot 已 VIDEO_SELECTED 时为 true）。 |

### 3.2 图像提示与候选图

| 方法 | 路径 | 业务逻辑 | 请求要点 |
|---|---|---|---|
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | 跑 `runStoryboardImagePromptAgent`（聚合 brief/素材/shotprompt/前序选图），写新 ACTIVE `image_prompt_artifacts` 版本（原子置旧版 STALE），再按 `defaultImageBatchSize` 内部创建 `image_generation_batches` + `image_candidates`，每个候选对应一条 `generation_jobs(generate_image_candidate)` 并入队 `generation_v2`。返回时 shot→`IMAGE_GENERATING`，前端通过 `image-rounds` 轮询 batch/candidate；worker 聚合完成后 shot→`IMAGE_CANDIDATES_READY` 或 `FAILED`。shot 0 用主商品素材做 `image_ref`；shot N>=1 缺前一镜 selected image 返回 400 `NO_SCENE_ANCHOR`。 | `{ userDirection? }` |
| GET | `/api/shots/:shotId/image-prompts` | 列出该 shot 全部图像提示 artifact。 | — |
| GET | `/api/workspaces/:workspaceId/shots/:shotId/image-rounds` | 按 prompt 版本聚合的「轮次」：artifact+batch+候选+选定+上下文。 | — |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/image-candidates/select` | 选定候选图：校验属于该 workspace/shot、SUCCEEDED、来自当前激活轮次（否则 409 `STALE_CANDIDATE`），upsert `selected_shot_images`，shot→`IMAGE_SELECTED`。select 本身不触发 stale。 | `{ candidateId \| imageCandidateId, imageGenerationBatchId? }` |

### 3.3 视频脚本与候选视频

| 方法 | 路径 | 业务逻辑 | 请求要点 |
|---|---|---|---|
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | 跑 `runVideoShotScriptAgent`：要求全部 shot 已选图（否则 400 `IMAGE_SELECTION_INCOMPLETE`）；后端注入当前 selected image 作为 `first_frame_url`、下一镜 selected image 作为 `last_frame_url`（最后一镜为 null），duration 来自 `storyboard_shots.default_duration_sec`。写 ACTIVE `video_script_artifacts` 后按 `defaultVideoBatchSize` 内部创建 `video_generation_batches`，并在请求内直接等待 `runVideoGenerationBatch()` 调 Seedance 生成候选；完成后 shot→`VIDEO_CANDIDATES_READY`，批次失败则 shot→`FAILED`。真实 Seedance 要求每个候选视频 4–12 秒，parallel acceptance 为避免 RPM 通常把默认视频候选数设为 1。 | `{ userDirection? }` |
| GET | `/api/shots/:shotId/video-scripts` | 列出该 shot 全部视频脚本 artifact。 | — |
| GET | `/api/workspaces/:workspaceId/shots/:shotId/video-rounds` | 按脚本版本聚合的轮次 + 首/末帧 URL。 | — |
| POST | `/api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | 选定候选视频：校验属于该 workspace/shot、SUCCEEDED、来自当前激活轮次，upsert `selected_shot_videos`，shot→`VIDEO_SELECTED`；响应 duration 读取 storyboard/default shot duration。select 本身不触发 stale。 | `{ candidateId \| videoCandidateId, videoGenerationBatchId? }` |

### 3.4 重试

| 方法 | 路径 | 业务逻辑 | 请求要点 |
|---|---|---|---|
| POST 🔑 | `/api/shots/:shotId/retry` | 对当前激活 artifact 重跑图像或视频批次（aspectRatio 硬编码 `9:16`）；无激活 prompt/script→409。图像重试复用公开 `Idempotency-Key` 创建 batch，并为每个候选入队 `generate_image_candidate`；视频重试创建 batch 并入队 `generate_videos`（主线 video propose 则在请求内直接执行）。 | `{ what: "image_batch" \| "video_batch" }` |

---

## 4. 成片 Generation / Final Video

| 方法 | 路径 | 业务逻辑 | 请求要点 |
|---|---|---|---|
| POST 🔑 | `/api/workspaces/:workspaceId/final-videos` | 创建成片合成：校验每个 shot 有 `selectedVideoId`（否则 409 `MISSING_SELECTIONS`）且脚本激活（否则 409 `STALE_SELECTIONS`）；写 `final_video_jobs`(PENDING，有序 `sourceShotVideoIds`)+`generation_jobs`，入队 `compose_final_video`。 | `{ outputAspectRatio?="9:16" }` |
| GET | `/api/final-videos/:finalVideoJobId` | 返回成片作业行。 | — |
| GET | `/api/workspaces/:workspaceId/final-videos` | 最近 50 条成片作业。 | — |
| GET | `/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | 流式返回成片 `video/mp4`；未合成完成→404 `NOT_READY`。 | — |

> 合成 worker（`compose_final_video`）：下载各源视频→ffmpeg concat（libx264/veryfast/crf20，aac 160k，+faststart）→`final.mp4`，ffprobe 取元数据，写 `compiledManifest`+sha256，更新作业 SUCCEEDED 与 `local_url`。

---

## 5. 营销 Campaign

| 方法 | 路径 | 业务逻辑 | 请求要点 |
|---|---|---|---|
| POST | `/api/workspaces/:workspaceId/campaign-publications` | 登记一次成片发布；校验 `finalVideoJobId` 属于该工作区；写 `campaign_publications`。 | `{ finalVideoJobId?, platform, channelName, kolName?, publishUrl?, status="planned", notes? }` |
| GET | `/api/workspaces/:workspaceId/campaign-publications` | 最近 100 条发布，每条附最新指标（lateral join）。 | — |
| GET | `/api/workspaces/:workspaceId/campaign-publications/:publicationId` | 单条发布 + 最新指标（缺失 404）。 | — |
| POST | `/api/workspaces/:workspaceId/campaign-publications/:publicationId/metrics` | 写一条指标，计算 `ctr=clicks/impressions`。 | `{ impressions=0, clicks=0, conversions=0, spendCents=0, capturedAt?, source="manual", metadata={} }` |

---

## 6. 追踪 Trace

| 方法 | 路径 | 业务逻辑 | 请求要点 |
|---|---|---|---|
| GET | `/api/workspaces/:workspaceId/traces` | 分页列工作区 `trace_events`。 | query `{ limit?=50, cursor? }` |
| GET | `/api/shots/:shotId/traces` | 分页列 shot `trace_events`。 | query `{ limit?=50, cursor? }` |

> trace 类型：`agent_run`、`provider_call`、`job_event`、`state_transition`、`user_action`。

---

## 7. 脚本 Script（V1 遗留）

| 方法 | 路径 | 业务逻辑 |
|---|---|---|
| GET | `/api/scripts/:jobId` | 旧 v1 按 job 查 script（`getScriptByJob`）。 |

---

## 8. 静态文件流（在 `app.ts` 内联注册）

| 方法 | 路径 | 业务逻辑 |
|---|---|---|
| GET | `/api/workspaces/:workspaceId/videos/*` | 从 `<ws>/.daireel/videos/<*>` 流式返回（路径穿越防护）。 |
| GET | `/api/workspaces/:workspaceId/materials/*` | 从 `<ws>/.daireel/materials/<*>` 流式返回（含 `generated-images/`）。 |
| GET | `{UPLOAD_URL_PREFIX}/*` 等 | legacy 上传服务，仅当 `UPLOAD_DIR`+`UPLOAD_URL_PREFIX` 均为本地路径时注册。 |

---

## 9. 常见错误码

| HTTP | code | 触发 |
|---|---|---|
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | 🔑 接口缺 `Idempotency-Key` 头 |
| 400 | `NO_SCENE_ANCHOR` | shot N 图像 propose 时缺少前一镜 selected image，或 shot 0 缺少可用商品/场景锚点 |
| 400 | `IMAGE_SELECTION_INCOMPLETE` | 提议视频脚本时仍有 shot 未选图 |
| 403 | `DISABLED_IN_THIS_ENV` | `DELETE /api/test-runs/:runId` 未开 `ALLOW_TEST_CLEANUP` |
| 404 | `NO_SELECTED_IMAGE` / `NO_SELECTED_VIDEO` / `NOT_READY` | 资源未就绪 |
| 409 | `STALE_CANDIDATE` / `STALE_SCRIPT` / `STALE_BASE_VERSION` / `STALE_SELECTIONS` | 基于已失效的轮次/版本操作 |
| 409 | `MISSING_SELECTIONS` | 成片时存在未选定视频的 shot |
