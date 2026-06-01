# prompt_artifact — 当前 Prompt 链路 Artifact 字段

更新时间：2026-06-01

本文只描述当前架构中与 prompt 链路相关的 artifact、状态锚点和 provider 生成记录。机器契约以 `apps/server/src/db/schema/schema.sql`、`packages/shared/src/schemas/artifacts.ts`、`packages/ai/src/schemas/*` 为准。

---

## 1. Prompt 链路总览

当前 prompt 链路分三层：

| 层级 | 主要表 / artifact | 用途 |
|---|---|---|
| Workspace module artifacts | `prompt_requirements_artifacts`、`material_intake_artifacts`、`product_brief_artifacts`、`storyboard_artifacts`、`shot_prompt_artifacts` | 保存 workspace 级 current approved / latest proposed 产物。 |
| Shot set artifacts | `shot_sets`、`storyboard_shots`、`shot_prompt_requirements` | 把 approved shotprompt 显式 apply 为一个 active shot set，并保存每个 shot 的 image/video 要求 dict。 |
| Shot agent artifacts | `image_prompt_artifacts`、`video_script_artifacts`、`image_select_artifacts`、`video_select_artifacts` | 存单个 shot 的图像提示词、视频脚本和当前选择，并驱动 image/video candidate 与 final compose。 |

重要区别：

- V2 主链路不再把 `assets/brief/storyboard/shotprompt` 写入 `workspace_artifact`。
- module artifact 是 append-only 语义；业务读取 `status='approved' and is_current=true`，UI 可读 latest proposed。
- `shotprompt approve` 只产生 current approved artifact；只有 `POST /shot-sets` 才创建 active shot set 和 `storyboard_shots`。
- `image_prompt_artifacts` / `video_script_artifacts` 是 per-shot 版本化 artifact；每次 propose 新增一版，旧 ACTIVE 变 STALE。
- 当前不持久化完整 assembled prompt；完整 prompt 写入 trace，module artifact 的 `prompt_assembly` 保存 subject/contract 模板 id 与 hash。

---

## 2. Workspace Module Artifact

通用字段存在于每个 module artifact 表：

| 字段 | 类型 | Prompt 链路含义 |
|---|---|---|
| `id` | text | artifact id。 |
| `workspace_id` | text | 所属工作区。 |
| `status` | text | `proposed / approved / archived / failed`。 |
| `is_current` | boolean | 是否为当前 approved 版本；同一 workspace 每表最多一条 current approved。 |
| `data` | jsonb | 该阶段结构化输出，是后续 prompt 的主要输入。 |
| `source_fingerprint` | jsonb | 生成本产物时读取的上游 artifact id。 |
| `prompt_assembly` | jsonb | 主体 prompt / contract prompt 的模板 id、hash、assembler 版本和 preview。 |
| `created_at` | timestamptz | 创建时间。 |
| `updated_at` | timestamptz | 更新时间。 |
| `approved_at` | timestamptz | 批准时间。 |

`prompt_assembly` 当前形态：

| 字段 | 含义 |
|---|---|
| `moduleId` | `prompt-requirements / material-intake / product-brief / storyboard / shotprompt`。 |
| `assemblerVersion` | 当前为 `v2`。 |
| `subjectTemplateId` | 主体创作 prompt 文件，例如 `shotprompt/subject.md`。 |
| `contractTemplateId` | 输入 artifact、输出 schema、JSON/provider 约束文件，例如 `shotprompt/contract.md`。 |
| `subjectHash` | subject.md 内容 SHA-256。 |
| `contractHash` | contract.md 内容 SHA-256。 |
| `requirementArtifactId` | 生成时读取的 current prompt requirements id；prompt-requirements 自身为空。 |
| `preview` | artifact data 的短摘要；完整 assembled prompt 写 trace。 |

模板文件位于：

```text
packages/ai/src/prompts/modules/<module>/
├── subject.md
└── contract.md
```

编辑边界：

| 角色 / 目标 | 修改入口 | 不应修改 |
|---|---|---|
| 剧本同学调整主剧本 / shotprompt 生成策略 | `packages/ai/src/prompts/modules/shotprompt/subject.md` | `shotprompt/contract.md` |
| 剧本同学调整单镜头视频脚本 / 运镜生成策略 | `packages/ai/src/prompts/modules/video-script/subject.md` | `video-script/contract.md` |
| 分镜同学调整 storyboard 叙事节奏 | `packages/ai/src/prompts/modules/storyboard/subject.md` | `storyboard/contract.md` |
| 图像 prompt 同学调整分镜图生成策略 | `packages/ai/src/prompts/modules/image-prompt/subject.md` | `image-prompt/contract.md` |
| 工程侧修改输入输出 schema/provider 硬约束 | 对应 module 的 `contract.md` 与 schema/response_format 同步修改 | 仅改 subject 绕过契约 |

`subject.md` 是主体创作 prompt，允许业务迭代生成策略、风格、表达偏好和素材使用策略。`contract.md` 是工程契约，定义 agent 可见输入、必须输出的 JSON schema、字段语义和 provider 限制；业务自定义不应覆盖 contract。每次生成都会把 `subjectTemplateId`、`contractTemplateId`、`subjectHash`、`contractHash` 写入 `prompt_assembly`，完整 assembled prompt 写入 trace。

### 2.1 `prompt_requirements_artifacts.data`

保存用户对后续 module 的创作要求。常见分区：

| 字段 | 含义 |
|---|---|
| `image` | 全局图片风格、构图、避免事项。 |
| `script` | 剧本/口播语气。 |
| `storyboard` | 分镜节奏、叙事要求。 |
| `shotImage` | 分镜图的全局或逐镜要求。 |
| `shotVideo` | 分镜视频的全局或逐镜要求。 |

### 2.2 `material_intake_artifacts.data`

Schema：`materialIntakeArtifactSchema`

| 字段 | 含义 |
|---|---|
| `scannedAt` | 素材扫描时间。 |
| `primaryProductRef` | 主商品素材引用。 |
| `assets[]` | 可用素材清单。每项含 `ref/kind/mime/bytes/sha256/role/description/relevance/usable/included`。 |
| `rejected[]` | 被拒绝素材。每项含 `ref/reason`。 |

### 2.3 `product_brief_artifacts.data`

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

### 2.4 `storyboard_artifacts.data`

Schema：`storyboardArtifactSchema`

| 字段 | 含义 |
|---|---|
| `narrative` | 整体叙事。 |
| `totalDurationSec` | 总时长。 |
| `shots[]` | 分镜草案。每项含 `index/purpose/durationSec/scene/visualDirection/productAssetRef/voiceover/transition`。 |
| `assumptions[]` | 生成时假设。 |

### 2.5 `shot_prompt_artifacts.data`

Schema：`shotPromptArtifactSchema`

| 字段 | 含义 |
|---|---|
| `targetProvider` | 当前固定为 `seedance`。 |
| `durationSec` | 全片目标时长。 |
| `aspectRatio` | `9:16 / 16:9 / 1:1`。 |
| `prompt` | 全局视频目标和叙事主线。 |
| `negativePrompt` | 全局负向提示。 |
| `shots[]` | 可 apply 为 `storyboard_shots` 的逐镜头提示。每项含 `index/startSec/endSec/providerPrompt/referenceAssetRefs/voiceover/shotImage/shotVideo`。server 会把 provider 返回的 shot index 归一化为 0-based 顺序。 |
| `tts` | 口播配置：`enabled/source/voiceover/audioAssetRef?`。 |
| `assumptions[]` | 生成时假设。 |

---

## 3. Shot Set Artifact

表：`shot_sets`

`POST /api/workspaces/:workspaceId/shot-sets` 将当前或指定 approved `shot_prompt_artifacts` apply 为 active shot set。apply 会归档旧 active set，但不会自动清空旧候选或旧选择。

| 字段 | 含义 |
|---|---|
| `id` | shot set id。 |
| `workspace_id` | 所属 workspace。 |
| `shot_prompt_artifact_id` | 来源 approved shotprompt。 |
| `status` | `active / archived`。 |
| `source_fingerprint` | 来源 artifact id。 |
| `created_at / archived_at` | 创建和归档时间。 |

表：`storyboard_shots`

`storyboard_shots` 是 active shot set 下每个分镜的执行锚点。

| 字段 | Prompt 链路含义 |
|---|---|
| `id` | shot id。 |
| `workspace_id` | 所属工作区。 |
| `shot_set_id` | 所属 shot set。 |
| `script_id` | 当前 script 线索。 |
| `order_index` | 0-based 分镜顺序。 |
| `title` | 当前从 `shots[].providerPrompt` 截断得出。 |
| `objective` | 当前等于 `shots[].providerPrompt`。 |
| `default_duration_sec` | `endSec - startSec`；视频 agent/provider 使用。真实 Seedance 要求 4-12 秒。 |
| `status` | shot 状态机当前状态。 |
| `active_image_prompt_artifact_id` | 当前 ACTIVE 图像提示 artifact。 |
| `selected_image_id` | 当前选定图像候选。 |
| `active_video_script_artifact_id` | 当前 ACTIVE 视频脚本 artifact。 |
| `selected_video_id` | 当前选定视频候选。 |
| `last_error` | 最近失败原因。 |

表：`shot_prompt_requirements`

| 字段 | Prompt 链路含义 |
|---|---|
| `workspace_id` | 所属 workspace。 |
| `shot_set_id` | 所属 shot set。 |
| `shot_id` | 对应 storyboard_shots 行；每个 shot 一条。 |
| `shot_prompt_artifact_id` | 来源 approved shotprompt。 |
| `shot_image` | 该 shot 的分镜图要求 dict。 |
| `shot_video` | 该 shot 的分镜视频要求 dict。 |

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
| `source_fingerprint` | jsonb | 本次 propose 读取的上游 artifact、shot requirement、`image_ref` 和候选数摘要。 |
| `prompt_assembly` | jsonb | `image-prompt/subject.md` + `image-prompt/contract.md` 的 assembly metadata，含 subject/contract hash。 |
| `created_by` | text | 当前通常为 `agent`。 |
| `agent_name` | text | 当前为 `StoryboardImagePromptAgent`。 |
| `prompt_template_version` | text | 当前为 `v2`。 |
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

prompt 装配：

- subject prompt：`packages/ai/src/prompts/modules/image-prompt/subject.md`，负责图像创作主体要求和 `shotImage` dict 的使用方式。
- contract prompt：`packages/ai/src/prompts/modules/image-prompt/contract.md`，只说明输入 JSON 和 `StoryboardImagePromptOutputSchema` 输出约束。
- 业务调整分镜图生成策略时改 subject；只有输入字段或输出 schema 变化时才改 contract。

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

选定结果：`image_select_artifacts`

| 字段 | Prompt 链路含义 |
|---|---|
| `workspace_id` | 所属 workspace。 |
| `shot_set_id` | 所属 active shot set；成片时按该实例读取选择。 |
| `shot_id` | 每个 shot 唯一。 |
| `image_candidate_id` | 当前选定图像。 |
| `image_generation_batch_id` | 选定图像所在 batch。 |
| `selected_by/selected_at` | 选择人和选择时间。 |
| `created_at/updated_at` | 创建和覆盖更新时间。重复选择 UPSERT 覆盖当前行，不删除未选候选。 |

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
| `source_fingerprint` | jsonb | 本次 propose 读取的上游 artifact、shot requirement、first/last frame 和候选数摘要。 |
| `prompt_assembly` | jsonb | `video-script/subject.md` + `video-script/contract.md` 的 assembly metadata，含 subject/contract hash。 |
| `created_by` | text | 当前通常为 `agent`。 |
| `agent_name` | text | 当前为 `VideoShotScriptAgent`。 |
| `prompt_template_version` | text | 当前为 `v2`。 |
| `base_artifact_id` | text | 派生来源 artifact，可为空。 |
| `created_at` | timestamptz | 创建时间。 |

`script_json` 当前包含：

| 字段 | 来源 |
|---|---|
| `durationSec` | agent 输出，来自 server 注入的 shot 时长；server 会按真实 Seedance 约束夹到 4-12 秒范围内。 |
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

prompt 装配：

- subject prompt：`packages/ai/src/prompts/modules/video-script/subject.md`，负责视频运动主体要求和 `shotVideo` dict 的使用方式。
- contract prompt：`packages/ai/src/prompts/modules/video-script/contract.md`，只说明输入 JSON 和 `VideoShotScriptOutputSchema` 输出约束。
- 业务调整单镜头视频脚本 / 运镜生成策略时改 subject；只有输入字段、输出 schema 或 Seedance 硬约束变化时才改 contract。

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

选定结果：`video_select_artifacts`

| 字段 | Prompt 链路含义 |
|---|---|
| `workspace_id` | 所属 workspace。 |
| `shot_set_id` | 所属 active shot set；final compose 按该实例读取选择。 |
| `shot_id` | 每个 shot 唯一。 |
| `video_candidate_id` | 当前选定视频。 |
| `video_generation_batch_id` | 选定视频所在 batch。 |
| `selected_by/selected_at` | 选择人和选择时间。 |
| `created_at/updated_at` | 创建和覆盖更新时间。重复选择 UPSERT 覆盖当前行，不删除未选候选。 |

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

- `prompt_requirements_artifacts` 已能保存用户创作要求；后续还需要把这些要求更系统地注入每个 module 的 runtime context，而不只是作为 artifact/source 指纹存在。
- 当前不持久化完整 assembled prompt；完整 prompt 写 trace，artifact 只保存模板 id/hash 与 preview。
- 旧 V1 workspace 静态 builder endpoints 与 `shotprompt approve` delete/reseed 主链路已下线；状态摘要改读 module-owned artifact tables。
