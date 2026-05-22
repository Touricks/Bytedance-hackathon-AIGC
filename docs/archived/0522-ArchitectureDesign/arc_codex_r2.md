# 电商场景 AIGC 带货视频生成系统 — Codex 架构修订版 (r2)

> 本文是对 `arc_codex_r1.md` 的修订，也回应 `arc_claude_r2.md` 的挑战。
> 我的结论：**r1 的领域边界是对的，r2 的交付收缩也是对的**。最终方案应采用：
>
> ```text
> r1 的清晰领域模型 + r2 的黑客松风险优先策略
> ```
>
> 换句话说：不要放弃架构，但要把架构压到能在比赛周期内跑通、演示、复核的尺寸。

---

## 0. 核心洞察

`arc_claude_r2.md` 对 `arc_codex_r1.md` 最大的挑战，不是技术选型，而是**评价函数**。

`arc_codex_r1.md` 默认在回答“这个项目长期怎么做比较健康”；  
`arc_claude_r2.md` 在回答“3 人黑客松怎么最大概率交付能赢的 Demo”。

这两个问题都重要，但当前项目首先是比赛交付。因此 r2 版本应该把排序改成：

```text
1. 先验证模型链路是否能打通
2. 再建立最小可维护架构
3. 最后补齐 P1/P2 工程深度
```

我接受 `arc_claude_r2.md` 的核心批评：  
**目录结构不会让项目翻车，Seedance 链路、生成耗时、输出形态、现场可访问性会。**

---

## 1. 我接受的修正

| 问题 | r1 倾向 | Claude r2 挑战 | Codex r2 结论 |
| --- | --- | --- | --- |
| worker | `apps/worker` 独立应用 | P0 没必要多一个部署物 | **逻辑 worker 保留，物理上内嵌 server** |
| 渲染 | 预留 `packages/video` 和渲染层 | FFmpeg 是高风险坑，先别默认做 | **P0 不建完整 FFmpeg 管线** |
| 数据模型 | P0 6 张核心表，P1 扩展更多实体 | 仍偏重，可压到 5 张左右 | **P0 用 Product / Job / Script / Shot / Asset** |
| 状态推送 | 轮询或 SSE/WebSocket | Demo 阶段轮询足够 | **P0 只做轮询，SSE 推迟** |
| CI/测试 | Vitest + Playwright + 多步 CI | P2 才需要完整矩阵 | **P0 只保留 typecheck + lint + build** |
| 实现顺序 | 按模块建设 | 应先按风险 spike | **Day-1 spike 写入架构流程** |
| 素材检索 | 默认 pgvector 可用 | pgvector 不产 embedding | **P1 才做 embedding，P0 用标签/关键词兜底** |
| Demo | 未充分强调现场兜底 | 必须预生成样例 | **mocks/ 放 1-2 条预生成成片** |

---

## 2. 我不完全接受的地方

### 2.1 P0 不应把“分镜”降成不存在

`arc_claude_r2.md` 建议 P0 可以走：

```text
1 个分镜 = 1 次 Seedance 调用 = 1 条成片
```

这个建议非常稳，但会削弱 PRD 中“基础分镜”和“分镜级干预”的表达。

我的折中建议是：

```text
P0 仍然生成 2-4 个结构化分镜，并在 UI 中展示；
但视频生成阶段可以把多个分镜压缩成一个完整视频 prompt，
让 Seedance 一次性产出 ≤15s 成片。
```

这样有三个好处：

- 评委能看到“剧本 -> 分镜 -> 成片”的产品路径。
- 不需要立即做多片段拼接、字幕烧录、音轨混合。
- P1 可以自然升级为“每个分镜单独生成片段，再轻拼接”。

### 2.2 worker 不应从架构语言里消失

P0 不独立部署 worker 是对的，但“worker 角色”不能消失。

视频生成天然是异步长任务。如果代码里没有清晰的 processor/job 边界，后续会很快变成：

```text
controller -> service -> 模型调用 -> while 等待 -> 拼状态
```

这会让失败重试、进度追踪、单分镜重试都很难维护。

因此我的修正是：

```text
物理部署：web + server 两个部署物
逻辑结构：server 内部包含 API runtime + job processor runtime
未来拆分：同一套 processors 可通过启动参数独立运行
```

---

## 3. 修订后的总体架构

```text
                 ┌────────────────────────────────────────┐
                 │ apps/web                               │
                 │ React + TS 商家工作台                  │
                 │ 上传素材 -> 剧本 -> 分镜 -> 生成 -> 预览 │
                 └───────────────────┬────────────────────┘
                                     │ REST + 轮询
                 ┌───────────────────▼────────────────────┐
                 │ apps/server                             │
                 │ Node.js + TS 模块化单体                 │
                 │                                        │
                 │  API modules                            │
                 │  material / script / creation           │
                 │                                        │
                 │  Embedded job processors                │
                 │  script-generate / media-generate       │
                 └───────────┬─────────────────┬──────────┘
                             │                 │
              ┌──────────────▼─────┐   ┌───────▼─────────────────┐
              │ packages/ai         │   │ Postgres + Redis + MinIO │
              │ provider/prompt/    │   │ Job / trace / asset      │
              │ workflow/schema     │   │ storage                  │
              └──────────────┬─────┘   └─────────────────────────┘
                             │
              ┌──────────────▼──────────────────────┐
              │ 火山方舟 OpenAPI                     │
              │ Doubao-Seed 文本生成                 │
              │ Doubao-Seedance 图生视频             │
              │ TTS / 其他模型能力(P1)               │
              └─────────────────────────────────────┘
```

P0 只有两个部署物：

```text
apps/web
apps/server
```

但 server 内部要有清晰的 job 边界：

```text
HTTP API 创建任务
Job processor 执行任务
Postgres/Redis 记录状态
Web 轮询状态
```

---

## 4. 仓库结构

```text
ecommerce-aigc-video/
├── apps/
│   ├── web/                     # React + TS 商家工作台
│   └── server/                  # Node + TS API + 内嵌 job processors
│
├── packages/
│   ├── shared/                  # 类型、DTO、zod schema、job payload、错误码
│   ├── ai/                      # server-only：模型 provider、prompt、workflow
│   └── config/                  # eslint / prettier / tsconfig / tailwind 配置
│
├── infra/
│   └── docker-compose.yml       # pg + redis + minio + app，本地一键起
├── docs/                        # PRD、架构、ER 图、答辩材料
├── mocks/                       # mock 商品、mock 转化数据、预生成成片
├── .github/workflows/ci.yml     # 最小 CI
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
└── README.md
```

相对 `arc_codex_r1.md` 的变化：

- 删除独立 `apps/worker`，但在 `apps/server/src/jobs` 保留 processors。
- 暂不抽 `packages/video`，视频相关逻辑先放在 `creation` 或 `packages/ai/workflows`。
- 暂不抽 `packages/ui`，单前端阶段 UI 放 `apps/web/src/components`。
- 保留 `packages/shared` 和 `packages/ai`，因为它们便宜且能显著降低接口漂移和密钥泄漏风险。

---

## 5. 后端结构

```text
apps/server/src/
├── modules/
│   ├── material/
│   │   ├── material.controller.ts
│   │   ├── material.service.ts
│   │   ├── material.repository.ts
│   │   └── material.schema.ts
│   ├── script/
│   │   ├── script.controller.ts
│   │   ├── script.service.ts
│   │   ├── script.repository.ts
│   │   └── script.schema.ts
│   └── creation/
│       ├── creation.controller.ts
│       ├── creation.service.ts
│       ├── creation.repository.ts
│       └── creation.schema.ts
│
├── jobs/
│   ├── queue.ts                 # BullMQ 队列、并发、重试配置
│   ├── job.types.ts             # job name / payload / stage
│   └── processors/
│       ├── script-generate.processor.ts
│       └── media-generate.processor.ts
│
├── common/
│   ├── config.ts
│   ├── logger.ts
│   ├── errors.ts
│   └── trace.ts
├── db/
│   ├── client.ts
│   └── schema/
└── main.ts
```

`main.ts` 支持两种模式：

```text
pnpm dev              # P0 默认：HTTP + processors 同进程
pnpm dev:api          # P1/P2：只启动 HTTP
pnpm dev:worker       # P1/P2：只启动 processors
```

这样 P0 简单，P1/P2 可拆。

---

## 6. AI 链路是第一优先级

模型能力全部收口到 `packages/ai`。

```text
packages/ai/src/
├── providers/
│   ├── seed-text.provider.ts
│   ├── seedance-video.provider.ts
│   └── tts.provider.ts
├── prompts/
│   ├── script.prompt.ts
│   ├── storyboard.prompt.ts
│   └── video.prompt.ts
├── schemas/
│   ├── script-output.schema.ts
│   └── storyboard.schema.ts
├── workflows/
│   ├── one-click-video.workflow.ts
│   ├── regenerate-script.workflow.ts
│   └── regenerate-shot.workflow.ts
└── index.ts
```

关键原则：

- 前端永远不直接调用模型 API。
- 模型密钥只通过环境变量读取。
- LLM 输出必须经过 zod schema 校验。
- 失败时允许自动重试，重试仍失败则使用兜底模板。
- 所有模型调用记录 trace：provider、模型、耗时、输入摘要、输出状态、错误原因。

---

## 7. Day-1 Spike 闸门

正式铺目录前，第一天必须打掉模型链路风险。

```text
Gate 1: Seed 文本模型能否稳定输出结构化剧本 JSON
Gate 2: zod schema 校验失败率是否可接受
Gate 3: Seedance 能否基于商品图 + prompt 生成可播放视频
Gate 4: Seedance 单次耗时、失败率、并发限制是否可控
Gate 5: 生成结果能否在最小页面里 0 登录播放
```

Spike 不需要完整 DB、不需要漂亮 UI、不需要队列。

最小链路：

```text
硬编码商品信息
-> Seed 生成结构化剧本
-> 压缩成视频 prompt
-> Seedance 生成单条 ≤15s 视频
-> 本地页面播放
```

如果这个链路失败，后面所有架构都是空中楼阁。  
如果这个链路成功，再进入正式 P0。

---

## 8. P0 一键成片链路

P0 推荐采用“结构化分镜 + 单次成片”的折中路线。

```text
1. 用户上传商品主图，填写标题、卖点、目标人群
2. server 创建 GenerationJob
3. script processor 调用 Seed 生成结构化剧本
4. 剧本包含 2-4 个 StoryboardShot
5. creation workflow 把多个分镜压缩为一个完整视频 prompt
6. media processor 调用 Seedance 生成 ≤15s 成片
7. 结果保存为 Asset(type=final_video)
8. web 轮询 job 状态，完成后播放视频
```

P0 视频生成策略：

```text
UI 层：展示多分镜，让产品路径成立
生成层：一次 Seedance 调用，避免多片段拼接
数据层：仍保存 StoryboardShot，为 P1 单分镜重生成做准备
```

P1 再升级为：

```text
每个 StoryboardShot -> 单独 Seedance 片段 -> ffmpeg concat -> final video
```

---

## 9. P0 数据模型

P0 保持 5 张主表左右。

```text
Product
- id
- title
- sellingPoints
- audience
- mainImageAssetId
- createdAt

Asset
- id
- type                  # product_image / generated_clip / final_video / audio / subtitle
- url
- source                # upload / seedance / tts / mock
- metadata
- createdAt

GenerationJob
- id
- productId
- status                # queued / running / completed / failed
- stage                 # script_generating / media_generating / completed / failed
- progress
- payload
- trace
- errorMessage
- createdAt
- updatedAt

Script
- id
- jobId
- version
- narrative
- visualStyle
- rawJson
- createdAt

StoryboardShot
- id
- scriptId
- index
- durationSec
- visualPrompt
- cameraMotion
- voiceover
- subtitle
- mediaAssetId
- status
```

P1 再补：

```text
CreativeTemplate
ReferenceVideoAnalysis
MaterialEmbedding
ConversionMetric
ExperimentVariant
```

关于 `Asset` 的边界：

- P0 用 `Asset` 合并素材和产物是合理的。
- 但必须有 `type`、`source`、`metadata`，否则会变成“什么都能塞”的垃圾桶。
- 如果后续素材理解变复杂，再拆 `MaterialAsset` / `RenderOutput`。

---

## 10. 任务状态机

P0 状态机保持简单。

```text
queued
  -> script_generating
  -> media_generating
  -> completed

任意阶段 -> failed
```

P1 扩展：

```text
queued
  -> material_analyzing
  -> script_generating
  -> storyboard_generating
  -> media_generating
  -> tts_generating
  -> subtitle_composing
  -> rendering
  -> completed

任意阶段 -> failed / cancelled
```

前端 P0 用轮询：

```text
GET /api/jobs/:jobId
```

响应包含：

```text
status
stage
progress
currentMessage
partialResult
errorMessage
```

SSE/WebSocket 推迟到 P1/P2。

---

## 11. 前端策略

P0 页面不要铺太大，做一条可演示主路径。

```text
/                       直接进入工作台，不做营销落地页
/material               商品素材上传
/script/:jobId          剧本和分镜查看/轻编辑
/creation/:jobId        任务进度、视频预览、导出
/dashboard              mock 数据看板(P1)
```

状态管理：

```text
React Query      服务端数据、任务状态
Zustand          分镜编辑器本地状态
React Hook Form  商品信息、Prompt、导出配置
Zod              表单与 API schema 校验
```

P0 必须做好的体验：

- 一键开始生成。
- 生成过程显示阶段和进度。
- 失败显示原因。
- 可重试。
- 完成后直接预览。
- 有预生成样例视频兜底。

---

## 12. Demo 与部署

比赛项目的“可访问”优先级很高。

P0 部署目标：

```text
一个公开 URL
无登录或共享演示账号
预置 demo 商品
点开即可播放预生成样例
实时生成链路可选触发
```

本地开发：

```text
docker-compose up
pnpm install
pnpm dev
```

基础设施：

```text
Postgres      业务数据
Redis         BullMQ 队列
MinIO/S3      图片和视频资产
```

现场兜底：

```text
mocks/
├── products/
├── scripts/
├── videos/
└── metrics/
```

必须预生成 1-2 条成片。实时生成用于展示技术链路，预生成样例用于保证答辩不翻车。

---

## 13. CI 与工程规范

P0 保留最小但有信号的工程规范。

```text
TypeScript strict
ESLint
Prettier
Husky + lint-staged
pnpm workspaces
Turborepo
```

最小 CI：

```text
install
typecheck
lint
build:web
build:server
```

推迟到 P1/P2：

```text
Playwright E2E
完整单元测试矩阵
自动部署
可观测性平台
压测
```

注意：`.env.example` 只能写变量名，不能写真实 API Key、endpoint secret 或账号资源。

---

## 14. 分阶段交付

### Phase 0: Day-1 Spike

目标：验证模型链路。

```text
商品图 + 卖点 -> Seed 结构化剧本 -> Seedance 视频 -> 页面播放
```

不做：

```text
DB
队列
完整 UI
FFmpeg
Embedding
数据看板
```

### Phase 1: P0 Demo

目标：完成一条端到端主路径。

```text
上传商品图
填写卖点
生成剧本
展示基础分镜
一键成片
任务进度
视频预览
导出/下载
```

技术范围：

```text
apps/web
apps/server
packages/shared
packages/ai
Postgres
Redis/BullMQ
Object Storage
5 张核心表
```

### Phase 2: P1 增强

目标：让项目显得更像真实产品。

```text
多分镜单独生成
轻量 ffmpeg concat
字幕/TTS
单分镜重生成
失败重试
素材标签/关键词检索
生成 trace
mock 数据看板
```

### Phase 3: P2 加分

目标：强调创新和工程深度。

```text
Embedding 检索
爆款视频拆解
CreativeTemplate
A/B 自动出片
多因子归因
Agent 编排
合规审核流
CI/CD
可观测性
```

---

## 15. 何时升级架构

### 15.1 何时拆出 `apps/worker`

满足任一条件再拆：

- server HTTP 响应被生成任务拖慢。
- 需要独立扩容 worker。
- Seedance 调用并发和队列吞吐需要单独监控。
- 部署平台支持多进程/多服务管理。

拆分方式：

```text
apps/server/src/jobs/processors
-> apps/worker/src/processors
```

payload schema 仍在 `packages/shared`。

### 15.2 何时抽 `packages/video`

满足任一条件再抽：

- P1 开始做多片段拼接。
- 字幕、音轨、画幅、转场逻辑在多个模块复用。
- creation 模块里视频纯逻辑超过业务编排逻辑。

### 15.3 何时引入向量数据库

满足任一条件再引入：

- 已确认 embedding 生成模型。
- 素材数量足够多，关键词/标签检索不够用。
- 需要按视觉相似度召回素材或爆款案例。

P0 不要为了“架构完整”强行上向量链路。

---

## 16. 与两版文档的关系

| 维度 | arc_codex_r1.md | arc_claude_r2.md | arc_codex_r2.md |
| --- | --- | --- | --- |
| 核心定位 | 较完整工程蓝图 | 黑客松施工图 | 风险优先的最小可维护架构 |
| worker | 独立 `apps/worker` | 内嵌 server | **逻辑保留，物理内嵌** |
| 分镜 | 完整分镜链路 | P0 可单片成片 | **UI 有分镜，生成可单次成片** |
| 数据模型 | 6+ 核心实体 | 5 张表 | **P0 5 张表，Asset 需类型约束** |
| AI 链路 | 有边界但不够具体 | 明确 6 步链路 | **采纳，并加入 zod/trace/兜底模板** |
| 渲染 | 预留 video 包 | P0 不做 FFmpeg | **P0 不做，P1 按实测升级** |
| 实现顺序 | 按模块 | 按风险 | **先 spike，再架构化** |
| Demo | 较少强调 | 强调兜底 | **必须预生成样例** |

---

## 17. 最终建议

最终推荐方案不是“r1 或 r2 二选一”，而是：

```text
用 r1 的方式命名边界，
用 r2 的方式控制范围，
用 Day-1 spike 决定模型和渲染细节。
```

第一优先级不是搭一个看起来完整的工程，而是证明：

```text
商品图 + 卖点
-> 结构化剧本
-> 可解释分镜
-> ≤15s 可播放带货视频
-> 评委 0 门槛访问
```

只要这条链路稳定，monorepo、队列、领域模块、模型适配层这些骨架就足够支撑 P0。  
等 P0 跑通后，再把时间投到 P1 的分镜级重生成、TTS/字幕、mock 数据看板和素材检索上，收益会比提前搭完整 FFmpeg、独立 worker、完整测试矩阵更高。

一句话总结：

```text
Codex r2 = 清晰但不重，能演示但不草率，先打模型风险，再补工程深度。
```
