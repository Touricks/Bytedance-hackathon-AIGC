# arc_v3 — V3 多因子创作链路架构目标

> 电商 AIGC 短视频生成系统（`ecommerce-aigc-video`）的 V3 目标架构。本文以 V2 模块化链路为基座，补充多因子创作要求的导入、编译、成片快照与数据看板消费。
>
> 术语遵循 `CONTEXT.md`：创作工作目录、创作要求、待审创作产物、生效创作产物、上游变更提示、分镜链路实例、分镜图选择、分镜视频选择。

---

## 1. 一句话定位

商家选择或导入多因子创作要求 → 上传商品素材 → 模块化 AI 链路生成并批准生效创作产物 → 显式应用 shot prompt 创建分镜链路实例 → 手动逐分镜或批量生成并选择分镜图 → 逐分镜生成候选视频并选择当前结果 → ffmpeg 拼接成片 → 发布记录携带创作标签进入数据看板。

V3 沿用 V2 的模块化 artifact 链路，并新增多因子创作要求与看板标签闭环：

- 每个 prompt module 拥有自己的 artifact 表，`workspace_artifact` 退出主链路。
- 用户编辑的是结构化**创作要求**，不是 raw prompt 或 system prompt。
- 创作要求以 `商品/服务类型 + 适用人群 + 推销手法` 三项作为看板主聚合标签，另保留 `visualStyle` 视觉风格控制；三项主标签展开为 9 个可编辑细分字段，再编译为 7 项下游 prompt 要求。
- 参考视频导入可以通过模型推荐主因子组合，并写入 recoverable proposed `prompt_requirements_artifacts`。
- prompt 模板分离为主体 prompt 与契约/schema prompt，并由 assembler 组装。
- module artifact 物理 append，业务上只暴露当前生效内容。
- 上游变更不自动 reset 下游，只产生**上游变更提示**。
- `shotprompt approve` 不再删除并重建 shots；必须显式创建新的**分镜链路实例**。
- 成片创建时快照当时的 `creativeFactors` 与模板来源，发布记录复制该快照供数据看板聚合；看板 P0 主聚合只读 `productType/audience/strategy`，不把 `visualStyle` 当作主维度。
- 图像/视频候选数量是每次生成/重生成的操作参数，受服务端默认值和最大值限制，不写入创作要求 artifact。
- 一键成片自动生成每镜固定请求 1 个图像候选和 1 个视频候选，仍沿用 `first_success` 选择策略；手动生成继续使用用户候选数量偏好和服务端默认/最大值。
- 创作审核台各模块不展示 artifact current/proposed 标签；P2-P9 主标题下方只展示业务标题，不展示开发脚手架说明或模块解释。

技术基座仍是 **Fastify 5 + Zod + BullMQ + 原生 `pg` + ffmpeg**，AI 调用走火山引擎 **Ark 文本 / Seedream 图像** 与 **Seedance 视频**。

---

## 2. 仓库拓扑

pnpm workspace + Turbo：

```
Bytedancehack/
├── apps/
│   ├── server/                # Fastify API + BullMQ worker + Postgres + 本地文件落盘
│   └── web/                   # React/Vite 前端
├── packages/
│   ├── ai/                    # provider、agent/workflow、prompt assembly
│   ├── shared/                # zod 契约、领域类型、job payload 类型
│   └── config/                # lint/format/tsconfig 预设
├── docs/
│   ├── core/                  # 架构、ERD、接口、OpenAPI
│   └── plan/                  # 迁移计划
├── test/
│   └── postman/               # Postman collections、env/data 与测试计划
├── scripts/                   # reset/dev/test orchestration
└── CONTEXT.md                 # 领域语言
```

依赖方向：

```
shared  ──────────────► zod
ai      ──────────────► shared, openai, zod
web     ──────────────► shared
server  ──────────────► shared, ai
```

---

## 3. Module Graph

V3 把链路显式拆成 prompt modules、同步点 modules 与看板消费节点。

| 类型        | Module          | 输出                                                                          |
| ----------- | --------------- | ----------------------------------------------------------------------------- |
| Form/Import | prompt-requirements | 生效/待审创作要求 artifact，含 `creativeFactors`、9 个细分字段和 7 项编译字段 |
| LLM         | material-intake | 生效/待审素材解读 artifact                                                    |
| LLM         | product-brief   | 生效/待审商品 brief artifact                                                  |
| LLM         | storyboard      | 生效/待审 storyboard artifact                                                 |
| LLM         | shotprompt      | 生效/待审 shot prompt artifact，含每个 shot 的 `shotImage` / `shotVideo` dict |
| Apply       | shot-set        | 根据生效 shot prompt 创建分镜链路实例                                         |
| LLM + Media | image-prompt    | per-shot 图像 prompt artifact + image candidates                              |
| Sync        | image-select    | per-shot 当前分镜图选择                                                       |
| Orchestrate | shot-image-auto-selection | 按 active shot set 顺序批量生成未选分镜图，并写入 `first_success` image selection |
| LLM + Media | video-script    | per-shot 视频脚本 artifact + video candidates                                 |
| Sync        | video-select    | per-shot 当前分镜视频选择                                                     |
| Media       | final-compose   | 按当前分镜视频选择拼接成片                                                    |
| Sync        | campaign-publication | 发布记录，复制成片 `creativeTags` 供数据看板消费                              |
| Orchestrate | one-click-final-video | 从素材解读草稿自动批准并推进到成片；保留各模块原有 artifact/selection/job 事实 |

主流程：

```
prompt-requirements
  -> material-intake
  -> product-brief
  -> storyboard
  -> shotprompt
  -> apply shot-set
  -> image-prompt -> image-select
     or shot-image-auto-selection
  -> video-script -> video-select
  -> final-compose
  -> campaign-publication
```

素材解读页另有独立入口“全自动一键成片”。它不复用前端手动审核 mutation，而是调用一键成片 API；后端以请求中的素材解读草稿为起点，先批准 material-intake，再按上图顺序自动 propose/approve、apply、每镜生成 1 个候选、选择首个成功候选并创建成片任务。手动按钮“批准素材解读并生成商品卖点”语义不变。前端在素材解读页与生成成片页共用一键成片进度条，进度由 `currentStage/stageState` 和分镜数量派生，活跃任务 5 秒轮询，空闲任务 15 秒轮询；进度条组件自身不发请求。

分镜图选择页另有独立入口“批量生成并选择分镜图”。它只处理当前 active shot set 的图像侧：已有 selected image 的 shot 会跳过，未选 shot 生成 image batch，batch 完成后选择首个 `SUCCEEDED` 且已有 stable URL 的候选。该任务不生成分镜视频，不触发 final compose，也不写创作要求 artifact。

---

## 4. Module-Owned Artifact Tables

V3 不再用 `workspace_artifact(type, data)` 承载主链路。每个 module 有自己的表和 schema。

| Module           | 目标表                                          | 保存策略                                                     |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| 创作要求         | `prompt_requirements_artifacts`                 | proposed 可覆盖；approved append；业务只读 current approved。 |
| material-intake  | `material_intake_artifacts`                     | append；业务只读 current approved，UI 可读 latest proposed。 |
| product-brief    | `product_brief_artifacts`                       | append；业务只读 current approved，UI 可读 latest proposed。 |
| storyboard       | `storyboard_artifacts`                          | append；业务只读 current approved，UI 可读 latest proposed。 |
| shotprompt       | `shot_prompt_artifacts`                         | append；业务只读 current approved，UI 可读 latest proposed。 |
| shot-set         | `shot_sets` + `storyboard_shots`                | active/archived 分镜链路实例；不物理删除旧实例。             |
| image-prompt     | `image_prompt_artifacts`                        | per-shot propose round；保留生成事实。                       |
| image generation | `image_generation_batches` + `image_candidates` | per-round 候选事实。                                         |
| image-select     | `image_select_artifacts`                        | 每 shot current-only；UPSERT 覆盖当前选择。                  |
| shot-image-auto-selection | `shot_image_auto_selection_jobs`         | 独立选图 orchestrator job；同一 workspace 同时最多一个运行中任务。 |
| video-script     | `video_script_artifacts`                        | per-shot propose round；保留生成事实。                       |
| video generation | `video_generation_batches` + `video_candidates` | per-round 候选事实；视频候选可处于 provider 已出片但 stable 保存中的 `PERSISTING`。 |
| video-select     | `video_select_artifacts`                        | 每 shot current-only；UPSERT 覆盖当前选择。                  |
| final-compose    | `final_video_jobs`                              | 每次 compose 一条 job。                                      |
| dashboard-video  | `dashboard_video_artifacts`                     | 导入数据面板的视频 metadata 与成片生成因子快照。             |
| campaign         | `campaign_publications` + `campaign_publication_metrics` | 发布记录复制成片创作标签，指标只绑定 publication。 |
| one-click-final-video | `one_click_final_video_jobs`               | 每次一键成片一条 orchestrator job；同一 workspace 同时最多一个运行中任务。 |

### 4.1 Workspace Module Artifact 通用字段

workspace 级 LLM module 表采用相同生命周期字段：

```text
id
workspace_id
status              proposed | approved | archived
is_current          boolean
data                jsonb
source_fingerprint  jsonb
prompt_assembly     jsonb
created_at
approved_at
```

约束：

- 只有 `status='approved'` 的 row 可以 `is_current=true`。
- 每个 workspace/module 最多一条 current approved row。
- `propose` 插入 `status='proposed'` row，不成为下游 current input。
- `approve` 插入新的 `status='approved', is_current=true` row，并把旧 current approved 置为 `is_current=false`。
- 业务/API 语义是“新 approved 覆盖旧 approved”；DB 物理上 append 保留事实，产品上不提供版本追踪和回滚。
- approved artifact 不原地编辑；前端 Edit 只是把当前生效内容带回表单，再由后端 `propose/approve` 产生新 row。

### 4.2 Prompt Assembly Metadata

主 artifact 表只保存 prompt assembly 元数据和预览，不保存完整 final prompt：

```json
{
  "moduleId": "product-brief",
  "assemblerVersion": "v2",
  "subjectTemplateId": "product-brief/subject.md",
  "contractTemplateId": "product-brief/contract.md",
  "subjectHash": "sha256...",
  "contractHash": "sha256...",
  "requirementArtifactId": "prompt_requirements_artifact_id",
  "preview": "短摘要"
}
```

完整 assembled prompt 写入 `trace_events.metadata.finalPrompt`，用于调试和真实 provider 追溯。LOCAL workspace 可镜像到 `.daireel/trace/events.jsonl`；S3 workspace 不写 JSONL mirror。真实 image/video provider 调用写 `trace_events(trace_type='provider_call')`；LOCAL workspace 额外镜像 `.daireel/trace/provider_call.jsonl`。事件 schema 为 `provider_call.v1`，记录 job/batch/candidate/attempt、provider/model、media type、latency、generated count、错误、首尾帧或参考图数量、图片参考图来源分类、`promptHash` 和 URL 摘要（host/hash，不保存 signed URL 或 data URL 原文）。图片 provider transport 错误会保留脱敏 endpoint 与底层 cause 摘要；视频 provider 成功行在 Seedance 返回临时 mp4 URL 时写入，`stableUrl=null`，后续 stable 保存耗时由 `asset_persist_started/completed/failed` trace event 表达。写入失败只记录 warn，不阻塞候选生成。

逐 shot `image_prompt_artifacts` / `video_script_artifacts` 不保存 subject/contract template id；它们的 `prompt_assembly` 记录 `moduleId`、`assemblerVersion`、`source: "server-deterministic-assembler"` 和 `mode`。

---

## 5. 主体 Prompt 与 Contract Prompt 分离

每个 LLM module 的 prompt 模板文件化管理：

```
packages/ai/src/prompts/modules/<module>/
├── subject.md       # 主体创作任务：模块要创作什么
└── contract.md      # 输入 artifact、输出 schema、JSON 格式、provider/safety 硬约束
```

当前集中式 assembler 位于 `packages/ai/src/prompts/module-prompt-assembler.ts`，负责读取对应 module 的 `subject.md` / `contract.md`，再拼入创作要求与运行时上下文。

边界：

- `subject.md` 描述创作目标、风格和业务策略，可由 prompt 设计同学迭代。
- `contract.md` 描述可见输入、必须输出的 schema、字段语义、JSON 格式、provider 限制，系统锁定，用户不可覆盖。
- `module-prompt-assembler.ts` 合并主体 prompt、契约 prompt、创作要求和运行时上下文，输出 `PromptAssemblyResult`。
- 用户的创作要求只进入可控 slot，不替换 system prompt，也不改 input/output schema。

### 5.1 Prompt 修改归属

业务或剧本同学要自定义“主体生成 prompt”时，只改对应 module 的 `subject.md`：

| 业务目标                            | 修改文件                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| 素材清点/标签策略                   | `packages/ai/src/prompts/modules/material-intake/subject.md` |
| 商品 brief 写法                     | `packages/ai/src/prompts/modules/product-brief/subject.md`   |
| 分镜叙事/节奏                       | `packages/ai/src/prompts/modules/storyboard/subject.md`      |
| 主剧本 / shotprompt 生成            | `packages/ai/src/prompts/modules/shotprompt/subject.md`      |
| 单个 shot 的分镜图 / 视频 prompt    | `apps/server/src/modules/shot/prompt-assembler.ts`           |

`contract.md` 属于工程契约：只在输入 artifact、输出 schema、JSON 格式、provider 限制发生变化时由工程侧修改。业务自定义不应修改 `contract.md`，否则会改变 agent 可见输入和输出结构。

每次 subject/contract 内容变化都会反映到对应 artifact 的 `prompt_assembly.subjectHash` / `contractHash`，完整 assembled prompt 继续写入 trace，便于回放本次生成到底使用了哪个模板版本。

组装顺序：

1. module identity 和 prompt version。
2. locked input artifact guide。
3. locked output schema guide。
4. locked provider constraints。
5. subject prompt。
6. workspace 创作要求。
7. shot 级 `shotImage` / `shotVideo` 要求。
8. request inline `userDirection` / `customRequirements`。
9. runtime context。

---

## 6. 创作要求与 Shot Requirements

workspace 级创作要求保存在 `prompt_requirements_artifacts`，作为当前生效要求参与所有 module 的 prompt assembly。V3 的创作要求不是 raw prompt，而是**三项看板主聚合标签 + `visualStyle` 视觉风格控制 + 9 个细分字段 + 7 项编译字段**的结构化 artifact。详细字段见 [`factor_artifact.md`](./factor_artifact.md)。

当前结构：

```json
{
  "image": {
    "style": "真实展示商品/服务主体...",
    "composition": "按场景、交付和利益表达组织画面...",
    "avoid": ["虚假承诺", "夸大效果"]
  },
  "script": {
    "tone": "面向目标人群的称谓、语气和行动引导..."
  },
  "storyboard": {
    "rhythm": "开场、证明、结果和 CTA 的推进结构..."
  },
  "shotImage": {
    "global": "分镜图全局主体、场景和连续性要求..."
  },
  "shotVideo": {
    "global": "分镜视频全局开场、过程连续和运镜要求..."
  },
  "creativeFactors": {
    "productType": "offline-experience-service",
    "audience": "youth",
    "strategy": "scenario-demo",
    "visualStyle": "authentic"
  },
  "factorGuidance": {
    "productType": {
      "subjectPresentation": "...",
      "sceneAndDelivery": "...",
      "authenticityBoundaries": "..."
    },
    "audience": {
      "addressingAndTone": "...",
      "benefitFrame": "...",
      "sensitivityBoundaries": "..."
    },
    "strategy": {
      "openingHook": "...",
      "storyStructure": "...",
      "evidenceAndCta": "..."
    }
  },
  "scriptInfluence": {},
  "compiledRequirementSourceMap": {},
  "creativeRequirementTemplate": {
    "source": "setup-template",
    "templateId": "offline-youth-restaurant",
    "templateNameSnapshot": "到店餐饮·青年",
    "templateVersion": "p0-2026-06",
    "status": "customized"
  }
}
```

约束：

- `creativeFactors` 保存三个主聚合因子：商品/服务类型、适用人群、推销手法，以及默认化的 `visualStyle`。看板 P0 主聚合只读前三项。
- `factorGuidance` 是可编辑细分字段。用户修改后仍归属于原字段，不新建“自定义分类”。
- 7 项编译字段是下游 prompt 模块的直接输入；`compiledRequirementSourceMap` 用于解释“每个细分字段影响了哪些编译字段”。
- `creativeRequirementTemplate` 是来源标签，不是主分类标签。数据看板主聚合只读 `creativeFactors`。
- proposed requirements 可被导入或保存覆盖；approved/current requirements 不原地修改。

`shot_prompt_artifacts.data.shots[]` 必须包含每个 shot 的初始 dict：

```json
{
  "index": 0,
  "startSec": 0,
  "endSec": 4,
  "providerPrompt": "...",
  "referenceAssetRefs": ["..."],
  "voiceover": "...",
  "shotImage": {
    "scene": "...",
    "composition": "...",
    "productVisibility": "...",
    "style": "...",
    "negative": ["..."]
  },
  "shotVideo": {
    "cameraMotion": "...",
    "subjectMotion": "...",
    "firstFrameIntent": "...",
    "lastFrameIntent": "...",
    "continuity": "...",
    "negative": ["..."]
  }
}
```

`apply shot-set` 时把 `shotImage` / `shotVideo` 写入 `shot_prompt_requirements` 或等价 per-shot requirements 表，供 image/video module 读取。用户后续修改单个 shot 的图像/视频要求，只覆盖该 shot 的当前 requirements，不影响旧 candidates。

---

## 7. 多因子导入与消费

多因子进入链路有三个入口：

| 入口 | 接口/位置 | 行为 |
| --- | --- | --- |
| 内置模板 | `GET /api/setup-templates/creative-requirements` | 返回 9 个内置模板。模板本体是主因子组合，`fields` 提供 9 个细分字段默认值和 `affects` 说明。 |
| 参考视频导入 | `POST /api/workspaces/:workspaceId/reference-video/import` | 模型分析参考视频，通过 JSON schema 推荐主因子，并创建 proposed `prompt_requirements_artifacts`。`visualStyle` 可省略并由 shared schema 默认成 `authentic`；不写素材库，不 approve。 |
| 用户手动编辑 | 首屏因子表单 + `POST /api/workspaces/:workspaceId/prompt-requirements/propose` | 用户调整主因子、视觉风格或细分字段后保存 proposed；提交后 approve 成 current。 |

下游消费规则：

- `material-intake` 只读取素材解读视图：商品/服务类型、目标人群、主体呈现、交付过程和禁用承诺。它不得生成卖点、剧本、分镜或视频提示词。
- `product-brief` 读取商品卖点视图：主因子组合、商品/服务剧本角色、证明对象、受众称谓、利益优先级和敏感边界。
- `storyboard` 读取分镜生成视图：推销手法、开场方式、故事结构、口播语气、CTA 风格和交付顺序。
- `shotprompt` 读取导演约束视图：7 项编译字段，以及结构化剧本影响。它不需要重新看到原始模板卡片。

成片与数据看板消费规则：

```text
prompt_requirements_artifacts.data.creativeFactors
  -> shot_prompt_artifacts.source_fingerprint.promptRequirementsArtifactId
  -> shot_sets.shot_prompt_artifact_id
  -> final_video_jobs.compiled_manifest.creativeTags
  -> dashboard_video_artifacts.creative_factors
  -> dashboard video list

prompt_requirements_artifacts.data.creativeFactors
  -> shot_prompt_artifacts.source_fingerprint.promptRequirementsArtifactId
  -> shot_sets.shot_prompt_artifact_id
  -> final_video_jobs.compiled_manifest.creativeTags
  -> campaign_publications.creative_tags
  -> campaign_publication_metrics
  -> dashboard aggregation
```

- 成片创建时，后端从当前 shot set 对应的 shotprompt 反查当时的 `promptRequirementsArtifactId`，并把 `creativeFactors` 与可选 `creativeRequirementTemplate` 写入 `compiledManifest.creativeTags`。
- 如果无法从 shot set 反查 requirements，则退回读取当前 approved requirements，并在 tags 中标记 `fallback=true`。
- 导入数据面板时，前端在工作台成片区提交 `{ finalVideoJobId, name }`；后端校验 final job 属于当前 workspace、`status=SUCCEEDED` 且 `localPath/localUrl` 可用，再把成片 MP4 复制到全局本地目录 `DASHBOARD_ASSET_DIR/{artifactId}/video.mp4`，写同目录 `metadata.json` 镜像，并由 `dashboard_video_artifacts` 快照全局代理 URL、成片名称、导入时间、时长/宽高、`creativeTags` 和 `creativeFactors`。
- 导入成功后前端跳转 `/dashboard?view=videos`。全局“视频列表”只读取 `GET /api/dashboard/videos` 返回的 artifact；`/dashboard/:workspaceId?view=videos` 读取 workspace-scoped 列表。点击列表行后切到“分析诊断”，视频标题、预览、导入时间和当前因子组合来自被点击的 artifact；P0 的 KPI、漏斗和渠道矩阵仍由样例指标承载，不作为视频列表数据源。
- 发布登记时，如果请求带 `finalVideoJobId`，`campaign_publications.creative_tags` 原样复制成片 `creativeTags`。未绑定成片的发布记录 `creative_tags={}`，看板归为“未归类”。
- 数据看板 P0 聚合维度只读 `creativeTags.creativeFactors.productType`、`creativeTags.creativeFactors.audience`、`creativeTags.creativeFactors.strategy`。`visualStyle` 保留在标签快照中但不作为 P0 主聚合维度；模板来源只用于 secondary breakdown。

暴露给数据看板的接口：

| 接口 | 用途 |
| --- | --- |
| `POST /api/workspaces/:workspaceId/campaign-publications` | 登记成片发布，并复制成片 creative tags。 |
| `GET /api/dashboard/videos` | 全局数据面板视频列表，跨 workspace 返回已导入视频 metadata。 |
| `GET /api/dashboard/videos/:artifactId/file` | 全局数据面板视频文件代理。 |
| `GET /api/workspaces/:workspaceId/campaign-publications` | 返回发布记录、`creativeTags` 和最新指标。 |
| `GET /api/workspaces/:workspaceId/campaign-publications/:publicationId` | 返回单条发布记录、`creativeTags` 和最新指标。 |
| `POST /api/workspaces/:workspaceId/campaign-publications/:publicationId/metrics` | 写入指标；指标不重复保存标签。 |
| `GET /api/workspaces/:workspaceId/final-videos` | 调试或发布前读取成片 manifest 与 `creativeTags`。 |
| `GET /api/final-videos/:finalVideoJobId` | 读取单个成片任务及其标签快照。 |

---

## 8. 分镜链路实例（Shot Sets）

`shotprompt approve` 与创建逐分镜链路必须解耦。

旧实现曾在 `shotprompt/approve` 中删除并重建 `storyboard_shots`；当前主线已改为 approve 与 shot-set apply 解耦，禁止这种级联 reset。

目标行为：

```text
shotprompt propose
  -> 插入待审 shot_prompt_artifact

shotprompt approve
  -> 插入新的生效 shot_prompt_artifact
  -> 不删除、不重建已有 shot_set
  -> 对当前 active shot_set 产生上游变更提示

POST /api/workspaces/:workspaceId/shot-sets
  -> 显式应用 current approved shotprompt
  -> 创建新的 shot_sets row
  -> 创建新的 storyboard_shots 和 shot_prompt_requirements
  -> 新 shot_set active，旧 active shot_set archived
  -> 旧 candidates/selections/final jobs 不物理删除
```

`storyboard_shots` 增加 `shot_set_id`。业务 API 只返回 active shot set 的 shots；archived shot set 的 shots、候选和选择记录作为数据库历史事实保留，不提供商家工作台打开入口。

---

## 9. 上游变更提示

上游变更不等于下游 stale。

下游 artifact 记录生成时的 source fingerprint：

```json
{
  "materialIntakeArtifactId": "...",
  "productBriefArtifactId": "...",
  "storyboardArtifactId": "...",
  "shotPromptArtifactId": "...",
  "promptRequirementsArtifactId": "...",
  "sourceHash": "..."
}
```

查询下游状态时，server 比较当前生效上游与下游保存的 fingerprint：

```json
{
  "upstreamChanged": true,
  "changedUpstreamArtifacts": ["productBrief", "shotPrompt"],
  "impactLevel": "major"
}
```

规则：

- 上游变更提示不删除候选，不清空选择，不重置 shot 状态。
- 用户可以继续使用当前下游内容。
- 用户重新生成时，新的 artifact/candidates 使用新的 current upstream。
- `STALE` 只保留给“同一 shot 重新 propose 新轮次，旧轮次不再是当前轮次”的技术状态，不表示上游变更。

---

## 10. Select Modules

`image-select` 与 `video-select` 是同步点 module，并使用 artifact 表命名：

```text
image_select_artifacts
video_select_artifacts
```

语义：

- 每个 shot 至多一个 current image selection。
- 每个 shot 至多一个 current video selection。
- 重复 select 使用 UPSERT 覆盖当前选择。
- select 不触发 stale。
- 未选候选仍持久化在 workspace 中，UI 可以继续展示并允许以后选择。

---

## 11. Runtime 与队列

运行时仍保留 `generation_v2` 队列：

| kind                       | 用途                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| `generate_image_candidate` | image-prompt 创建每个 image candidate job。                              |
| `advance_shot_image_auto_selection` | 批量生成并选择分镜图任务的阶段推进，等待 image batch 终态后写 selection。 |
| `generate_video_candidate` | video-script 创建每个 video candidate job（每 job 一次 Seedance 调用）。 |
| `generate_videos`          | 旧版 video 批任务，仅保留给历史 job 的 recovery；主线已不再使用。        |
| `compose_final_video`      | final compose。                                                          |

worker 并发：`generate_image_candidate` 与 `generate_video_candidate` 都是「每候选一个 job、每 job 一次 provider 调用」。`generation_v2` worker 的 `concurrency` 由 `GENERATION_WORKER_CONCURRENCY` 调控；它只决定队列执行池大小，不再承担候选数量或 provider 配额含义。

provider 走独立配额：text/image/video provider 调用分别由 `TEXT_PROVIDER_CONCURRENCY`、`IMAGE_PROVIDER_CONCURRENCY`、`VIDEO_PROVIDER_CONCURRENCY` 的进程级信号量限制（authoritative 上限，覆盖任何 caller），与 worker `concurrency` 无关。`video-script propose` 不再内联 `await runVideoGenerationBatch()`：它入队 `generate_video_candidate` 后立即返回 PENDING，由 worker 异步出片，客户端轮询 `video-rounds`。

真实 provider 限制：

- Seedance 单 clip `durationSec` 必须 4-12 秒。
- Seedance 返回临时 mp4 URL 后，候选状态先变为 `PERSISTING`，`video-rounds` 可通过 `previewVideoUrl` 临时预览；只有 stable workspace storage URL 保存完成并写入 `SUCCEEDED + videoUrl/objectKey` 后，候选才可选择和进入 final compose。
- video 同时在飞调用数 ≤ `VIDEO_PROVIDER_CONCURRENCY`（进程级信号量）。多会话共享账号时实际可用名额可能更少；Seedance task-create 阶段命中账号 RPM 429（如 `EndpointAccountRpmRateLimitExceeded`）时立即抛给 `generate_video_candidate` 的队列重试，释放 video provider slot，不进入 200s task polling。task polling 阶段的 429/5xx/超时仍做指数退避重试（`ARK_MAX_RETRIES` / `ARK_RETRY_BASE_MS`，遵循 `Retry-After`）。
- real-provider acceptance 应控制 video candidate 数量，避免把架构问题和 RPM/TPM 限流混在一起。
- image provider 同时在飞调用数 ≤ `IMAGE_PROVIDER_CONCURRENCY`；调高该值前需确认 image provider 的 TPM 余量。Seedream 图片 create 调用使用 `IMAGE_PROVIDER_REQUEST_TIMEOUT_MS` 控制单次 HTTP 超时，并只对 transport error、HTTP 429、HTTP 5xx 做有限 provider-local 重试（`IMAGE_PROVIDER_MAX_RETRIES` / `IMAGE_PROVIDER_RETRY_BASE_MS`），内容审核、schema 和业务错误不重试。
- 旧候选图作为反馈图或前一分镜连续性参考时，优先使用 stable workspace 文件并转成 `data:image/...;base64,...` 传给 Seedream；stable 文件不可读时才回退 provider temporary URL。provider_call 只记录来源分类，不记录完整 data URL 或 signed URL。

---

## 12. Real-provider Probe Policy

当前没有官方真实 provider smoke package script。`scripts/` 只保留直接 provider 探针，用于手动诊断 provider 账号、网络和接口可用性：

```sh
node scripts/verify-provider-image.mjs --json
node scripts/verify-provider-video.mjs --image-url <url> --json
```

这些探针只直接调用 provider endpoint，不覆盖 workspace 状态、队列、DB 写入、asset persistence、候选选择和 final compose。

完整 real-provider agent-chain、Postman agent-chain、后端 image/video chain smoke、多 shot parallel、final compose 与 frontend real-provider E2E 均不作为当前脚本入口，避免把多真实模型联调、provider 配额和产品链路回归混在同一个自动测试入口里。

`test/postman/agent-chain/` 里的 Postman 资产可保留为公开契约参考，但不再作为当前自动真实 provider 验收入口。

---

## 13. 迁移边界

已清除或退出主链路的旧架构：

- `workspace_artifact` 作为 material/brief/storyboard/shotprompt 主存储。
- `workspace.service.ts` 中集中式 V1 builder 大模块。
- `shotprompt approve` 内的 `delete from storyboard_shots` 级联 reseed。
- `selected_shot_images` / `selected_shot_videos` 命名与主链路引用。
- 混在单个 prompt builder 中的主体 prompt 与 schema/contract prompt。

迁移允许不兼容旧数据；以新 schema、新接口、新测试链路为准。

---

## 14. 工作区身份与本地草稿发现

工作区身份有两层：**磁盘 manifest 是持久身份，DB row 是可丢弃的业务状态。**

- 每个创作工作目录下的 `.daireel/workspace.json` 保存该工作区的 `workspaceId`，是工作区的**持久身份**。
- DB `creative_workspace` 行承载业务状态（artifact、shot set、候选、选择等），可被 `reset:dev` 清空；磁盘 `.daireel/`（manifest、trace、媒体）不被 reset 删除。
- `WORKSPACE_STORAGE_KIND=s3` 的新工作区不依赖磁盘 manifest；server 自动绑定私有 S3-compatible bucket，prefix 固定为 `workspaces/{workspaceId}`。前端只访问 server 代理 URL，不直接暴露 MinIO/S3 URL。

因此 DB 被清后，磁盘上仍存在但「未登记」的工作区要能被重新发现并接回原始身份：

```text
GET /api/workspaces
  -> workspaces[]:  DB 已登记工作区 + active storage binding
  -> discovered[]:  扫描 WORKSPACE_DISCOVERY_ROOTS（逗号分隔根目录，有界深度）
                    下存在 .daireel/workspace.json 但 DB 无对应行的工作区
                    （已登记路径从 discovered 去重剔除）

POST /api/workspaces/init  { directory }
  -> DB 有行：find
  -> DB 无行但磁盘 manifest 存在且其 workspaceId 未被占用：
       复用该原始 workspaceId 重新登记（不新建、不覆盖 manifest）
  -> 否则：新建 workspaceId 并写 manifest
```

边界：

- `reset:dev` 清空业务表后，草稿通过 `discovered` 重新出现，点击经 `init` 以**原始 id** 重新打开。
- 复用的是身份，不是业务数据：被 reset 清掉的 DB 侧 artifact（brief/storyboard/shotprompt/选择等）不会自动恢复；磁盘媒体与 trace 仍在。
- 前端首页除 DB 工作区外，单列「本地草稿（未登记）」区呈现 `discovered`。
- 云模式隐藏本地目录选择和 `discovered` 入口，只保留新建创作工作区。
- `WORKSPACE_DISCOVERY_ROOTS` 是配置项（`.env`），未设置则不扫描磁盘草稿。
