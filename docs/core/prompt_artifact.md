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

### 1.1 当前剧本链路的 prompt 拼装

本节描述当前版本从“商品卖点审核”到“生成成片”的实际 prompt 拼装。所有 agent 型 module 都遵循同一拼装顺序：

```text
## Subject Prompt
<packages/ai/src/prompts/modules/<module>/subject.md>

## Runtime Context
<server 或 agent 注入的业务上下文>

## Schema Contract
<packages/ai/src/prompts/modules/<module>/contract.md>
```

其中 `subject.md` 是业务主体 prompt，可被剧本 / 分镜 / 图像 / 运镜策略迭代；`contract.md` 是工程契约 prompt，描述输入、输出 schema、字段名、provider 硬约束和禁止项。完整 prompt 写入 trace；artifact 表只保存 `prompt_assembly`，即 `subjectTemplateId`、`contractTemplateId`、`subjectHash`、`contractHash`、`assemblerVersion` 和简短 preview。

| 链路节点 | 触发接口 / 代码入口 | Subject / Contract | Runtime Context / 用户可编辑输入 | 输出与下游 |
|---|---|---|---|---|
| 商品卖点审核 `product-brief` | `POST /api/workspaces/:workspaceId/product-brief/propose`；`productBriefV2Service.propose`；`generateProductBriefWithArk` | `product-brief/subject.md` + `product-brief/contract.md` | `userDirection`、表单预填 `title/sellingPoints/audience/stylePreference`、approved `material_intake_artifacts.data` 中的 `primaryProductRef` 和 `assets[]`。当前 approved `prompt_requirements_artifacts` 作为依赖门槛和 `source_fingerprint.promptRequirementsArtifactId` 记录；本节点当前没有把 requirements data 展开进 runtime context。 | 生成 `product_brief_artifacts.data`：商品、核心卖点、人群、证据、offer、platform、brandTone、landingInfo、assumptions。用户在审核台可用表单修改后 approve；approved 数据覆盖为 current。 |
| 分镜规划 `storyboard` | `POST /api/workspaces/:workspaceId/storyboard/propose`；`storyboardV2Service.propose`；`generateStoryboardWithArk` | `storyboard/subject.md` + `storyboard/contract.md` | approved `product_brief_artifacts.data` 的商品/卖点/人群/语气，approved `material_intake_artifacts.data.assets[]`，以及 approved requirements 中的 `storyboard` / `script` 相关要求。 | 生成 `storyboard_artifacts.data`：`narrative`、`totalDurationSec`、`shots[]`。每个 shot 含 `purpose/durationSec/scene/visualDirection/productAssetRef/voiceover/transition`。这里的 `voiceover` 是后续 shotprompt 和视频旁白的来源。 |
| 分镜生成要求 `shotprompt` | `POST /api/workspaces/:workspaceId/shotprompt/propose`；`shotPromptV2Service.propose`；`generateShotPromptWithArk` | `shotprompt/subject.md` + `shotprompt/contract.md` | approved `product_brief`、approved `material_intake.assets[]`、approved `storyboard`、请求 `aspectRatio`，以及 approved requirements 中的 `shotImage` / `shotVideo` / `storyboard` / `script` 要求。 | 生成 `shot_prompt_artifacts.data`：全局 `prompt/negativePrompt`、`aspectRatio`、逐 shot 的 `providerPrompt/referenceAssetRefs/voiceover/shotImage/shotVideo`、以及 `tts.enabled/source/voiceover`。`providerPrompt` 是语境锚点；`shotImage` 是静态关键帧要求；`shotVideo` 是动态运动要求。server 会通过 `enrichShotPrompt()` 补齐缺失的 `shotImage/shotVideo` dict。 |
| 应用 shot set | `POST /api/workspaces/:workspaceId/shot-sets`；`shotSetService.apply` | 无模型 prompt | 读取 current approved `shot_prompt_artifacts.data`。 | 创建 active `shot_sets`、`storyboard_shots`、`shot_prompt_requirements` 和 `shot_asset_refs`。`storyboard_shots.objective/title` 来自 `shots[].providerPrompt`；`shot_prompt_requirements.shot_image/shot_video` 是后续逐 shot 图像 / 视频 agent 的输入 dict。 |
| 分镜图提示词 `image-prompt` | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose`；`runStoryboardImagePromptAgent` | `image-prompt/subject.md` + `image-prompt/contract.md`，作为 `@openai/agents` Agent instructions。该 agent 使用 Ark Responses API strict structured output。 | user message 是 JSON：approved `productBrief`、approved `materialIntake`、当前 `shot`（含 `providerPromptFromShotPrompt` 和 `shotImage`）、`image_ref`、`referenceAssets[]`、`previousImagePromptText`、`userHint`。首镜 `image_ref` 是主商品素材；后续镜头 `image_ref` 是上一镜 selected image，用于场景一致性。 | 生成 `image_prompt_artifacts.prompt_text/negative_prompt/prompt_json`，并创建 `image_generation_batches`。`promptText` 只描述静态关键帧，不写运镜、时长、首末帧、旁白或转场。真正发给 Seedream 的 provider request 使用 `promptText`、`negativePrompt`、`referenceImageUrls`、`count`、`aspectRatio`。 |
| 分镜图用户编辑重生成 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/regenerate` | 不调用 text agent；复用 base artifact 的 prompt assembly metadata 并标记 `mode=user-edited-regenerate`。 | 请求体传 `baseArtifactId` 和结构化 prompt 字段。 | 新增 `image_prompt_artifacts(created_by='user', base_artifact_id=...)` 和新 image batch；`provider_request.prompt` 来自用户编辑的 `promptText`；当前 `selected_image_id` 不清空，旧候选仍可回看。 |
| 分镜视频脚本 `video-script` | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose`；`runVideoShotScriptAgent` | `video-script/subject.md` + `video-script/contract.md`，作为 `@openai/agents` Agent instructions | user message 是 JSON：approved `productBrief`、当前 `shot`（含 `voiceover/providerPromptFromShotPrompt/shotVideo`）、当前 active shot set 内本 shot selected image 作为 `first_frame_url`、下一镜 selected image 作为 `last_frame_url`、`durationSec`、`neighborImages`、`previousVideoScript`、`userHint`。当前要求 active shot set 全部 shots 均已 selected image 后才可进入视频脚本。 | 生成 `video_script_artifacts.script_json/provider_prompt`，并创建 `video_generation_batches` 和候选 job。`source_fingerprint` 记录 `firstFrameCandidateId`、`lastFrameCandidateId`、`voiceProfileHash`、`voiceover`。`provider_prompt` 是 agent 输出；发 Seedance 前还会经 `buildSeedanceShotVideoPrompt()` 拼入统一旁白声音要求。 |
| 分镜视频生成 | `generation_v2` worker；`runVideoGenerationCandidate` / `generateVideoWithSeedance` | 无额外 agent prompt；使用 `video_script_artifacts.provider_prompt` 加 server-side 音频块 | `buildSeedanceShotVideoPrompt()` 将 `script.providerPrompt` 与 `script.scriptJson.voiceover` 组合：若有 voiceover，会追加统一 narrator / voice profile 规则（同一说话人、自然清晰普通话、统一语速/情绪/电商短视频播报风格）、本镜口播、`generate_audio=true` 和禁止字幕/可读文字。Seedance 请求体还固定传 `generate_audio: true`。 | Seedance `content[0].text` 为最终文本 prompt，`content[]` 同时含 `first_frame` 和可选 `last_frame` 图片；成功后写 `video_candidates.provider_response/video_url`。 |
| 视频选择 `video-select` | `POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | 无模型 prompt | 用户从候选视频中选择一个。 | 写 `video_select_artifacts` 并更新 `storyboard_shots.selected_video_id`。重复选择用 UPSERT 覆盖当前选择，不删除未选候选。 |
| 生成成片 `final compose` | `POST /api/workspaces/:workspaceId/final-videos`；`processComposeFinalVideo` | 无 LLM / provider prompt | 读取 active shot set 下每个 shot 的 `selected_video_id` 和 `active_video_script_artifact_id`。 | 使用 ffmpeg concat selected videos，音轨保留并转 AAC；写 `final_video_jobs.compiled_manifest`、`compiled_manifest_hash`、`local_url`。当前成片阶段不再调用 `buildSeedanceVideoExportPrompt()`，该 builder 仅保留为旧 whole-video export / contract registry 口径。 |

需要特别注意：当前版本中，`prompt_requirements_artifacts.data` 对 product-brief / storyboard / shotprompt 主要表现为“依赖门槛 + source fingerprint”；逐 shot 的图像 / 视频要求则通过 approved shotprompt 中的 `shotImage` / `shotVideo` dict 明确进入 image-prompt / video-script agent 输入。

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

参考视频导入不直接写入 `prompt_requirements_artifacts`。`POST /api/workspaces/:workspaceId/reference-video/import` 只把站外直连视频或上传视频分析为 requirements draft，返回给首屏表单填入现有字段；用户点击提交后才进入 `prompt-requirements/propose` / `approve` 生命周期。参考视频也不写入 `asset`，不参与 `material-intake.assets[]`。

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
| `provider_prompt` | text | agent 输出的 Seedance 画面/运镜提示。真正发给 Seedance 前会经 `buildSeedanceShotVideoPrompt()` 追加旁白音频要求。 |
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
- provider 请求 prompt：worker 不直接把 `provider_prompt` 原样发给 Seedance，而是调用 `buildSeedanceShotVideoPrompt({ providerPrompt, scriptJson })`。当 `script_json.voiceover` 非空时，会追加中文旁白生成要求，并要求不要在画面中生成字幕/可读文字；同时 `generate_audio` 固定传 `true`。

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

- `prompt_requirements_artifacts` 已能保存用户创作要求；当前 product-brief / storyboard / shotprompt 只把 requirements 作为依赖门槛与 `source_fingerprint` 记录，尚未把 requirements data 系统展开到这三个 module 的 runtime context。逐 shot 阶段则已通过 `shotImage` / `shotVideo` dict 注入 image-prompt / video-script agent。
- 当前不持久化完整 assembled prompt；完整 prompt 写 trace，artifact 只保存模板 id/hash 与 preview。
- 旧 V1 workspace 静态 builder endpoints 与 `shotprompt approve` delete/reseed 主链路已下线；状态摘要改读 module-owned artifact tables。
