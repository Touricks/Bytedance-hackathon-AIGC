# prompt_workflow — Prompt 组装流程与 Artifact 流通

更新时间：2026-06-06

本文记录当前版本 prompt 的实际组装方式，以及 workspace module、shot set、per-shot artifact 之间的流通。字段、表结构、状态锚点和 provider 生成记录见 [`prompt_artifact.md`](./prompt_artifact.md)。

---

## 1. 组装原语

所有带 subject/contract 的 workspace module 都通过 `packages/ai/src/prompts/module-prompt-assembler.ts` 拼装：

```text
## Subject Prompt
<packages/ai/src/prompts/modules/<module>/subject.md>

## Runtime Context
<server 或 agent 注入的业务上下文>

## Schema Contract
<packages/ai/src/prompts/modules/<module>/contract.md>
```

模板目录形态：

```text
packages/ai/src/prompts/modules/<module>/
├── subject.md
└── contract.md
```

`subject.md` 是业务主体 prompt，允许迭代创作策略、风格偏好、镜头语言和素材使用方式。`contract.md` 是工程契约，描述输入 JSON、输出 schema、字段语义、provider 硬约束和禁止项。中心 assembler 只负责拼接三段内容，并生成 `prompt_assembly` metadata：

| 字段                 | 含义                            |
| -------------------- | ------------------------------- |
| `moduleId`           | prompt module id。              |
| `assemblerVersion`   | 当前为 `v2`。                   |
| `subjectTemplateId`  | 例如 `shotprompt/subject.md`。  |
| `contractTemplateId` | 例如 `shotprompt/contract.md`。 |
| `subjectHash`        | subject 模板 SHA-256。          |
| `contractHash`       | contract 模板 SHA-256。         |

完整 assembled prompt 不持久化到 workspace module artifact 表；真实 provider 调用前后的 prompt/request/response 摘要通过 trace 写入 `trace_events`。LOCAL workspace 可镜像 `.daireel/trace/events.jsonl` 与 `.daireel/trace/provider_call.jsonl` 作为本地调试；S3 workspace 不写 JSONL mirror。真实 image/video provider 调用的 `trace_events` metadata 保存 `promptHash`、provider/model、attempt、candidate、latency、错误、图片参考图来源分类和 URL 摘要（host/hash，不保存 signed URL 或 data URL 原文）；写入失败不影响候选生成。artifact 表只保存 `prompt_assembly`、`source_fingerprint` 和结构化结果；逐 shot image/video artifact 持久化最终 provider-facing prompt 主体。

逐 shot `image-prompt` / `video-script` 主路径不走 subject/contract 二次 agent。后端 deterministic assembler 写入的 `prompt_assembly` 只要求：

| 字段               | 含义                                      |
| ------------------ | ----------------------------------------- |
| `moduleId`         | `image-prompt` 或 `video-script`。        |
| `assemblerVersion` | 对应 server assembler 常量版本。          |
| `source`           | `server-deterministic-assembler`。        |
| `mode`             | `propose` 或 `user-feedback-regenerate`。 |

---

## 2. 当前主链路

```text
prompt-requirements approve
  -> material-intake propose / approve
  -> product-brief propose / approve
  -> storyboard propose / approve
  -> shotprompt propose / approve
  -> shot-set apply
  -> per shot image-prompt propose
  -> image generation batch
  -> image-select
     or shot-image-auto-selection
  -> per shot video-script propose
  -> video generation batch
  -> video-select
  -> final compose
```

一键成片入口从素材解读审核页独立启动，起点是请求里的 `materialIntake.data` 草稿。后端先调用 material-intake approve，把这份草稿变成 current，再自动执行后续 workspace module 的 propose/approve、shot-set apply、逐 shot image/video 生成与选择、final compose。它不新增 prompt 模板或新的下游读取规则，只是把现有节点按相同契约串行编排。当前一键成片自动生成每镜固定传 `candidateCount=1`，沿用 `first_success` 选择策略；前端进度条只从 job `currentStage/stageState` 和分镜数量派生，活跃任务由 workbench viewmodel 5 秒轮询。

分镜图选择页的“批量生成并选择分镜图”也是独立 orchestrator，但只处理当前 active shot set 的图像侧。它跳过已有 selected image 的 shot，为未选 shot 生成 image batch，并在 batch 终态后选择首个 `SUCCEEDED` 且已有 stable URL 的候选；它不生成分镜视频，不触发 final compose，也不创建新的 prompt artifact 类型。

核心规则：

- 下游只读取 `approved/current` 的 workspace module artifact，不读取 latest proposed。
- `source_fingerprint` 记录本次生成读取的上游 artifact id，用于 `upstreamChanged` / redo handoff；它不会自动删除下游候选、选择或成片。
- `shotprompt approve` 只产生 current approved artifact，不创建 `storyboard_shots`；只有 `POST /api/workspaces/:workspaceId/shot-sets` 会创建 active shot set。
- `candidateCount` 是本次生成/重生成的操作参数；服务端按默认值和最大值裁定，前端只保存 workspace 级 UI 偏好，不把候选数量写入创作要求或 prompt artifact。一键成片内部自动生成固定为每镜 1 个图像候选和 1 个视频候选。
- `prompt_requirements_artifacts.data` 当前对 material-intake / product-brief / storyboard 主要是依赖门槛和 source fingerprint；shotprompt 会把 current approved requirements data 中的 7 项创作要求格式化注入 Runtime Context 顶部，作为分镜生成要求的导演约束输入。
- material-intake 的 strict JSON schema 调用保持纯文本 runtime context，只使用素材 metadata、文本预览和用户字段。product-brief 在真实模式下会把 primary material image 以 `image_url` 形式附给多模态 Ark text provider，用于识别图片中的真实商品/服务信息。
- 逐 shot 阶段不再直接读取原始 requirements data，而是读取 approved shotprompt 中的 `shotImage` / `shotVideo` dict，这两个 dict 经 `shot_prompt_requirements` 进入 image-prompt / video-script。

---

## 3. Workspace Module 流通

| 节点                           | 读取                                                                                                                                                               | Prompt 组装 / Runtime Context                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 写入                                                                                                                                                                                                       | 下游                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `prompt-requirements`          | 用户提交的结构化创作要求。参考视频导入由模型推荐主因子，再由后端确定性编译 proposed artifact。                                                                     | 手动提交不调用 text provider；参考视频导入只在推荐因子阶段调用 text provider。approve 时记录 `prompt-requirements` 的 assembly metadata。                                                                                                                                                                                                                                                                                                                                                | `prompt_requirements_artifacts.data`。                                                                                                                                                                     | 作为后续 workspace module 的 current requirement id 和 fingerprint。 |
| `material-intake`              | current prompt requirements、workspace 扫描素材、文本预览、被拒绝文件。                                                                                            | `material-intake/subject.md` + runtime context：`initialPrompt`、`scanned.assets`、`scanned.rejected`、`textPreviews` + `material-intake/contract.md`。真实 Ark text 请求默认纯文本，不附图片 `data_url`。                                                                                                                                                                                                                                                                               | `material_intake_artifacts.data`：`primaryProductRef`、`assets[]`、`rejected[]`。                                                                                                                          | product-brief、storyboard、shotprompt、image-prompt。                |
| `product-brief`                | current prompt requirements、current material-intake、请求内联表单字段、商品卖点审核页当前草稿 `draft`、商家自然语言方向 `userDirection`、primary material image。 | `product-brief/subject.md` + runtime context：`userDirection`、`title/sellingPoints/audience/stylePreference` 可选表单 seed、当前商品卖点草稿、`primaryProductRef`、`material.assets[]` + `product-brief/contract.md`。真实 Ark text 请求包含 primary image `image_url`，让 brief 基于图片事实识别商品/服务；带 draft 时进入“调整商品卖点”模式，商家 `userDirection` 优先于旧草稿。若商家改商品主体、品类、服务类型、目标人群或卖点重点，prompt 要求重写受影响字段，不能原样返回旧草稿。 | `product_brief_artifacts.data`：商品、人群、核心卖点、证据、offer、platform、brandTone、landingInfo、assumptions。带 draft 的重生成仍只写 proposed row，不修改 current。                                   | storyboard、shotprompt、image-prompt、video-script。                 |
| `storyboard`                   | current prompt requirements、current material-intake、current product-brief。                                                                                      | `storyboard/subject.md` + runtime context：approved brief、`material.assets[]` + `storyboard/contract.md`。                                                                                                                                                                                                                                                                                                                                                                              | `storyboard_artifacts.data`：`narrative`、`totalDurationSec`、`shots[]`。每个 shot 含 `index/purpose/durationSec/scene/visualDirection/productAssetRef/voiceover/transition`。                             | shotprompt。                                                         |
| `storyboard voiceover rewrite` | 请求内当前 15 秒三镜 storyboard draft、current material-intake、current product-brief。                                                                            | 复用 storyboard contract，runtime context 明确只重写 `shots[].voiceover`，并要求每段有效字数不超过 `durationSec * 5`。                                                                                                                                                                                                                                                                                                                                                                   | 新的 `storyboard_artifacts` proposed row；`source_fingerprint.rewriteKind = "voiceover"`，`baseStoryboardArtifactId` 指向来源 artifact。                                                                   | storyboard approve。                                                 |
| `shotprompt`                   | current prompt requirements、current material-intake、current product-brief、current storyboard、请求 `aspectRatio`。                                              | `shotprompt/subject.md` + runtime context：顶部先注入已批准 7 项创作要求（导演约束），再注入 `aspectRatio`、必须输出的 shot 数量、必须输出的 storyboard index 顺序、approved brief、`material.assets[]`、approved storyboard + `shotprompt/contract.md`。response format 同步使用 expected shot count，并要求 `tts.voiceProfile` 明确全片统一说话人性别、语气、声调和语速。                                                                                                              | `shot_prompt_artifacts.data`：全局 `prompt/negativePrompt/aspectRatio/tts`，其中 `tts.voiceProfile` 是全片口播声音策略；以及逐 shot 的 `providerPrompt/referenceAssetRefs/voiceover/shotImage/shotVideo`。 | shot-set apply。                                                     |

首屏创作因子在 `prompt_requirements_artifacts.data` 中以 `creativeFactors/factorGuidance/scriptInfluence` 保存，并编译为现有 7 项创作要求。各 agent 模块仍消费 approved/current prompt requirements 中的 7 项导演约束；`compiledRequirementSourceMap` 和 `creativeRequirementTemplate` 用于前端解释、刷新恢复和成片看板标签，不直接作为 provider-facing prompt 文案拼装入口。

### 3.1 Shotprompt 不变量

`shot_prompt_artifacts.data.shots[]` 必须基于 P0 15 秒三镜 approved storyboard 生成，并与该 storyboard 的 `shots[]` 数量、顺序和 `index` 完全一致，不得省略、合并、拆分或新增镜头。每个 shot 必须包含：

- `providerPrompt`：镜头叙事和语境锚点，不是最终 image prompt 或 video provider prompt。
- `shotImage`：静态关键帧要求，进入 image-prompt deterministic assembler。
- `shotVideo`：动态运动 / 首末帧 / 运镜要求，进入 video-script deterministic assembler。
- `voiceover`：从 storyboard 继承的本镜口播，进入 video-script 和 Seedance 音频块。
- `tts.voiceProfile`：全片统一旁白声音策略，包含 `gender`、`tone`、`pitch`、`pace`；video-script 和最终 Seedance prompt 都读取该策略，保证三段视频口播听感一致。

校验边界：

- `generateShotPromptWithArk` parse 后校验 provider 输出。
- `shotPromptV2Service.propose` / `approve` 先校验 current approved storyboard 满足 P0 三镜脚本规则，再校验 proposed 或 inline approve 数据。
- `shotSetService.apply` 在创建 active shot set 前再次校验 current approved storyboard 与 approved shotprompt；若上游仍是旧 4 镜/非 P0 storyboard，返回 `UPSTREAM_STORYBOARD_NOT_P0`。
- `storyboard/voiceover/propose` 只产生 proposed storyboard artifact。前端在请求 pending 期间不能用本地压缩稿替换 UI；只能显示按钮 loading，等待真实 proposed 返回后再渲染新口播。

---

## 4. Shot Set Apply

`POST /api/workspaces/:workspaceId/shot-sets` 不调用模型 prompt。它读取 current 或指定 approved `shot_prompt_artifacts.data`，创建新的 active shot set，并把逐镜要求拆成执行锚点：

| 写入                                    | 来源                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `shot_sets.source_fingerprint`          | approved shotprompt 的 source fingerprint + `shotPromptArtifactId`。                               |
| `storyboard_shots.order_index`          | `shots[]` 数组位置；server 归一为 0-based 工作流顺序，不直接复用 provider-facing `shots[].index`。 |
| `storyboard_shots.objective/title`      | `shots[].providerPrompt`。                                                                         |
| `storyboard_shots.default_duration_sec` | `shots[].endSec - shots[].startSec`。                                                              |
| `shot_prompt_requirements.shot_image`   | `shots[].shotImage`。                                                                              |
| `shot_prompt_requirements.shot_video`   | `shots[].shotVideo`。                                                                              |
| `shot_asset_refs`                       | `shots[].referenceAssetRefs` 解析出的素材关联。                                                    |

旧 active shot set 会归档，但旧候选、旧选择和旧成片不会被物理删除；归档实例不提供商家工作台读取或操作入口。

---

## 5. Per-Shot Prompt 流通

### 5.1 Image Prompt

触发：`POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose`

主路径不再调用图像 prompt 二次创意 agent，而由后端 deterministic assembler 按固定模板拼接镜头目标、`shotImage`、本轮反馈和参考图规则：

| 输入                                | 来源                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `productBrief`                      | current approved product brief。                                                                                               |
| `materialIntake`                    | current approved material intake。                                                                                             |
| `shot.providerPromptFromShotPrompt` | active shot set 对应的 approved shotprompt shot；作为 prompt 第一块“镜头目标”。                                                |
| `shot.shotImage`                    | `shot_prompt_requirements.shot_image`；作为 prompt 第二块“分镜图要求”。                                                        |
| `image_ref`                         | 首镜为主商品素材；后续镜头为上一镜 selected image。                                                                            |
| `feedbackImageRef`                  | 仅反馈重生成时注入；来自 `feedbackImageCandidateId` 指向的最新轮成功候选，用作“基于这张图修改”的视觉基准。                     |
| `referenceAssets[]`                 | `shot_asset_refs`。其中视频素材可作为 prompt 语义参考保留，但在未做关键帧/海报帧提取前，不得作为 Seedream `image` 参考图输入。 |
| `previousImagePromptText`           | 同 shot 上一版 image prompt，可为空。                                                                                          |
| `userDirection` / `candidateCount`  | 请求内联编辑方向和候选数量。                                                                                                   |

输出写入 `image_prompt_artifacts.prompt_text/negative_prompt/prompt_json`，并创建 `image_generation_batches`。主路径不再调用 image-prompt 二次创意 agent，而由后端 deterministic assembler 按固定模板拼接镜头目标、`shotImage`、本轮反馈和参考图规则。`promptText` 只描述静态关键帧；不得写相机运动、主体运动、时长、首末帧、转场、旁白或字幕。Seedream provider request 使用 `promptText`、`negativePrompt`、`referenceImageUrls`、`count`、`aspectRatio`；其中 `referenceImageUrls` 必须经过图片类型过滤，只包含图片 data URL、workspace 图片文件、公开图片 URL 或已生成分镜图，不能包含 `.mp4` 等视频素材字节。

用户反馈重生成走 `image-prompts/regenerate`；请求必须包含 `baseArtifactId`、`feedbackImageCandidateId`、非空 `userDirection`。`feedbackImageCandidateId` 必须属于当前 shot 最新 image round 的成功候选。服务端基于当前镜头目标、`shotImage`、反馈候选图和 `userDirection` 创建一版 user artifact 和新 image batch，保留当前 `selected_image_id`。本轮 Seedream 图片输入顺序固定为：反馈候选图、本镜图片类 `referenceAssetRefs` 素材图、上一镜 selected image；非图片素材只保留在 prompt/context 中，不进入 provider `image` 字段。

### 5.2 Video Script

触发：`POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose`

主路径不再调用视频脚本二次创意 agent，而由后端 deterministic assembler 按固定模板拼接镜头目标上下文、`shotVideo`、首尾帧、duration、voiceover、voice profile 和 provider 规则。当前要求 active shot set 下所有 shots 都已有 selected image 后，才允许进入 video-script。

| 输入                                | 来源                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `productBrief`                      | current approved product brief。                                           |
| `shot.providerPromptFromShotPrompt` | active shot set 对应的 approved shotprompt shot。                          |
| `shot.shotVideo`                    | `shot_prompt_requirements.shot_video`。                                    |
| `shot.voiceover`                    | approved shotprompt shot voiceover。                                       |
| `shot.voiceProfile`                 | approved shotprompt `tts.voiceProfile`。                                   |
| `first_frame_url`                   | 本 shot selected image。                                                   |
| `last_frame_url`                    | 下一 shot selected image；末镜可为空。                                     |
| `durationSec`                       | `storyboard_shots.default_duration_sec`，server 夹到 Seedance 可接受范围。 |
| `neighborImages`                    | active shot set 内相邻选择图。                                             |
| `previousVideoScript`               | 同 shot 上一版 video script，可为空。                                      |
| `userDirection` / `candidateCount`  | 请求内联编辑方向和候选数量。                                               |

输出写入 `video_script_artifacts.script_json/provider_prompt`，并创建 `video_generation_batches`。worker 发 Seedance 前不会直接裸用 `provider_prompt`，而是通过 `buildSeedanceShotVideoPrompt()` 追加 approved shotprompt 的 `tts.voiceProfile`、本镜口播、`generate_audio=true` 语义和“旁白只进音频，禁止将口播文案/旁白文字复制到视频画面内”约束；Seedance 请求体也固定传 `generate_audio: true`。`video_script_artifacts.source_fingerprint` 同步记录 `voiceProfileHash`，用于声音策略变化后的上游变化提示。

用户反馈重生成走 `video-scripts/regenerate`；请求必须包含 `baseArtifactId`、`feedbackVideoCandidateId`、非空 `userDirection`。`feedbackVideoCandidateId` 必须属于当前 shot 最新 video round 的成功候选。由于当前 Seedance 主路径使用首尾帧图生视频，反馈视频候选只作为反馈对象写入 `source_fingerprint`、`provider_request` 和 trace，不作为 provider 视频输入；旧 `selected_video_id` 保留，只有用户重新选择候选后才更新。

---

## 6. 选择与成片

| 节点            | Prompt 行为                    | Artifact 行为                                                                                                                                                                   |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image-select`  | 不调用模型。                   | UPSERT `image_select_artifacts`，并更新 `storyboard_shots.selected_image_id`；不删除未选候选。                                                                                  |
| `video-select`  | 不调用模型。                   | UPSERT `video_select_artifacts`，并更新 `storyboard_shots.selected_video_id`；不删除未选候选。                                                                                  |
| `final compose` | 不调用 LLM / provider prompt。 | 读取 active shot set 下每个 shot 的 selected video，通过 workspace storage adapter 下载输入到临时目录；用 ffmpeg concat 成片后写回 workspace storage，并写 `final_video_jobs`。 |

自动选择的 prompt 行为仍是“不调用模型”。一键成片的 image/video select 只选择首个 `SUCCEEDED` 且已有 stable URL 的候选，写 `selected_by='system:auto-one-click'`；它发起的 image/video 生成每镜固定 `candidateCount=1`。独立分镜图自动选择只写 image selection，`selected_by='system:auto-shot-image-selection'`。视频候选处于 `PERSISTING` 时继续等待；终态没有成功候选时，对应 orchestrator 任务失败并保留所有已生成中间产物。

旧 whole-video export prompt builder 已清理；当前成片阶段不调用 LLM 或 provider prompt，只读取已选分镜视频并用 ffmpeg 拼接。

---

## 7. 调试入口

- assembled prompt / provider request：查 `trace_events`；LOCAL workspace 可辅以 `.daireel/trace/events.jsonl`。真实 provider 调用审计查 `trace_events(trace_type='provider_call')`；LOCAL workspace 可辅以 `.daireel/trace/provider_call.jsonl`。
- artifact 元数据：查各 artifact 表的 `prompt_assembly`、`source_fingerprint`、`data`。
- 上游漂移：看 `shot-workflow-status`、`image-rounds`、`video-rounds` 返回的 `upstream` / `upstreamChanged`。
- shotprompt 数量塌缩：优先核对 `storyboard_artifacts.data.shots[]`、`shot_prompt_artifacts.data.shots[]`、provider response format 的 expected shot count，以及 propose/approve/apply 边界校验。
