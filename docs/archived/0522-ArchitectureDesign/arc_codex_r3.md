# 电商场景 AIGC 带货视频生成系统 — 最终项目架构设计 (Codex r3)

> 核心结论：
>
> ```text
> P0/P1 不做分镜级渲染，不做 FFmpeg 拼接。
> 保留分镜作为剧本脚本结构，用一次 Seedance 12s 调用生成整片。
> 项目采用轻量 monorepo：apps/web + apps/server + packages/shared + packages/ai + packages/config。
> worker 逻辑内嵌 server，未来需要扩容时再物理拆分。
> ```

---

## 1. 最终架构判断

当前项目首先是一个比赛项目，而不是生产级视频中台。架构应该同时满足三件事：

1. **P0 端到端可跑通**：上传商品图与卖点，生成剧本和基础分镜，一键生成可播放带货视频。
2. **代码结构可解释**：评委能看懂“素材-剧本-创作”三大业务域如何落到代码中。
3. **范围不过重**：不把时间浪费在 P0/P1 不需要的 FFmpeg、多服务部署、完整 E2E 矩阵上。

`arc_claude_r3.md` 提供了一个关键新事实：

```text
Seedance 支持单次输出 12s 视频，而比赛要求视频 <15s。
```

因此，P0/P1 没必要做“每个分镜单独生成片段，然后 FFmpeg 拼接”。这会把最复杂的音视频工程引入关键路径，却不能显著提升比赛交付确定性。

最终策略是：

```text
分镜 = 剧本脚本结构
不是 = 渲染切片单元
```

也就是说：

- **保留分镜脚本**：LLM 生成 2-4 个 shot，用于呈现叙事结构、构造最终 prompt、支持 P1 局部改写。
- **砍掉分镜渲染**：不把每个 shot 单独送去视频生成，不做 concat，不烧字幕，不混多音轨。
- **单次出整片**：将多个 shot 压缩成一个完整视频 prompt，一次调用 Seedance 生成 ≤12s 成片。

---

## 2. 总体拓扑

P0 只有两个可部署物：

```text
apps/web
apps/server
```

`apps/server` 内部同时包含 HTTP API 和 job processors。逻辑上有 worker，物理上不单独部署。

```text
                 ┌───────────────────────────────────────────┐
                 │ apps/web                                  │
                 │ React + TypeScript 商家工作台              │
                 │ 上传商品图 -> 剧本/分镜 -> 一键成片 -> 预览 │
                 └─────────────────────┬─────────────────────┘
                                       │ REST + 轮询任务状态
                 ┌─────────────────────▼─────────────────────┐
                 │ apps/server                               │
                 │ Node.js + TypeScript 模块化单体             │
                 │                                           │
                 │ API modules                               │
                 │ material / script / creation              │
                 │                                           │
                 │ Embedded job processors                   │
                 │ script-generate / media-generate          │
                 └─────────────┬─────────────────┬───────────┘
                               │                 │
               ┌───────────────▼─────┐   ┌───────▼────────────────┐
               │ packages/ai          │   │ Postgres + Redis + MinIO │
               │ providers/prompts/   │   │ job / trace / asset      │
               │ workflows/schemas    │   │ storage                  │
               └───────────────┬─────┘   └─────────────────────────┘
                               │
               ┌───────────────▼─────────────────────┐
               │ 火山方舟 OpenAPI                     │
               │ Doubao-Seed-2.0-pro      文本/剧本    │
               │ Doubao-Seedance-1.5-pro  12s 视频     │
               │ TTS / 其他模型能力        P1/P2       │
               └──────────────────────────────────────┘
```

---

## 3. 当前项目目录设计

建议当前项目采用以下目录结构：

```text
Bytedancehack/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   │   └── bgm/                         # P0 罐头 BGM，可选
│   │   ├── src/
│   │   │   ├── features/
│   │   │   │   ├── material/                # 素材上传、商品图管理
│   │   │   │   ├── script/                  # 剧本生成、分镜展示、轻编辑
│   │   │   │   └── creation/                # 任务进度、视频预览、导出
│   │   │   ├── components/                  # 当前仅一个前端，不抽 packages/ui
│   │   │   ├── lib/
│   │   │   │   ├── api/                     # API client
│   │   │   │   ├── job/                     # 任务轮询、阶段文案
│   │   │   │   └── store/                   # React Query / Zustand 相关封装
│   │   │   ├── routes/                      # 页面路由
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── server/
│       ├── src/
│       │   ├── modules/
│       │   │   ├── material/
│       │   │   │   ├── material.controller.ts
│       │   │   │   ├── material.service.ts
│       │   │   │   ├── material.repository.ts
│       │   │   │   └── material.schema.ts
│       │   │   ├── script/
│       │   │   │   ├── script.controller.ts
│       │   │   │   ├── script.service.ts
│       │   │   │   ├── script.repository.ts
│       │   │   │   └── script.schema.ts
│       │   │   └── creation/
│       │   │       ├── creation.controller.ts
│       │   │       ├── creation.service.ts
│       │   │       ├── creation.repository.ts
│       │   │       └── creation.schema.ts
│       │   │
│       │   ├── jobs/
│       │   │   ├── queue.ts                 # BullMQ 队列、并发、重试配置
│       │   │   ├── job.types.ts             # job name / payload / stage
│       │   │   └── processors/
│       │   │       ├── script-generate.processor.ts
│       │   │       └── media-generate.processor.ts
│       │   │
│       │   ├── common/
│       │   │   ├── config.ts
│       │   │   ├── logger.ts
│       │   │   ├── errors.ts
│       │   │   └── trace.ts
│       │   ├── db/
│       │   │   ├── client.ts
│       │   │   └── schema/
│       │   └── main.ts                      # P0: HTTP + processors 同进程启动
│       └── package.json
│
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── dto/                         # 前后端共享请求/响应 DTO
│   │   │   ├── schemas/                     # zod schema
│   │   │   ├── jobs/                        # job payload / stage / status
│   │   │   ├── types/                       # Product/Script/Shot/Asset 类型
│   │   │   └── constants/
│   │   └── package.json
│   │
│   ├── ai/
│   │   ├── src/
│   │   │   ├── providers/
│   │   │   │   ├── seed-text.provider.ts
│   │   │   │   ├── seedance-video.provider.ts
│   │   │   │   └── tts.provider.ts          # P1
│   │   │   ├── prompts/
│   │   │   │   ├── script.prompt.ts
│   │   │   │   ├── storyboard.prompt.ts
│   │   │   │   └── video.prompt.ts
│   │   │   ├── schemas/
│   │   │   │   ├── script-output.schema.ts
│   │   │   │   └── storyboard.schema.ts
│   │   │   ├── workflows/
│   │   │   │   ├── one-click-video.workflow.ts
│   │   │   │   ├── regenerate-script.workflow.ts
│   │   │   │   └── regenerate-shot.workflow.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── config/
│       ├── eslint/
│       ├── prettier/
│       ├── typescript/
│       └── package.json
│
├── infra/
│   └── docker-compose.yml                   # Postgres + Redis + MinIO + app
├── docs/
│   ├── architecture.md
│   ├── erd.md
│   └── demo-guide.md
├── mocks/
│   ├── products/
│   ├── scripts/
│   ├── videos/                              # 预生成 1-2 条成片，现场兜底
│   └── metrics/                             # P1 mock 数据看板
├── .github/
│   └── workflows/
│       └── ci.yml                           # install/typecheck/lint/build
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
├── package.json
└── README.md
```

---

## 4. 目录设计论据

### 4.1 为什么是 monorepo

PRD 明确要求单一 Git 仓库，并且项目前后端共享大量类型：

- `GenerationJob` 状态。
- `StoryboardShot` 结构。
- 剧本 JSON schema。
- API DTO。
- 错误码和阶段文案。

monorepo 可以把共享契约放在 `packages/shared`，避免前端和后端各写一套类型，减少联调漂移。

### 4.2 为什么只有 `apps/web` 和 `apps/server`

P0/P1 的部署目标是稳定 Demo，而不是分布式扩容。

独立 `apps/worker` 会增加一个部署物、一套日志、一套环境变量和一层联调成本。当前更好的方案是：

```text
物理上：server 同进程启动 HTTP + processors
逻辑上：jobs/processors 保持清晰 worker 边界
未来：需要扩容时再把 processors 移到 apps/worker
```

这样既保留异步任务模型，也避免过早拆服务。

### 4.3 为什么保留 `packages/ai`

模型调用是本项目最高风险、最高价值的部分，必须收口。

`packages/ai` 负责：

- 模型 provider 封装。
- Prompt 模板。
- zod 输出 schema。
- 一键成片 workflow。
- 模型调用 trace。
- 失败重试和兜底模板。

它必须是 **server-only package**。前端不能 import，也不能接触火山 OpenAPI 密钥。

### 4.4 为什么不建 `packages/video`

在 12s 单次出片成立后，P0/P1 不需要：

- 分镜片段 concat。
- 字幕烧录。
- BGM 混音。
- 多轨音频合成。
- 转场渲染。

因此 `packages/video` 会变成过早抽象。视频相关逻辑先放在 `creation` 模块或 `packages/ai/workflows` 里即可。

只有当 P2 真的要做“每分镜独立出片 + FFmpeg concat”时，再抽 `packages/video`。

### 4.5 为什么不建 `packages/ui`

当前只有一个前端应用 `apps/web`。  
UI 组件放在 `apps/web/src/components` 更直接。

等出现以下情况，再抽 `packages/ui`：

- 需要移动端独立应用。
- 需要管理后台。
- 多个前端项目共享组件。

### 4.6 为什么保留 `StoryboardShot`

虽然不做分镜级渲染，但 `StoryboardShot` 不能删。

原因：

- PRD 把“基础分镜”列为 P0。
- 剧本生成要求包含分镜脚本。
- 分镜是构造最终 Seedance prompt 的脚手架。
- P1 的“分镜级干预”可以通过改某个 shot，再重新生成整条 12s 视频实现。

所以当前定义是：

```text
StoryboardShot = 剧本脚本单元
不是 = 视频渲染切片
```

### 4.7 为什么 P0 用 5 张主表

P0 的目标是端到端，不是完整素材中台。

5 张表足够表达主链路：

```text
Product
Asset
GenerationJob
Script
StoryboardShot
```

`MaterialEmbedding`、`CreativeTemplate`、`ReferenceVideoAnalysis`、`ConversionMetric` 都放到 P1/P2。

尤其是 embedding：pgvector 只能存向量，不能生成向量。当前资源没有确认 embedding 模型，所以 P0 不能假设向量检索已经可用。

---

## 5. P0 核心业务链路

P0 一键成片流程如下：

```text
1. 用户上传商品主图，填写标题、卖点、目标人群。
2. server 创建 GenerationJob，状态为 queued。
3. script-generate processor 调用 Seed 文本模型。
4. Seed 输出结构化剧本 JSON，包含 2-4 个 StoryboardShot。
5. server 用 zod 校验剧本结构，失败则重试，仍失败则使用兜底模板。
6. web 展示剧本与基础分镜。
7. creation workflow 将多个 shot 压缩为完整视频 prompt。
8. media-generate processor 调用 Seedance，一次生成 ≤12s 成片。
9. 成片保存为 Asset(type=final_video)。
10. web 轮询 job 状态，完成后直接预览和导出。
```

P0 罐头 BGM 策略：

```text
优先：web 播放器侧叠加一条预置 BGM。
备选：server 做一次简单 audio overlay。
推迟：TTS、字幕时间轴、混音进入 P1。
```

这样不会交付默片，也不会把复杂音频工程拉进 P0。

---

## 6. Day-1 Spike

正式铺工程目录前，第一天必须先验证模型链路。

Spike 不做 DB、不做队列、不做完整 UI，只验证：

```text
商品图 + 卖点
-> Seed 结构化剧本
-> zod 校验
-> 多 shot 压缩成 video prompt
-> Seedance 单次 12s 出片
-> 最小页面播放
```

验证闸门：

```text
Gate 1  Seed 是否能稳定输出结构化 JSON
Gate 2  zod 校验失败率是否可接受
Gate 3  Seedance 是否能基于商品图 + prompt 生成可播放视频
Gate 4  单次 12s 耗时、失败率、5 并发限制是否可控
Gate 5  生成结果能否在 0 登录页面播放
Gate 6  单次 12s 是否能体现多 beat 叙事：Hook -> 卖点 -> CTA
```

Gate 6 即使失败，也不回退到 FFmpeg。  
最坏情况下，分镜被定义为“剧本叙事结构”，而不是“逐镜头渲染承诺”。

---

## 7. 数据模型

P0 建议数据模型：

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
- mediaAssetId          # P1 可用于单 shot 片段；P0 可为空
- status
```

P1/P2 再补：

```text
CreativeTemplate
ReferenceVideoAnalysis
MaterialEmbedding
ConversionMetric
ExperimentVariant
```

---

## 8. 任务状态机

P0 状态机：

```text
queued
  -> script_generating
  -> media_generating
  -> completed

任意阶段 -> failed
```

P1 状态机：

```text
queued
  -> material_analyzing
  -> script_generating
  -> storyboard_generating
  -> media_generating
  -> tts_generating
  -> subtitle_composing
  -> completed

任意阶段 -> failed / cancelled
```

P0 前端只做轮询：

```text
GET /api/jobs/:jobId
```

返回：

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

## 9. 前端页面设计

P0 不做营销 landing page，直接进入商家工作台。

```text
/material
上传商品主图，填写标题、卖点、目标人群。

/script/:jobId
展示结构化剧本、2-4 个 StoryboardShot，支持轻编辑。

/creation/:jobId
展示任务进度、阶段说明、失败原因、重试入口、视频预览和导出。

/dashboard
P1 mock 数据看板。
```

前端状态：

```text
React Query      服务端数据与任务状态
Zustand          分镜编辑器本地状态
React Hook Form  商品信息、Prompt、导出配置
Zod              表单与 API schema 校验
```

P0 必须交付的体验：

- 一键生成。
- 进度可见。
- 阶段文案清楚。
- 失败原因可读。
- 可重试。
- 完成后立即预览。
- 有预生成样例视频兜底。

---

## 10. 部署与 Demo

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
MinIO/S3      商品图、生成视频、mock 视频
```

评委访问：

```text
一个公开 URL
无登录或共享演示账号
预置 demo 商品
点开即可播放预生成样例
实时生成链路可手动触发
```

现场兜底：

```text
mocks/videos/ 预生成 1-2 条成片
```

原因很简单：Seedance 生成慢且只有 5 并发。实时生成展示技术链路，预生成样例保证答辩不翻车。

---

## 11. 工程规范与 CI

P0 保留最小但有信号的规范：

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

推迟到 P2：

```text
Playwright E2E
完整单元测试矩阵
自动部署
压测
可观测性平台
```

`.env.example` 只写变量名，不提交真实 API Key、endpoint secret 或账号资源。

---

## 12. 分阶段交付

### Phase 0: Day-1 Spike

目标：打掉模型链路风险。

```text
商品图 + 卖点 -> Seed 剧本 -> Seedance 12s 视频 -> 页面播放
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

目标：完成比赛必做主路径。

```text
上传商品图
填写卖点
生成剧本
展示基础分镜
单次 12s 一键成片
任务进度
罐头 BGM
视频预览
导出/下载
预生成样例兜底
```

### Phase 2: P1 增强

目标：让项目更像真实产品。

```text
分镜级干预：改 shot -> 重拼 prompt -> 再出 12s 成片
TTS / 字幕
失败重试
生成 trace
素材标签/关键词检索
mock 数据看板
```

注意：P1 仍然不需要每分镜单独渲染和 FFmpeg 拼接。

### Phase 3: P2 加分

目标：体现工程深度和业务创新。

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
可选：每分镜独立生成 + FFmpeg concat
```

---

## 13. 何时升级架构

### 13.1 何时拆出 `apps/worker`

满足任一条件再拆：

- HTTP 响应被生成任务拖慢。
- 需要独立扩容 worker。
- 需要单独监控 Seedance 队列吞吐。
- 部署平台支持多服务管理。

拆分方式：

```text
apps/server/src/jobs/processors
-> apps/worker/src/processors
```

`packages/shared` 继续保存 job payload schema。

### 13.2 何时抽 `packages/video`

只有当真的需要以下能力时再抽：

- 每分镜单独出片。
- FFmpeg concat。
- 字幕烧录。
- BGM 混音。
- 转场渲染。
- 多画幅重渲染。

P0/P1 不抽。

### 13.3 何时引入向量检索

满足以下条件再做：

- 已确认 embedding 生成模型。
- 素材量大到关键词/标签不够。
- 需要视觉相似度召回。

否则 P0 只做标签和关键词检索兜底。

---

## 14. 最终结论

当前项目最终架构应是：

```text
轻量 monorepo
apps/web + apps/server 两个部署物
server 内嵌 job processors
packages/shared 共享类型契约
packages/ai 收口模型调用
P0 五张核心表
P0/P1 单次 Seedance 12s 出整片
分镜保留为剧本脚本结构
FFmpeg / packages/video / 独立 worker 全部推迟
```

这套设计的价值在于：

- 足够轻，适合比赛周期。
- 足够清晰，能体现全栈工程能力。
- 足够稳，规避 FFmpeg 和多服务部署风险。
- 足够可扩展，P1/P2 仍能自然升级到分镜干预、TTS/字幕、素材检索、A/B 出片和 Agent 编排。

一句话：

```text
先让评委看到一条能跑、能播、能解释的带货视频生成链路；
再用清晰的目录和领域边界证明它不是一次性脚本。
```
