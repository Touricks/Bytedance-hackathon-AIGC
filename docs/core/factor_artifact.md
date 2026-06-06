# Factor Artifact — 多因子创作要求与看板标签

> 本文描述当前多因子创作要求的事实结构、导入方式、编译规则和数据看板消费口径。架构总览见 [`arc_v3.md`](./arc_v3.md)，接口契约见 [`interface.md`](./interface.md) 与 [`openapi.yaml`](./openapi.yaml)。

---

## 1. 设计定位

多因子不是一张独立业务表，也不是一套替代 7 项创作要求的新 prompt 文案。P0 把多因子作为 `prompt_requirements_artifacts.data` 的结构化部分保存：

- `creativeFactors` 是主分类标签，只包含三个原子维度。
- `factorGuidance` 是三因子展开后的 9 个可编辑细分字段。
- `scriptInfluence` 是三因子对商品卖点、分镜和 shotprompt 的结构化剧本影响缓存。
- `image/script/storyboard/shotImage/shotVideo` 仍是下游 prompt 模块直接消费的 7 项编译字段。
- `compiledRequirementSourceMap` 解释 9 个细分字段如何影响 7 项编译字段，供首页预览、审计和刷新恢复使用。
- `creativeRequirementTemplate` 只记录模板来源，不参与主聚合分类。

生命周期沿用 workspace module artifact 规则：

```text
reference video import / setup template / manual edit
  -> prompt_requirements_artifacts(status='proposed', is_current=false)
  -> merchant approve
  -> prompt_requirements_artifacts(status='approved', is_current=true)
  -> downstream modules only read approved/current
```

同一 workspace 只保留一个 recoverable proposed draft slot；新的 proposed 内容直接覆盖旧 proposed，避免刷新丢失模型推荐或用户已保存的细分字段。

---

## 2. 三个主因子

`creativeFactors` 是数据看板的主聚合标签。

```json
{
  "productType": "offline-experience-service",
  "audience": "youth",
  "strategy": "scenario-demo"
}
```

### 2.1 商品/服务类型

| 值                           | 业务含义     | 主要影响                                         |
| ---------------------------- | ------------ | ------------------------------------------------ |
| `consumable-good`            | 可消耗商品   | 证明包装、质地、用量、使用瞬间和复购理由。       |
| `durable-good`               | 耐用商品     | 证明主体结构、功能部位、材质细节和长期使用价值。 |
| `digital-service`            | 数字服务     | 把抽象服务转成界面、流程、案例结果和咨询路径。   |
| `offline-experience-service` | 线下体验服务 | 证明目的地、场地、服务人员、体验过程和保障承诺。 |

### 2.2 适用人群

| 值        | 业务含义           | 主要影响                                             |
| --------- | ------------------ | ---------------------------------------------------- |
| `toddler` | 幼儿，新手家长决策 | 强调安全、成分透明、照护省心，避免育儿焦虑。         |
| `child`   | 儿童，家长决策     | 强调安全、省心、陪伴和孩子真实体验。                 |
| `youth`   | 青年用户           | 语气直接、有体验感，强调效率、颜值、实用和即时体验。 |
| `senior`  | 老年用户或子女决策 | 语气温和稳重，强调安心、品质、便利和心意。           |

### 2.3 推销手法

| 值                  | 业务含义 | 主要影响                                                        |
| ------------------- | -------- | --------------------------------------------------------------- |
| `pain-solution`     | 痛点解决 | 痛点出现 -> 原因解释 -> 解决方式 -> 证据证明 -> 行动引导。      |
| `scenario-demo`     | 场景演示 | 场景进入 -> 过程演示 -> 关键卖点 -> 结果证明 -> 行动引导。      |
| `review-comparison` | 测评对比 | 测评标准 -> 使用过程 -> 对比结果 -> 适用建议 -> 行动引导。      |
| `tutorial-value`    | 教程价值 | 问题/误区 -> 方法步骤 -> 效果展示 -> 行动引导。                 |
| `authority-proof`   | 权威证明 | 可信来源 -> 核心能力 -> 证据细节 -> 适用场景 -> 行动引导。      |
| `emotional-story`   | 情绪故事 | 人物处境 -> 情绪需求 -> 使用/服务过程 -> 改善结果 -> 行动引导。 |
| `curiosity-hook`    | 好奇钩子 | 悬念提出 -> 答案揭示 -> 卖点解释 -> 证据证明 -> 行动引导。      |

默认组合是：

```json
{
  "productType": "durable-good",
  "audience": "youth",
  "strategy": "scenario-demo"
}
```

---

## 3. 细分字段与编译字段

每个主因子展开为 3 个可编辑细分字段，共 9 个字段：

| 分组                         | 字段                     | 说明                                     |
| ---------------------------- | ------------------------ | ---------------------------------------- |
| `factorGuidance.productType` | `subjectPresentation`    | 商品/服务主体如何被真实呈现。            |
| `factorGuidance.productType` | `sceneAndDelivery`       | 场景、流程、交付和证明顺序。             |
| `factorGuidance.productType` | `authenticityBoundaries` | 商品真实性和承诺边界。                   |
| `factorGuidance.audience`    | `addressingAndTone`      | 面向谁说话，以及语气策略。               |
| `factorGuidance.audience`    | `benefitFrame`           | 对该人群优先表达哪些利益。               |
| `factorGuidance.audience`    | `sensitivityBoundaries`  | 对该人群必须避开的焦虑、歧视或夸大表达。 |
| `factorGuidance.strategy`    | `openingHook`            | 开场钩子和首镜进入方式。                 |
| `factorGuidance.strategy`    | `storyStructure`         | 剧本推进结构。                           |
| `factorGuidance.strategy`    | `evidenceAndCta`         | 证据组织和行动引导。                     |

这些字段确定性编译为 7 项下游创作要求：

| 编译字段            | 主要来源                                                                               |
| ------------------- | -------------------------------------------------------------------------------------- |
| `image.style`       | `productType.subjectPresentation`                                                      |
| `image.composition` | `productType.sceneAndDelivery` + `audience.benefitFrame`                               |
| `image.avoid`       | `productType.authenticityBoundaries` + `audience.sensitivityBoundaries`                |
| `script.tone`       | `audience.addressingAndTone` + `audience.benefitFrame` + `strategy.evidenceAndCta`     |
| `storyboard.rhythm` | `strategy.storyStructure` + `strategy.evidenceAndCta` + `productType.sceneAndDelivery` |
| `shotImage.global`  | `productType.subjectPresentation` + `productType.sceneAndDelivery`                     |
| `shotVideo.global`  | `strategy.openingHook` + `productType.sceneAndDelivery`                                |

下游模块的消费边界：

| 模块              | 读取内容                                                       | 用途                                                                               |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `material-intake` | 商品/服务类型、人群、主体呈现、交付过程、禁用承诺              | 判断素材角色、相关性、主素材选择和纳入边界。                                       |
| `product-brief`   | 三因子组合、商品角色、证明对象、受众称谓、利益优先级、敏感边界 | 生成商品/服务定义、目标人群、核心卖点、证明对象和禁用表达。                        |
| `storyboard`      | 推销手法、开场方式、分镜结构、口播语气、CTA 风格、交付顺序     | 约束口播开场、分镜结构、证据顺序和 CTA。                                           |
| `shotprompt`      | 7 项编译字段 + 结构化剧本影响                                  | 生成 provider-neutral 的导演约束、`shotImage`、`shotVideo` 和 `tts.voiceProfile`。 |

---

## 4. 导入来源

### 4.1 内置创作要求模板

`GET /api/setup-templates/creative-requirements` 返回 9 个内置模板。模板本体是一个 `creativeFactors` 组合，而不是新起的 7 项 prompt 文案。模板的 `fields` 提供 9 个细分字段默认值，并声明 `affects`。

当前内置模板：

| 模板            | 因子组合                                                 |
| --------------- | -------------------------------------------------------- |
| 快消种草·青年   | `consumable-good / youth / pain-solution`                |
| 数码家居·青年   | `durable-good / youth / scenario-demo`                   |
| 知识服务·青年   | `digital-service / youth / authority-proof`              |
| 银发滋补·老年   | `consumable-good / senior / emotional-story`             |
| 儿童好物·家长向 | `durable-good / child / scenario-demo`                   |
| 母婴用品·幼儿   | `consumable-good / toddler / authority-proof`            |
| 亲子旅游·家长向 | `offline-experience-service / child / scenario-demo`     |
| 到店餐饮·青年   | `offline-experience-service / youth / review-comparison` |
| 本地摄影·青年   | `offline-experience-service / youth / emotional-story`   |

模板只回填首页草稿。用户保存或提交后才写入 `prompt_requirements_artifacts`。

### 4.2 参考视频导入

`POST /api/workspaces/:workspaceId/reference-video/import` 支持 URL 或上传文件。后端用模型分析参考视频，并通过 JSON schema 返回：

- `analysis`：参考视频结构、节奏和风险摘要。
- `creativeFactorsRecommendation.recommendedFactors`：只包含三个主因子。
- `artifact`：由 `recommendedFactors` 确定性编译得到的 proposed `prompt-requirements` artifact，包含 `creativeFactors / factorGuidance / scriptInfluence / 7 项编译字段`。

参考视频不写入素材库，不创建 `asset`，不 approve。若 workspace 已存在 approved/current 创作要求，接口返回 `REQUIREMENTS_ALREADY_APPROVED`，避免覆盖已生效链路。

### 4.3 手动编辑与保存

用户可以在首页修改三个主因子，也可以展开修改 9 个细分字段。保存时前端提交完整 `prompt_requirements_artifacts.data`：

```json
{
  "creativeFactors": {},
  "factorGuidance": {},
  "scriptInfluence": {},
  "compiledRequirementSourceMap": {},
  "image": {},
  "script": {},
  "storyboard": {},
  "shotImage": {},
  "shotVideo": {},
  "creativeRequirementTemplate": {}
}
```

如果用户基于模板修改细分字段，`creativeRequirementTemplate.status="customized"`；如果套用模板后更换了任一主因子，`status="detached"`。模板来源是 secondary tag，不改变主分类。

---

## 5. 数据看板消费

数据看板不直接按 workspace current requirements 聚合，因为 current 会随用户继续编辑而变化。P0 看板有两个消费入口：

- 视频列表读取 `dashboard_video_artifacts`，展示从“导出成片”导入的数据面板视频 metadata。
- 投放效果聚合读取 `campaign_publications` 和 `campaign_publication_metrics`，消费发布记录上的成片标签快照。

标签快照链路：

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

`final_video_jobs.compiled_manifest.creativeTags` 结构：

```json
{
  "schemaVersion": "creative-tags.v1",
  "promptRequirementsArtifactId": "req_123",
  "shotPromptArtifactId": "sp_456",
  "creativeFactors": {
    "productType": "offline-experience-service",
    "audience": "youth",
    "strategy": "scenario-demo"
  },
  "creativeRequirementTemplate": {
    "source": "setup-template",
    "templateId": "offline-youth-restaurant",
    "templateNameSnapshot": "到店餐饮·青年",
    "templateVersion": "p0-2026-06",
    "status": "customized"
  },
  "fallback": false
}
```

`fallback=true` 表示成片时无法从 shot set 指向的 `promptRequirementsArtifactId` 读取标签，退回读取当前 approved requirements。看板可以展示该标记用于审计，但不应把 fallback 记录从聚合中自动排除。

### 5.1 暴露给数据看板的接口

| 接口                                                                             | 看板用途                                                                                                 | 标签来源                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `POST /api/workspaces/:workspaceId/dashboard/videos`                             | 从已完成成片导入数据面板视频 artifact，保存名称、成片 URL、导入时间、时长/宽高和生成因子快照。           | `final_video_jobs.compiled_manifest.creativeTags` |
| `GET /api/workspaces/:workspaceId/dashboard/videos`                              | 看板“视频列表”读取导入的视频 metadata 与 `creativeFactors`。                                             | `dashboard_video_artifacts.creative_factors`      |
| `GET /api/workspaces/:workspaceId/dashboard/videos/:artifactId`                  | 获取单条数据面板视频 artifact。                                                                          | `dashboard_video_artifacts.creative_factors`      |
| `POST /api/workspaces/:workspaceId/campaign-publications`                        | 登记一次成片发布。请求带 `finalVideoJobId` 时，后端复制成片 `compiledManifest.creativeTags` 到发布记录。 | `final_video_jobs.compiled_manifest.creativeTags` |
| `GET /api/workspaces/:workspaceId/campaign-publications`                         | 按 workspace 列出发布记录和最新指标，返回 `creativeTags`。                                               | `campaign_publications.creative_tags`             |
| `GET /api/workspaces/:workspaceId/campaign-publications/:publicationId`          | 获取单条发布记录，返回 `creativeTags` 与 `latestMetrics`。                                               | `campaign_publications.creative_tags`             |
| `POST /api/workspaces/:workspaceId/campaign-publications/:publicationId/metrics` | 写入曝光、点击、转化、花费等指标。                                                                       | 不重复写标签，只绑定 publication。                |
| `GET /api/workspaces/:workspaceId/final-videos`                                  | 调试或发布前选择成片，返回 `compiledManifest.creativeTags`。                                             | `final_video_jobs.compiled_manifest.creativeTags` |
| `GET /api/final-videos/:finalVideoJobId`                                         | 获取单个成片任务及标签快照。                                                                             | `final_video_jobs.compiled_manifest.creativeTags` |

当前版本的成片和数据面板视频 artifact 不包含 CTR、3 秒留存、完播率、CVR、ROAS、GMV 或漏斗等投放效果指标；这些值不能从视频本身或生成因子直接推导。P0 前端分析诊断可使用结构清晰的样例 JSON 承载完整指标视图，真实效果指标后续应从发布与投放数据写入。

P0 看板聚合口径：

| 维度          | 字段                                       |
| ------------- | ------------------------------------------ |
| 商品/服务类型 | `creativeTags.creativeFactors.productType` |
| 适用人群      | `creativeTags.creativeFactors.audience`    |
| 推销手法      | `creativeTags.creativeFactors.strategy`    |

P0.1 可增加模板来源维度：

| 维度     | 字段                                                       |
| -------- | ---------------------------------------------------------- |
| 模板 id  | `creativeTags.creativeRequirementTemplate.templateId`      |
| 模板状态 | `creativeTags.creativeRequirementTemplate.status`          |
| 模板版本 | `creativeTags.creativeRequirementTemplate.templateVersion` |

发布记录未绑定成片时，`creative_tags` 为空对象。看板应归为“未归类”，不要读取 workspace 当前 requirements 进行补全。
