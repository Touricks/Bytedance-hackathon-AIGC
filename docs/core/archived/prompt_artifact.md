# prompt_artifact — Prompt Artifact 字段与存储契约

更新时间：2026-06-08

本文只描述当前架构中与 prompt 链路相关的 artifact、状态锚点和 provider 生成记录。跨 module 的 prompt 组装顺序、artifact 流通和上下游读取规则见 [`prompt_workflow.md`](./prompt_workflow.md)。机器契约以 `apps/server/src/db/schema/schema.sql`、`packages/shared/src/schemas/artifacts.ts`、`packages/ai/src/schemas/*` 为准。

---

## 1. Prompt 链路总览

当前 prompt 链路分三层：

| 层级                       | 主要表 / artifact                                                                                                                        | 用途                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Workspace module artifacts | `prompt_requirements_artifacts`、`material_intake_artifacts`、`product_brief_artifacts`、`storyboard_artifacts`、`shot_prompt_artifacts` | 保存 workspace 级 current approved / latest proposed 产物。                                                   |
| Shot set artifacts         | `shot_sets`、`storyboard_shots`、`shot_prompt_requirements`                                                                              | 把 approved shotprompt 显式 apply 为一个 active shot set，并保存每个 shot 的 image/video 要求 dict。          |
| Per-shot artifacts         | `image_prompt_artifacts`、`video_script_artifacts`、`image_select_artifacts`、`video_select_artifacts`                                   | 存单个 shot 的图像提示词、视频脚本和当前选择，并驱动 image/video candidate 与 final compose。                 |
| Orchestrator jobs          | `one_click_final_video_jobs`、`shot_image_auto_selection_jobs`                                                                           | 保存全自动一键成片和独立分镜图自动选择的阶段状态、幂等键、中间 artifact/batch id、shot set id 和结果 job id。 |

重要区别：

- V2 主链路不再把 `assets/brief/storyboard/shotprompt` 写入 `workspace_artifact`。
- module artifact 是 append-only 语义；业务读取 `status='approved' and is_current=true`，UI 可读 latest proposed。
- `shotprompt approve` 只产生 current approved artifact；只有 `POST /shot-sets` 才创建 active shot set 和 `storyboard_shots`。
- `image_prompt_artifacts` / `video_script_artifacts` 是 per-shot 版本化 artifact；每次 propose 新增一版，旧 ACTIVE 变 STALE。
- `shot-workflow-status`、`image-rounds`、`video-rounds` 会基于 `source_fingerprint` 返回 `upstream`，提示当前 shot/round 是否基于旧上游；这是 redo handoff 信号，不会自动删除候选、选择或成片链路。
- workspace module artifact 的完整 assembled prompt 写入 trace，`prompt_assembly` 保存 subject/contract 模板 id 与 hash；逐 shot 的 `image_prompt_artifacts` / `video_script_artifacts` 当前由后端 deterministic assembler 直接持久化 provider-facing prompt 主体。
- material-intake 的真实 Ark text provider 请求默认只发送纯文本 runtime context。product-brief 在真实模式下会读取 primary material image，并以 `image_url` 形式附给多模态 Ark text provider，避免只凭空 metadata 生成商品 brief。
- 一键成片和独立分镜图自动选择都不创建新的 prompt artifact 类型；一键成片串起现有 prompt artifact、candidate、selection 和 final video job，独立分镜图自动选择只串起 image candidate 与 image selection，并在 `trace_events` 写阶段事件。一键成片 job 的 `current_stage/stage_state` 也是前端进度条的派生来源。

### 1.1 Prompt 组装与跨模块流通

workspace module prompt 组装由 `packages/ai/src/prompts/module-prompt-assembler.ts` 统一完成，模板目录只包含 `subject.md` 和 `contract.md`。逐 shot image/video prompt 由 server deterministic assembler 完成，不恢复二次创意 agent 主路径。逐节点读取哪些 artifact、怎样写入下游、哪些步骤没有模型 prompt，统一维护在 [`prompt_workflow.md`](./prompt_workflow.md)。

---

## 2. Workspace Module Artifact

通用字段存在于每个 module artifact 表：

| 字段                 | 类型        | Prompt 链路含义                                                                            |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `id`                 | text        | artifact id。                                                                              |
| `workspace_id`       | text        | 所属工作区。                                                                               |
| `status`             | text        | `proposed / approved / archived / failed`。                                                |
| `is_current`         | boolean     | 是否为当前 approved 版本；同一 workspace 每表最多一条 current approved。                   |
| `data`               | jsonb       | 该阶段结构化输出，是后续 prompt 的主要输入。                                               |
| `source_fingerprint` | jsonb       | 生成本产物时读取的上游 artifact id。                                                       |
| `prompt_assembly`    | jsonb       | workspace module 的主体 prompt / contract prompt 模板 id、hash、assembler 版本和 preview。 |
| `created_at`         | timestamptz | 创建时间。                                                                                 |
| `updated_at`         | timestamptz | 更新时间。                                                                                 |
| `approved_at`        | timestamptz | 批准时间。                                                                                 |

`storyboard/voiceover/propose` 生成的 `storyboard_artifacts.source_fingerprint` 额外记录 `baseStoryboardArtifactId` 与 `rewriteKind: "voiceover"`，用于区分“完整 storyboard propose”和“只重写口播”的 proposed artifact。

`product-brief/propose` 在商品卖点审核页按商家自然语言重生成时，会读取请求内的当前页面草稿 `draft`，并写入新的 proposed `product_brief_artifacts`。此时 `source_fingerprint` 仍保留 current prompt requirements/material intake id，并额外记录 `baseProductBriefArtifactId` 与 `rewriteKind: "merchant_direction"`。该 proposed 产物不会改变 current；只有 approve 后，storyboard/shotprompt 才会因 current product brief id 变化显示上游变化。

workspace module `prompt_assembly` 当前形态：

| 字段                    | 含义                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `moduleId`              | `prompt-requirements / material-intake / product-brief / storyboard / shotprompt`。 |
| `assemblerVersion`      | 当前为 `v2`。                                                                       |
| `subjectTemplateId`     | 主体创作 prompt 文件，例如 `shotprompt/subject.md`。                                |
| `contractTemplateId`    | 输入 artifact、输出 schema、JSON/provider 约束文件，例如 `shotprompt/contract.md`。 |
| `subjectHash`           | subject.md 内容 SHA-256。                                                           |
| `contractHash`          | contract.md 内容 SHA-256。                                                          |
| `requirementArtifactId` | 生成时读取的 current prompt requirements id；prompt-requirements 自身为空。         |
| `preview`               | artifact data 的短摘要；完整 assembled prompt 写 trace。                            |

逐 shot `image_prompt_artifacts` / `video_script_artifacts` 的 `prompt_assembly` 不包含 subject/contract 字段。它们主路径由后端 deterministic assembler 直接装配 provider-facing prompt，形态为：

| 字段               | 含义                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| `moduleId`         | `image-prompt / video-script`。                                         |
| `assemblerVersion` | 对应 `SHOT_IMAGE_ASSEMBLER_VERSION` 或 `SHOT_VIDEO_ASSEMBLER_VERSION`。 |
| `source`           | 固定为 `server-deterministic-assembler`。                               |
| `mode`             | `propose` 或 `user-feedback-regenerate`。                               |

这意味着单镜图像/视频要求调整应修改 server deterministic assembler，而不是新增或恢复旧二次创意 agent 主路径。

模板文件位于：

```text
packages/ai/src/prompts/modules/<module>/
├── subject.md
└── contract.md
```

编辑边界：

| 角色 / 目标                               | 修改入口                                                        | 不应修改                       |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| 剧本同学调整主剧本 / shotprompt 生成策略  | `packages/ai/src/prompts/modules/shotprompt/subject.md`         | `shotprompt/contract.md`       |
| 分镜同学调整 storyboard 叙事节奏          | `packages/ai/src/prompts/modules/storyboard/subject.md`         | `storyboard/contract.md`       |
| 图像 / 视频 prompt 同学调整单镜执行策略   | `apps/server/src/modules/shot/prompt-assembler.ts`              | workspace module `contract.md` |
| 工程侧修改输入输出 schema/provider 硬约束 | 对应 module 的 `contract.md` 与 schema/response_format 同步修改 | 仅改 subject 绕过契约          |

`subject.md` 是主体创作 prompt，允许业务迭代生成策略、风格、表达偏好和素材使用策略。`contract.md` 是工程契约，定义 agent 可见输入、必须输出的 JSON schema、字段语义和 provider 限制；业务自定义不应覆盖 contract。每次生成都会把 `subjectTemplateId`、`contractTemplateId`、`subjectHash`、`contractHash` 写入 `prompt_assembly`，完整 assembled prompt 写入 trace。

### 2.1 `prompt_requirements_artifacts.data`

保存用户对后续 module 的创作要求。常见分区：

| 字段                           | 含义                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ---------- | ----------- |
| `image`                        | 全局图片风格、构图、避免事项。                                                                   |
| `script`                       | 剧本/口播语气。                                                                                  |
| `storyboard`                   | 分镜节奏、叙事要求。                                                                             |
| `shotImage`                    | 分镜图的全局或逐镜要求。                                                                         |
| `shotVideo`                    | 分镜视频的全局或逐镜要求。                                                                       |
| `creativeFactors`              | 首屏主标签：`productType + audience + strategy`，以及默认化的 `visualStyle`。                    |
| `factorGuidance`               | 三个看板主标签展开后的 9 个可编辑细分字段，是编译 7 项创作要求的用户可见来源。                   |
| `scriptInfluence`              | 三个看板主标签对剧本角色、受众语气、叙事结构的结构化影响缓存。                                   |
| `compiledRequirementSourceMap` | 7 项编译创作要求分别由哪些 `factorGuidance` 字段汇入，供前端解释“本次调整影响了什么”。           |
| `creativeRequirementTemplate`  | 可选首页模板来源：`templateId/templateNameSnapshot/templateVersion/status`。`status` 为 `applied | customized | detached`。 |

参考视频导入会让模型建议 `creativeFactors`。`POST /api/workspaces/:workspaceId/reference-video/import` 会把站外直连视频或上传视频分析为 `analysis + creativeFactorsRecommendation`，后端再用推荐主因子确定性编译并通过 artifact service 创建或覆盖一条 proposed `prompt_requirements_artifacts`；`visualStyle` 可省略并由 shared schema 默认成 `authentic`。用户 approve 后才成为下游 current input。响应不再返回 `draft` 字段，7 项全局提示词字段只从 `artifact.data` 读取。参考视频不写入 `asset`，不参与 `material-intake.assets[]`。

首屏「创作要求模板」来自 `packages/shared/src/setup_template/creative-requirements.ts`。服务端启动/模块加载时校验 shared Zod schema，并通过 `GET /api/setup-templates/creative-requirements` 返回给前端；模板本体是 `商品/服务类型 + 适用人群 + 推销手法 + visualStyle` 的组合，`fields` 声明每个细分字段会影响 7 项编译要求中的哪些字段。点击模板只确定性填充首屏因子表单草稿。它不会批准 current artifact 或触发素材解读；只有用户保存/提交后才写入 proposed `prompt_requirements_artifacts`。

### 2.2 `material_intake_artifacts.data`

Schema：`materialIntakeArtifactSchema`

| 字段                | 含义                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `scannedAt`         | 素材扫描时间。                                                                                 |
| `primaryProductRef` | 主商品素材引用。                                                                               |
| `assets[]`          | 可用素材清单。每项含 `ref/kind/mime/bytes/sha256/role/description/relevance/usable/included`。 |
| `rejected[]`        | 被拒绝素材。每项含 `ref/reason`。                                                              |

`primaryProductRef` 是主商品素材的唯一事实来源。保存、AI workflow 消费和前端渲染前都会归一 `assets[].role`：只有 `ref === primaryProductRef` 的素材可保留 `product_main`，其他重复主商品标签按素材类型降级为商品细节、演示视频或规格文本等非主素材角色。

### 2.3 `product_brief_artifacts.data`

Schema：`productBriefArtifactSchema`

| 字段                  | 含义                                          |
| --------------------- | --------------------------------------------- |
| `product`             | 商品信息：`name/category/keyFacts/assets[]`。 |
| `audience`            | 人群信息：`who/painOrDesire`。                |
| `coreSellingPoint`    | 核心卖点。                                    |
| `proof[]`             | 支撑证据。                                    |
| `offer`               | 活动/优惠，可为空。                           |
| `platform`            | 投放平台。                                    |
| `brandTone`           | 品牌语气。                                    |
| `bannedExpressions[]` | 禁用表达。                                    |
| `landingInfo`         | 落地页或转化信息，可为空。                    |
| `assumptions[]`       | 生成时假设。                                  |

### 2.4 `storyboard_artifacts.data`

Schema：`storyboardArtifactSchema`

| 字段               | 含义                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `narrative`        | 整体叙事。                                                                                                |
| `totalDurationSec` | 总时长。                                                                                                  |
| `shots[]`          | 分镜草案。每项含 `index/purpose/durationSec/scene/visualDirection/productAssetRef/voiceover/transition`。 |
| `assumptions[]`    | 生成时假设。                                                                                              |

P0 分镜脚本固定为 15 秒三镜。`POST /api/workspaces/:workspaceId/storyboard/voiceover/propose` 只重写 `shots[].voiceover`，必须保留 `shots[]` 数量、顺序、`index`、`purpose`、`durationSec`、`scene`、`visualDirection`、`productAssetRef` 与 `transition`。

### 2.5 `shot_prompt_artifacts.data`

Schema：`shotPromptArtifactSchema`

| 字段             | 含义                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `targetProvider` | 当前固定为 `seedance`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `durationSec`    | 全片目标时长。                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `aspectRatio`    | `9:16 / 16:9 / 1:1`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `prompt`         | 全局视频目标和叙事主线。                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `negativePrompt` | 全局负向提示。                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `shots[]`        | 可 apply 为 `storyboard_shots` 的逐镜头提示。每项含 `index/startSec/endSec/providerPrompt/referenceAssetRefs/voiceover/shotImage/shotVideo`。真实 provider 输出必须与 P0 15 秒三镜 approved storyboard 的 `shots[]` 数量、顺序和 index 一致；不得省略、合并、拆分或新增镜头。apply 时 `storyboard_shots.order_index` 使用数组位置归一为 0-based 工作流顺序，不直接复用 provider-facing `shots[].index`；propose、approve 和 apply 边界都会校验 P0 storyboard 与数量/顺序/index invariant。 |
| `tts`            | 口播配置：`enabled/source/voiceover/audioAssetRef?`。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `assumptions[]`  | 生成时假设。                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 3. Shot Set Artifact

表：`shot_sets`

`POST /api/workspaces/:workspaceId/shot-sets` 将当前或指定 approved `shot_prompt_artifacts` apply 为 active shot set。apply 会归档旧 active set，但不会自动清空旧候选或旧选择；归档实例仅作为数据库历史事实保留，不提供商家工作台打开入口。

| 字段                       | 含义                       |
| -------------------------- | -------------------------- |
| `id`                       | shot set id。              |
| `workspace_id`             | 所属 workspace。           |
| `shot_prompt_artifact_id`  | 来源 approved shotprompt。 |
| `status`                   | `active / archived`。      |
| `source_fingerprint`       | 来源 artifact id。         |
| `created_at / archived_at` | 创建和归档时间。           |

表：`storyboard_shots`

`storyboard_shots` 是 active shot set 下每个分镜的执行锚点。

| 字段                              | Prompt 链路含义                                                             |
| --------------------------------- | --------------------------------------------------------------------------- |
| `id`                              | shot id。                                                                   |
| `workspace_id`                    | 所属工作区。                                                                |
| `shot_set_id`                     | 所属 shot set。                                                             |
| `script_id`                       | 当前 script 线索。                                                          |
| `order_index`                     | 0-based 分镜顺序。                                                          |
| `title`                           | 当前从 `shots[].providerPrompt` 截断得出。                                  |
| `objective`                       | 当前等于 `shots[].providerPrompt`。                                         |
| `default_duration_sec`            | `endSec - startSec`；视频 agent/provider 使用。真实 Seedance 要求 4-12 秒。 |
| `status`                          | shot 状态机当前状态。                                                       |
| `active_image_prompt_artifact_id` | 当前 ACTIVE 图像提示 artifact。                                             |
| `selected_image_id`               | 当前选定图像候选。                                                          |
| `active_video_script_artifact_id` | 当前 ACTIVE 视频脚本 artifact。                                             |
| `selected_video_id`               | 当前选定视频候选。                                                          |
| `last_error`                      | 最近失败原因。                                                              |

表：`shot_prompt_requirements`

| 字段                      | Prompt 链路含义                            |
| ------------------------- | ------------------------------------------ |
| `workspace_id`            | 所属 workspace。                           |
| `shot_set_id`             | 所属 shot set。                            |
| `shot_id`                 | 对应 storyboard_shots 行；每个 shot 一条。 |
| `shot_prompt_artifact_id` | 来源 approved shotprompt。                 |
| `shot_image`              | 该 shot 的分镜图要求 dict。                |
| `shot_video`              | 该 shot 的分镜视频要求 dict。              |

表：`shot_asset_refs`

| 字段       | Prompt 链路含义                        |
| ---------- | -------------------------------------- |
| `shot_id`  | 所属 shot。                            |
| `asset_id` | 关联素材。                             |
| `role`     | `product_identity` 或 `reference` 等。 |
| `weight`   | 素材权重。                             |
| `position` | 素材顺序。                             |

---

## 4. Image Prompt Artifact

表：`image_prompt_artifacts`

| 字段                      | 类型        | Prompt 链路含义                                                                                                                            |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                      | text        | 图像提示 artifact id。                                                                                                                     |
| `shot_id`                 | text        | 所属 shot。                                                                                                                                |
| `version`                 | int         | shot 内递增版本。                                                                                                                          |
| `status`                  | enum        | `DRAFT / ACTIVE / APPROVED / STALE / ARCHIVED`。当前 propose 会把旧 ACTIVE 置 STALE。                                                      |
| `prompt_text`             | text        | 给 Ark Seedream 的核心图像提示词。                                                                                                         |
| `negative_prompt`         | text        | 图像负向提示，可为空。                                                                                                                     |
| `reference_asset_ids`     | text[]      | 参与 prompt 的素材 id。                                                                                                                    |
| `prompt_json`             | jsonb       | agent 输出和上下文快照。                                                                                                                   |
| `source_fingerprint`      | jsonb       | 本次 propose 读取的上游 artifact、shot requirement、`image_ref`、反馈重生成的 `feedbackImageRef` 和候选数摘要。                            |
| `prompt_assembly`         | jsonb       | 当前为后端 deterministic assembler metadata，包含 `moduleId/source/mode/assemblerVersion`；历史 agent 版本可能包含 subject/contract hash。 |
| `created_by`              | text        | `system` 或 `user`；反馈重生成写 `user`。                                                                                                  |
| `agent_name`              | text        | 当前为 `DeterministicImagePromptAssembler`。                                                                                               |
| `prompt_template_version` | text        | 当前为 `server-image-prompt-assembler.v1`。                                                                                                |
| `base_artifact_id`        | text        | 派生来源 artifact，可为空。                                                                                                                |
| `created_at`              | timestamptz | 创建时间。                                                                                                                                 |

`prompt_json` 当前包含：

| 字段                    | 来源                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `promptText`            | `StoryboardImagePromptOutputSchema.promptText`。                                                                                                                                                                                                                                           |
| `negativePrompt`        | agent 输出，可为空。                                                                                                                                                                                                                                                                       |
| `visualStyle`           | agent 输出，可为空。                                                                                                                                                                                                                                                                       |
| `composition`           | agent 输出，可为空。                                                                                                                                                                                                                                                                       |
| `lighting`              | agent 输出，可为空。                                                                                                                                                                                                                                                                       |
| `productVisibilityRule` | agent 输出。                                                                                                                                                                                                                                                                               |
| `referenceImageUsage[]` | agent 输出；每项含 `assetId/usage/instruction`。                                                                                                                                                                                                                                           |
| `qualityChecklist[]`    | agent 输出。                                                                                                                                                                                                                                                                               |
| `context`               | server 注入的装配快照，包括 material/brief/shotprompt、镜头目标 `shotGoal`、前后镜、当前/前序候选、`image_ref`、反馈重生成的 `feedbackImageCandidateId/feedbackImageRef`、`candidateCount`、`shotImage`、`shotVideo`、`compiledShotRequirements`、`userDirection`、`assemblerVersion` 等。 |

prompt 装配：

- 主路径：后端 deterministic assembler，不调用二次创意 agent。prompt 第一块是 `storyboard_shots.objective` / approved `shots[].providerPrompt`（镜头目标），第二块是当前 `shot_prompt_requirements.shot_image`，反馈重生成追加 `userDirection` 和参考图规则。

相关 batch：`image_generation_batches`

| 字段                                                                | Prompt 链路含义                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image_prompt_artifact_id`                                          | 绑定本次图像提示 artifact。                                                                                                                                                                                                                                                                                                                                                                                                    |
| `provider`                                                          | 当前为 `ark-seedream`。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `aspect_ratio`                                                      | 生成宽高比。                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `provider_request`                                                  | provider 请求摘要：`prompt/negativePrompt/image_ref/feedbackImageRef/feedbackImageCandidateId/referenceImageOrder/count/aspectRatio/assemblerVersion`。反馈重生成时 `feedbackImageCandidateId` 对应的候选图进入 Seedream 图片输入第一位，本镜图片类素材图随后，上一镜 selected image 最后；视频等非图片素材可出现在 `referenceImageOrder` 的语义记录中，但必须在 provider `referenceImageUrls` 阶段被过滤，不发送给 Seedream。 |
| `idempotency_key`                                                   | propose 内部合成，retry 使用公开请求头。                                                                                                                                                                                                                                                                                                                                                                                       |
| `requested_count/succeeded_count/failed_count/status/error_message` | 生成批次状态。                                                                                                                                                                                                                                                                                                                                                                                                                 |

相关候选：`image_candidates`

| 字段                   | Prompt 链路含义                                |
| ---------------------- | ---------------------------------------------- |
| `batch_id`             | 所属 image batch。                             |
| `image_url`            | 成功后稳定工作区 URL。                         |
| `provider_response`    | provider 返回摘要，含候选 index、临时 URL 等。 |
| `status/error_message` | 候选状态。                                     |

选定结果：`image_select_artifacts`

| 字段                        | Prompt 链路含义                                                  |
| --------------------------- | ---------------------------------------------------------------- |
| `workspace_id`              | 所属 workspace。                                                 |
| `shot_set_id`               | 所属 active shot set；成片时按该实例读取选择。                   |
| `shot_id`                   | 每个 shot 唯一。                                                 |
| `image_candidate_id`        | 当前选定图像。                                                   |
| `image_generation_batch_id` | 选定图像所在 batch。                                             |
| `selected_by/selected_at`   | 选择人和选择时间。                                               |
| `created_at/updated_at`     | 创建和覆盖更新时间。重复选择 UPSERT 覆盖当前行，不删除未选候选。 |

---

## 5. Video Script Artifact

表：`video_script_artifacts`

| 字段                               | 类型        | Prompt 链路含义                                                                                                                                    |
| ---------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                               | text        | 视频脚本 artifact id。                                                                                                                             |
| `shot_id`                          | text        | 所属 shot。                                                                                                                                        |
| `version`                          | int         | shot 内递增版本。                                                                                                                                  |
| `status`                           | enum        | `DRAFT / ACTIVE / APPROVED / STALE / ARCHIVED`。                                                                                                   |
| `duration_sec`                     | int         | 单镜视频时长。真实 Seedance 要求 4-12 秒。                                                                                                         |
| `script_json`                      | jsonb       | deterministic assembler 输出的结构化脚本摘要和上下文快照。                                                                                         |
| `provider_prompt`                  | text        | deterministic assembler 输出的 Seedance 画面/运镜提示主体。真正发给 Seedance 前会经 `buildSeedanceShotVideoPrompt()` 追加旁白音频要求。            |
| `based_on_image_candidate_id`      | text        | 当前 shot 选中图，作为 first frame。                                                                                                               |
| `based_on_prev_image_candidate_id` | text        | 前一镜图像锚点，当前主线通常为空。                                                                                                                 |
| `based_on_next_image_candidate_id` | text        | 下一镜选中图，作为 last frame。                                                                                                                    |
| `source_fingerprint`               | jsonb       | 本次 propose/regenerate 读取的上游 artifact、镜头目标、shot requirement、first/last frame、voiceProfileHash、voiceover、反馈视频候选和候选数摘要。 |
| `prompt_assembly`                  | jsonb       | 当前为后端 deterministic assembler metadata，包含 `moduleId/source/mode/assemblerVersion`；历史 agent 版本可能包含 subject/contract hash。         |
| `created_by`                       | text        | `system` 或 `user`；反馈重生成写 `user`。                                                                                                          |
| `agent_name`                       | text        | 当前为 `DeterministicVideoScriptAssembler`。                                                                                                       |
| `prompt_template_version`          | text        | 当前为 `server-video-script-assembler.v1`。                                                                                                        |
| `base_artifact_id`                 | text        | 派生来源 artifact，可为空。                                                                                                                        |
| `created_at`                       | timestamptz | 创建时间。                                                                                                                                         |

`script_json` 当前包含：

| 字段                     | 来源                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `durationSec`            | server 选择的 shot 时长；server 会按真实 Seedance 约束夹到 4-12 秒范围内。                                 |
| `shotGoal`               | 镜头目标上下文。                                                                                           |
| `startFrameDescription`  | 基于当前 selected image 首帧候选 id 的描述。                                                               |
| `endFrameDescription`    | 基于下一镜 selected image 尾帧候选 id 的描述；末镜自然收束。                                               |
| `continuityWithPrevious` | 当前主线通常为空。                                                                                         |
| `continuityWithNext`     | 下一镜 selected image 候选 id，可为空。                                                                    |
| `cameraMotion`           | 来自 `shotVideo.cameraMotion`。                                                                            |
| `subjectMotion`          | 来自 `shotVideo.subjectMotion`。                                                                           |
| `productVisibility`      | 来自 `shotVideo.productVisibility/productVis`。                                                            |
| `sceneConsistency`       | 来自 `shotVideo.continuity`。                                                                              |
| `voiceover`              | 本镜 approved shotprompt voiceover，可为空。                                                               |
| `onscreenText`           | 当前固定为空；旁白不得复制为画面文字。                                                                     |
| `providerPrompt`         | assembler 输出，复制到表字段 `provider_prompt`。                                                           |
| `negativePrompt`         | 来自 `shotVideo.negative`，可为空。                                                                        |
| `riskNotes[]`            | 当前通常为空。                                                                                             |
| `context`                | server 注入的上下文摘要，包括 material/brief/shotprompt、镜头目标、首尾帧、voice profile、反馈视频候选等。 |

prompt 装配：

- 主路径：后端 deterministic assembler，不调用二次创意 agent。`providerPrompt` 只作为镜头目标上下文，执行约束来自 `shotVideo`、当前 selected image 首帧、下一镜 selected image 尾帧、duration、voiceover 和统一 voice profile。
- provider 请求 prompt：worker 不直接把 `provider_prompt` 原样发给 Seedance，而是调用 `buildSeedanceShotVideoPrompt({ providerPrompt, scriptJson })`。当 `script_json.voiceover` 非空时，会追加中文旁白生成要求；旁白只进入音频，禁止将口播文案、旁白文字或其改写复制、叠加、渲染到视频画面内，不生成字幕样式、标题贴片或乱码文字；同时 `generate_audio` 固定传 `true`。

相关 batch：`video_generation_batches`

| 字段                                                                | Prompt 链路含义                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `video_script_artifact_id`                                          | 绑定本次视频脚本 artifact。                                                                                                                                                                                                                                                                                                                          |
| `provider`                                                          | 当前为 `seedance`。                                                                                                                                                                                                                                                                                                                                  |
| `aspect_ratio`                                                      | 生成宽高比。                                                                                                                                                                                                                                                                                                                                         |
| `provider_request`                                                  | 主线 propose/regenerate 中保存最终 Seedance prompt 摘要、`providerPrompt/firstFrameCandidateId/firstFrameUrl/lastFrameCandidateId/lastFrameUrl/durationSec/count/aspectRatio/voiceover/voiceProfileHash/assemblerVersion`；反馈重生成额外记录 `feedbackVideoCandidateId/feedbackVideoUrl/baseArtifactId/userDirection`。retry 路径当前可能为空对象。 |
| `idempotency_key`                                                   | 主线 propose 当前为空；retry 使用公开请求头。                                                                                                                                                                                                                                                                                                        |
| `requested_count/succeeded_count/failed_count/status/error_message` | 生成批次状态。                                                                                                                                                                                                                                                                                                                                       |

相关候选：`video_candidates`

| 字段                        | Prompt 链路含义                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `batch_id`                  | 所属 video batch。                                                                                                                                                     |
| `video_url`                 | stable 工作区 URL；仅在本地保存完成、候选进入 `SUCCEEDED` 后可用于选择和成片。                                                                                         |
| `thumbnail_url`             | 缩略图 URL，可为空。                                                                                                                                                   |
| `duration_sec/width/height` | provider 返回或后处理得到的媒体元数据。                                                                                                                                |
| `provider_response`         | provider 返回摘要；Seedance 返回临时 mp4 后保存 `providerTemporaryUrl/taskId/providerReadyAt`，供 `video-rounds.previewVideoUrl/providerTaskId/providerReadyAt` 展示。 |
| `status/error_message`      | 候选状态；视频主路径支持 `PERSISTING` 表示 provider 已出片但 stable 工作区保存中。                                                                                     |

选定结果：`video_select_artifacts`

| 字段                        | Prompt 链路含义                                                  |
| --------------------------- | ---------------------------------------------------------------- |
| `workspace_id`              | 所属 workspace。                                                 |
| `shot_set_id`               | 所属 active shot set；final compose 按该实例读取选择。           |
| `shot_id`                   | 每个 shot 唯一。                                                 |
| `video_candidate_id`        | 当前选定视频。                                                   |
| `video_generation_batch_id` | 选定视频所在 batch。                                             |
| `selected_by/selected_at`   | 选择人和选择时间。                                               |
| `created_at/updated_at`     | 创建和覆盖更新时间。重复选择 UPSERT 覆盖当前行，不删除未选候选。 |

---

## 6. Trace 与 Job 关联字段

表：`trace_events`

| 字段                       | Prompt 链路含义                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `workspace_id` / `shot_id` | trace 归属。                                                                         |
| `trace_type`               | `agent_run / provider_call / job_event / state_transition / user_action`。           |
| `name`                     | 事件名，如 `image_prompt_proposed`、`video_script_proposed`。                        |
| `input_preview`            | 输入预览，可为空。                                                                   |
| `output_preview`           | 输出预览，常取 prompt 或 provider prompt 前 200 字。                                 |
| `metadata`                 | prompt template version、context、batch id、candidate ids、frames、provider 信息等。 |

provider 调用审计：`trace_events(trace_type='provider_call')`

- 仅 `MODEL_MODE=real` 时由 image/video worker 写入，mock 模式不创建。
- 每行 metadata 是 `provider_call.v1` 摘要，包含 workspace/shot/job/batch/candidate、attempt、provider/model、media type、status、generated count、latency、error、首尾帧或参考图数量。图片行额外记录 `referenceImageSources` 分类，用于判断参考图来自 data URL、workspace stable 文件、provider temporary URL 或公开 HTTPS。
- metadata 保存 `promptHash`，URL 只保存 host/hash 摘要，不保存 signed URL 或 data URL 原文；写入失败只记录 warn，不会让候选生成失败。
- LOCAL workspace 可额外镜像 `.daireel/trace/provider_call.jsonl` 作为本地调试；S3 workspace 不写 `events.jsonl/provider_call.jsonl`。
- 视频 stable 保存阶段另写 `asset_persist_started/completed/failed` trace event，记录 `candidateId/providerTaskId/bytes/latencyMs/stableUrl/error`，用于区分 provider create+poll 耗时与下载保存耗时。

表：`generation_jobs`

| 字段                                      | Prompt 链路含义                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `job_type`                                | `generate_image_candidate / generate_images / advance_shot_image_auto_selection / generate_videos / compose_final_video / advance_one_click_final_video`。 |
| `related_batch_type` / `related_batch_id` | 关联 candidate、batch 或 final job。                                                                                                                       |
| `payload`                                 | worker payload，包含 prompt artifact id、batch id、shot/workspace id、aspectRatio、referenceImageUrls 等。                                                 |
| `error_message`                           | worker 失败原因。                                                                                                                                          |

表：`one_click_final_video_jobs`

| 字段                                         | Prompt 链路含义                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `status/current_stage/stage_state`           | 一键编排进度；`WAITING` 表示等待候选生成、stable 保存或 final compose 完成后重入。前端从该事实派生 10/20/30/40、image 40-65、video 65-90、final 95、completed 100 的进度展示。 |
| `material_intake_artifact_id` 等 artifact id | 记录自动批准/应用过程中创建或使用的中间产物。                                      |
| `auto_selection_strategy`                    | 当前固定为 `first_success`。                                                       |
| `final_video_job_id`                         | 进入 final compose 后关联最终成片任务。                                            |
| `idempotency_key`                            | `POST /one-click-final-videos` 的幂等键。                                          |

表：`shot_image_auto_selection_jobs`

| 字段                               | Prompt 链路含义                                               |
| ---------------------------------- | ------------------------------------------------------------- |
| `status/current_stage/stage_state` | 独立选图编排进度；`WAITING` 表示等待 image batch 终态后重入。 |
| `shot_set_id`                      | 任务启动时绑定的 active shot set。                            |
| `candidate_count`                  | 本次为未选 shot 创建 image batch 时使用的候选数量。           |
| `auto_selection_strategy`          | 当前固定为 `first_success`。                                  |
| `idempotency_key`                  | `POST /shot-image-auto-selections` 的幂等键。                 |

---

## 7. 当前缺口

- `prompt_requirements_artifacts` 已能保存用户创作要求；当前 material-intake / product-brief / storyboard 只把 requirements 作为依赖门槛与 `source_fingerprint` 记录，尚未把 requirements data 系统展开到这三个 module 的 runtime context。shotprompt 会把已批准 7 项创作要求格式化注入 Runtime Context 顶部，但不做输出后处理。逐 shot 阶段由后端 deterministic assembler 读取镜头目标、`shotImage` / `shotVideo`、素材图、首尾帧和用户反馈。
- Workspace module 的完整 assembled prompt 写 trace，artifact 只保存模板 id/hash 与 preview；逐 shot image/video artifact 持久化最终 prompt 主体，并在 batch `provider_request` 中记录 provider 请求摘要。
- 旧 V1 workspace 静态 builder endpoints 与 `shotprompt approve` delete/reseed 主链路已下线；状态摘要改读 module-owned artifact tables。
