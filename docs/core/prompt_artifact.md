# prompt_artifact — 当前 Prompt 链路 Artifact 字段

更新时间：2026-05-31

本文只描述当前架构中与 prompt 链路相关的 artifact、状态锚点和 provider 生成记录。机器契约以 `apps/server/src/db/schema/schema.sql`、`packages/shared/src/schemas/artifacts.ts`、`packages/ai/src/schemas/*` 为准。

---

## 1. Prompt 链路总览

当前 prompt 链路分两层：

| 层级 | 主要表 / artifact | 用途 |
|---|---|---|
| Workspace V1 builder | `workspace_artifact` | 存 material intake、brief、storyboard、shotprompt、feedback route 的结构化产物。 |
| Shot V2 agent | `image_prompt_artifacts`、`video_script_artifacts` | 存单个 shot 的图像提示词和视频脚本 artifact，并驱动后续 image/video candidate 生成。 |

重要区别：

- `workspace_artifact` 当前按 `(workspace_id, artifact_type)` 唯一，只保留每类 workspace artifact 的当前行。
- `image_prompt_artifacts` / `video_script_artifacts` 是 per-shot 版本化 artifact；每次 propose 新增一版，旧 ACTIVE 变 STALE。
- 当前没有独立的“最终 assembled prompt”持久化表；workspace propose 返回的 `promptView` 主要是接口响应和调试视图，真实 provider 调用细节更多落在 trace 和 batch `provider_request` 中。

---

## 2. Workspace Artifact

表：`workspace_artifact`

| 字段 | 类型 | Prompt 链路含义 |
|---|---|---|
| `id` | text | artifact id。 |
| `workspace_id` | text | 所属工作区。 |
| `script_id` | text | 当前 script 线索，随 workspace 创建。 |
| `artifact_type` | text | 当前使用：`assets`、`brief`、`storyboard`、`shotprompt`、`feedbackRoute`。 |
| `status` | text | `proposed / approved / stale / failed`。 |
| `data` | jsonb | 该阶段结构化输出，是后续 prompt 的主要输入。 |
| `created_at` | timestamptz | 创建时间。 |
| `updated_at` | timestamptz | 更新时间。 |
| `approved_at` | timestamptz | 首次批准时间，批准态 upsert 时写入。 |

### 2.1 `assets` data

Schema：`materialIntakeArtifactSchema`

| 字段 | 含义 |
|---|---|
| `scannedAt` | 素材扫描时间。 |
| `primaryProductRef` | 主商品素材引用。 |
| `assets[]` | 可用素材清单。每项含 `ref/kind/mime/bytes/sha256/role/description/relevance/usable/included`。 |
| `rejected[]` | 被拒绝素材。每项含 `ref/reason`。 |

### 2.2 `brief` data

Schema：`productBriefArtifactSchema`

| 字段 | 含义 |
|---|---|
| `product` | 商品信息：`name/category/keyFacts/assets[]`。 |
| `audience` | 人群信息：`who/painOrDesire`。 |
| `coreSellingPoint` | 核心卖点。 |
| `proof[]` | 支撑证据。 |
| `offer` | 活动/优惠，可为空。 |
| `platform` | 投放平台。 |
| `brandTone` | 品牌语气。 |
| `bannedExpressions[]` | 禁用表达。 |
| `landingInfo` | 落地页或转化信息，可为空。 |
| `assumptions[]` | 生成时假设。 |

### 2.3 `storyboard` data

Schema：`storyboardArtifactSchema`

| 字段 | 含义 |
|---|---|
| `narrative` | 整体叙事。 |
| `totalDurationSec` | 总时长。 |
| `shots[]` | 分镜草案。每项含 `index/purpose/durationSec/scene/visualDirection/productAssetRef/voiceover/transition`。 |
| `assumptions[]` | 生成时假设。 |

### 2.4 `shotprompt` data

Schema：`shotPromptArtifactSchema`

| 字段 | 含义 |
|---|---|
| `targetProvider` | 当前固定为 `seedance`。 |
| `durationSec` | 全片目标时长。 |
| `aspectRatio` | `9:16 / 16:9 / 1:1`。 |
| `prompt` | 全局视频目标和叙事主线。 |
| `negativePrompt` | 全局负向提示。 |
| `shots[]` | 可播种为 `storyboard_shots` 的逐镜头提示。每项含 `index/startSec/endSec/providerPrompt/referenceAssetRefs/voiceover`。 |
| `tts` | 口播配置：`enabled/source/voiceover/audioAssetRef?`。 |
| `assumptions[]` | 生成时假设。 |

### 2.5 `feedbackRoute` data

Schema：`feedbackRouteArtifactSchema`

| 字段 | 含义 |
|---|---|
| `feedback` | 用户反馈原文。 |
| `targetArtifact` | 路由目标：`brief / storyboard / shotprompt`。 |
| `previousJobId` | 关联历史 job，可选。 |
| `reason` | 路由原因。 |
| `revisionInstruction` | 给目标 builder 或人工编辑表单的修订要求。 |
| `confidence` | `high / medium / low`。 |
| `routedAt` | 路由时间。 |

---

## 3. Shot Seed Artifact

表：`storyboard_shots`

`shotprompt` 批准后，`seedShotsFromShotPrompt()` 会重建此表。它不是 prompt artifact 表，但它是 V2 agent 的核心输入锚点。

| 字段 | Prompt 链路含义 |
|---|---|
| `id` | shot id。 |
| `workspace_id` | 所属工作区。 |
| `script_id` | 当前 script 线索。 |
| `order_index` | 分镜顺序。 |
| `title` | 当前从 `shots[].providerPrompt` 截断得出。 |
| `objective` | 当前等于 `shots[].providerPrompt`。 |
| `default_duration_sec` | `endSec - startSec`；视频 agent/provider 使用。真实 Seedance 要求 4-12 秒。 |
| `status` | shot 状态机当前状态。 |
| `active_image_prompt_artifact_id` | 当前 ACTIVE 图像提示 artifact。 |
| `selected_image_id` | 当前选定图像候选。 |
| `active_video_script_artifact_id` | 当前 ACTIVE 视频脚本 artifact。 |
| `selected_video_id` | 当前选定视频候选。 |
| `last_error` | 最近失败原因。 |

表：`shot_asset_refs`

| 字段 | Prompt 链路含义 |
|---|---|
| `shot_id` | 所属 shot。 |
| `asset_id` | 关联素材。 |
| `role` | `product_identity` 或 `reference` 等。 |
| `weight` | 素材权重。 |
| `position` | 素材顺序。 |

---

## 4. Image Prompt Artifact

表：`image_prompt_artifacts`

| 字段 | 类型 | Prompt 链路含义 |
|---|---|---|
| `id` | text | 图像提示 artifact id。 |
| `shot_id` | text | 所属 shot。 |
| `version` | int | shot 内递增版本。 |
| `status` | enum | `DRAFT / ACTIVE / APPROVED / STALE / ARCHIVED`。当前 propose 会把旧 ACTIVE 置 STALE。 |
| `prompt_text` | text | 给 Ark Seedream 的核心图像提示词。 |
| `negative_prompt` | text | 图像负向提示，可为空。 |
| `reference_asset_ids` | text[] | 参与 prompt 的素材 id。 |
| `prompt_json` | jsonb | agent 输出和上下文快照。 |
| `created_by` | text | 当前通常为 `agent`。 |
| `agent_name` | text | 当前为 `StoryboardImagePromptAgent`。 |
| `prompt_template_version` | text | 当前为 `v1`。 |
| `base_artifact_id` | text | 派生来源 artifact，可为空。 |
| `created_at` | timestamptz | 创建时间。 |

`prompt_json` 当前包含：

| 字段 | 来源 |
|---|---|
| `promptText` | `StoryboardImagePromptOutputSchema.promptText`。 |
| `negativePrompt` | agent 输出，可为空。 |
| `visualStyle` | agent 输出，可为空。 |
| `composition` | agent 输出，可为空。 |
| `lighting` | agent 输出，可为空。 |
| `productVisibilityRule` | agent 输出。 |
| `referenceImageUsage[]` | agent 输出；每项含 `assetId/usage/instruction`。 |
| `qualityChecklist[]` | agent 输出。 |
| `context` | server 注入的上下文摘要，包括 material/brief/shotprompt、前后镜、当前/前序候选、`image_ref`、`number` 等。 |

相关 batch：`image_generation_batches`

| 字段 | Prompt 链路含义 |
|---|---|
| `image_prompt_artifact_id` | 绑定本次图像提示 artifact。 |
| `provider` | 当前为 `ark-seedream`。 |
| `aspect_ratio` | 生成宽高比。 |
| `provider_request` | provider 请求摘要：`prompt/negativePrompt/image_ref/count/aspectRatio`。 |
| `idempotency_key` | propose 内部合成，retry 使用公开请求头。 |
| `requested_count/succeeded_count/failed_count/status/error_message` | 生成批次状态。 |

相关候选：`image_candidates`

| 字段 | Prompt 链路含义 |
|---|---|
| `batch_id` | 所属 image batch。 |
| `image_url` | 成功后稳定工作区 URL。 |
| `provider_response` | provider 返回摘要，含候选 index、临时 URL 等。 |
| `status/error_message` | 候选状态。 |

选定结果：`selected_shot_images`

| 字段 | Prompt 链路含义 |
|---|---|
| `shot_id` | 每个 shot 唯一。 |
| `image_candidate_id` | 当前选定图像。 |
| `image_generation_batch_id` | 选定图像所在 batch。 |
| `selected_by/selected_at` | 选择人和选择时间。 |

---

## 5. Video Script Artifact

表：`video_script_artifacts`

| 字段 | 类型 | Prompt 链路含义 |
|---|---|---|
| `id` | text | 视频脚本 artifact id。 |
| `shot_id` | text | 所属 shot。 |
| `version` | int | shot 内递增版本。 |
| `status` | enum | `DRAFT / ACTIVE / APPROVED / STALE / ARCHIVED`。 |
| `duration_sec` | int | 单镜视频时长。真实 Seedance 要求 4-12 秒。 |
| `script_json` | jsonb | agent 结构化脚本输出和上下文快照。 |
| `provider_prompt` | text | 给 Seedance 的最终视频生成提示。 |
| `based_on_image_candidate_id` | text | 当前 shot 选中图，作为 first frame。 |
| `based_on_prev_image_candidate_id` | text | 前一镜图像锚点，当前主线通常为空。 |
| `based_on_next_image_candidate_id` | text | 下一镜选中图，作为 last frame。 |
| `created_by` | text | 当前通常为 `agent`。 |
| `agent_name` | text | 当前为 `VideoShotScriptAgent`。 |
| `prompt_template_version` | text | 当前为 `v1`。 |
| `base_artifact_id` | text | 派生来源 artifact，可为空。 |
| `created_at` | timestamptz | 创建时间。 |

`script_json` 当前包含：

| 字段 | 来源 |
|---|---|
| `durationSec` | agent 输出，来自 server 注入的 shot 时长。 |
| `shotGoal` | agent 输出。 |
| `startFrameDescription` | agent 输出。 |
| `endFrameDescription` | agent 输出。 |
| `continuityWithPrevious` | agent 输出，可为空。 |
| `continuityWithNext` | agent 输出，可为空。 |
| `cameraMotion` | agent 输出。 |
| `subjectMotion` | agent 输出。 |
| `productVisibility` | agent 输出。 |
| `sceneConsistency` | agent 输出。 |
| `voiceover` | agent 输出，可为空。 |
| `onscreenText` | agent 输出，可为空。 |
| `providerPrompt` | agent 输出，复制到表字段 `provider_prompt`。 |
| `negativePrompt` | agent 输出，可为空。 |
| `riskNotes[]` | agent 输出。 |
| `context` | server 注入的上下文摘要，包括 material/brief/shotprompt、前后镜、已选图等。 |

相关 batch：`video_generation_batches`

| 字段 | Prompt 链路含义 |
|---|---|
| `video_script_artifact_id` | 绑定本次视频脚本 artifact。 |
| `provider` | 当前为 `seedance`。 |
| `aspect_ratio` | 生成宽高比。 |
| `provider_request` | 主线 propose 中保存 `providerPrompt/first_frame_url/last_frame_url/durationSec/count/aspectRatio`。retry 路径当前可能为空对象。 |
| `idempotency_key` | 主线 propose 当前为空；retry 使用公开请求头。 |
| `requested_count/succeeded_count/failed_count/status/error_message` | 生成批次状态。 |

相关候选：`video_candidates`

| 字段 | Prompt 链路含义 |
|---|---|
| `batch_id` | 所属 video batch。 |
| `video_url` | 成功后稳定工作区 URL。 |
| `thumbnail_url` | 缩略图 URL，可为空。 |
| `duration_sec/width/height` | provider 返回或后处理得到的媒体元数据。 |
| `provider_response` | provider 返回摘要。 |
| `status/error_message` | 候选状态。 |

选定结果：`selected_shot_videos`

| 字段 | Prompt 链路含义 |
|---|---|
| `shot_id` | 每个 shot 唯一。 |
| `video_candidate_id` | 当前选定视频。 |
| `video_generation_batch_id` | 选定视频所在 batch。 |
| `selected_by/selected_at` | 选择人和选择时间。 |

---

## 6. Trace 与 Job 关联字段

表：`trace_events`

| 字段 | Prompt 链路含义 |
|---|---|
| `workspace_id` / `shot_id` | trace 归属。 |
| `trace_type` | `agent_run / provider_call / job_event / state_transition / user_action`。 |
| `name` | 事件名，如 `image_prompt_proposed`、`video_script_proposed`。 |
| `input_preview` | 输入预览，可为空。 |
| `output_preview` | 输出预览，常取 prompt 或 provider prompt 前 200 字。 |
| `metadata` | prompt template version、context、batch id、candidate ids、frames、provider 信息等。 |

表：`generation_jobs`

| 字段 | Prompt 链路含义 |
|---|---|
| `job_type` | `generate_image_candidate / generate_images / generate_videos / compose_final_video`。 |
| `related_batch_type` / `related_batch_id` | 关联 candidate、batch 或 final job。 |
| `payload` | worker payload，包含 prompt artifact id、batch id、shot/workspace id、aspectRatio、referenceImageUrls 等。 |
| `error_message` | worker 失败原因。 |

---

## 7. 当前缺口

- 没有独立的 prompt requirement artifact；用户自定义要求当前主要走各 endpoint 的散落字段，例如 `userDirection`、`stylePreference`、`aspectRatio`。
- 没有统一的 prompt assembler；各 workspace prompt builder 和两个 shot agent 分别组装输入。
- 没有持久化“最终 assembled prompt”的统一字段；目前只能从 `promptView`、`trace_events.metadata`、batch `provider_request`、artifact `prompt_json/script_json.context` 间接复原。
- `image_prompt_artifacts` / `video_script_artifacts` 有版本字段，但这是 shot artifact 版本，不等于用户自定义 prompt 要求的配置版本。
