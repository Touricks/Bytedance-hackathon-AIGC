# 电商场景 AIGC 带货视频生成系统架构建议

## 1. 架构目标

本项目的核心链路是：

```text
素材库建设 -> 剧本生成 -> 视频创作 -> 预览导出 -> 数据回流
```

PRD 对工程结构有三个硬约束：

- 单一 Git 仓库，便于团队协作、统一规范和最终提交。
- 前后端分离，前端负责复杂编辑体验，后端负责业务、任务和模型编排。
- 对“素材-剧本-创作”三大模块做清晰抽象，便于评审理解，也便于后续扩展。

因此推荐采用 `pnpm workspaces + Turborepo` 管理的 monorepo。后端先做模块化单体，不急着拆微服务；视频生成、素材解析、TTS、渲染等长耗时步骤通过 worker 和队列异步执行。

## 2. 总体判断

这个项目不适合做成简单的“前端表单 + 后端同步调用模型”。它的主要复杂度在：

- 长任务：视频生成、TTS、字幕、渲染、失败重试都不适合同步 HTTP 请求。
- 多模态资产：图片、视频、切片、标签、Embedding、来源和版权声明都需要结构化管理。
- 分镜级编辑：用户会对单个镜头、台词、素材、时长做局部干预。
- 模型编排：文生图、图生视频、TTS、脚本生成、素材召回需要可替换的模型适配层。
- 评审展示：需要让评委快速看懂架构、跑通 Demo、复核代码质量。

推荐架构关键词：

```text
Monorepo
前后端分离
模块化单体
异步任务队列
领域分层
模型适配层
可观测任务追踪
```

## 3. 仓库结构

根目录第一层按“可部署应用”和“可复用包”切分，而不是只分 `frontend/` 和 `backend/`。

```text
ecommerce-aigc-video/
├── apps/
│   ├── web/                   # React + TypeScript 商家工作台
│   ├── server/                # Node.js + TypeScript API 服务，模块化单体
│   └── worker/                # 长任务消费者，执行素材解析、生成、剪辑、渲染
│
├── packages/
│   ├── shared/                # 共享类型、DTO、Zod schema、错误码、枚举
│   ├── ai/                    # server-only 模型适配层、Prompt、Agent/workflow 编排
│   ├── video/                 # 分镜、字幕、音频、FFmpeg/渲染相关纯逻辑
│   └── config/                # ESLint、Prettier、TypeScript、StyleLint、Tailwind 配置
│
├── infra/                     # Dockerfile、docker-compose、部署脚本、IaC
├── docs/                      # PRD、架构图、ADR、接口文档、答辩材料
├── mocks/                     # mock 商品、素材、转化数据、演示 fixtures
├── scripts/                   # 初始化、迁移、一次性运维脚本
├── .github/workflows/         # CI/CD
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
└── README.md
```

说明：

- `packages/ai` 必须只被 `apps/server` 和 `apps/worker` 使用，不能被前端 import，因为这里会接触模型密钥、OpenAPI 调用和服务端 Prompt。
- 如果 MVP 阶段只有一个前端应用，暂时不必抽 `packages/ui`；UI 组件可以先放在 `apps/web/src/components`，等出现多端复用需求再抽包。
- `packages/video` 适合放不依赖 HTTP 框架的纯逻辑，例如分镜时间轴计算、字幕片段生成、导出参数校验。

## 4. 应用职责

### apps/web

前端是商家工作台，重点承载复杂交互：

```text
apps/web/src/
├── features/
│   ├── material/              # 素材上传、素材库、标签、检索
│   ├── script/                # 剧本生成、Prompt 微调、模板选择、台词改写
│   └── creation/              # 一键成片、分镜编辑器、时间轴、预览导出
├── dashboard/                 # 生成因子 x 转化效果的数据看板
├── components/                # 通用 UI 组件
├── lib/
│   ├── api/                   # API client
│   ├── job/                   # 任务轮询、SSE/WebSocket 状态订阅
│   └── store/                 # Zustand/Redux/React Query 状态管理
└── main.tsx
```

前端设计重点：

- 首屏展示核心工作流，不做纯营销页。
- 长任务必须有进度、阶段文案、失败原因和重试入口。
- 分镜编辑器以“分镜列表 + 时间轴 + 预览”为核心。
- 单个分镜重生成时只刷新局部状态，不阻塞整片。

### apps/server

后端先做模块化单体。所有业务域在一个 server 应用内分模块维护，降低比赛阶段部署和联调成本。

```text
apps/server/src/
├── modules/
│   ├── material/              # 素材：上传、切片、多模态理解、标签、向量检索
│   ├── script/                # 剧本：爆款拆解、模板、剧本生成、剧本干预
│   ├── creation/              # 创作：任务创建、分镜匹配、导出参数、预览资源
│   ├── analytics/             # 数据回流、mock 转化、生成因子分析
│   └── agent/                 # workflow/Agent 编排，调度素材、剧本、创作能力
├── jobs/                      # job 类型、payload schema、任务入队逻辑
├── common/                    # 鉴权、日志、错误处理、配置、监控
├── db/                        # ORM client、repository 基类、事务工具
└── main.ts
```

每个业务模块内部建议保持统一分层：

```text
modules/material/
├── material.controller.ts     # HTTP 接口
├── material.service.ts        # 用例编排
├── material.repository.ts     # 数据访问
├── material.dto.ts            # 请求/响应 DTO
├── material.schema.ts         # Zod 校验或 OpenAPI schema
└── material.types.ts          # 模块内部类型
```

### apps/worker

worker 消费队列任务，不直接暴露给前端。

```text
apps/worker/src/
├── processors/
│   ├── material-ingest.processor.ts
│   ├── script-generate.processor.ts
│   ├── storyboard-match.processor.ts
│   ├── tts-subtitle.processor.ts
│   └── video-render.processor.ts
├── clients/                   # 数据库、对象存储、队列、模型服务 client
├── observability/             # 任务日志、trace、指标
└── main.ts
```

worker 与 server 共用 `packages/shared` 的 job payload schema，避免接口漂移。

## 5. 数据与存储

推荐数据层：

```text
PostgreSQL      业务主库
pgvector        MVP 阶段的向量检索，可与 PostgreSQL 合并部署
Object Storage  图片、原始视频、切片、音频、导出成片
Redis           队列、短期任务状态、幂等锁
BullMQ          Node 生态中足够轻量的异步任务队列
```

核心实体建议：

```text
Product
MaterialAsset
MaterialSlice
MaterialEmbedding
ReferenceVideo
ReferenceVideoAnalysis
CreativeTemplate
Script
StoryboardShot
GenerationJob
RenderOutput
ConversionMetric
```

实体关系简化为：

```text
Product 1 -> n MaterialAsset
MaterialAsset 1 -> n MaterialSlice
MaterialSlice 1 -> n MaterialEmbedding
ReferenceVideo 1 -> 1 ReferenceVideoAnalysis
CreativeTemplate 1 -> n Script
Script 1 -> n StoryboardShot
Script 1 -> n GenerationJob
GenerationJob 1 -> n RenderOutput
RenderOutput 1 -> n ConversionMetric
```

MVP 阶段可以先只实现：

- `Product`
- `MaterialAsset`
- `Script`
- `StoryboardShot`
- `GenerationJob`
- `RenderOutput`

P1 再补 `MaterialSlice`、`Embedding`、`ReferenceVideoAnalysis` 和 `CreativeTemplate`。

## 6. 长任务生成链路

用户点击“一键成片”后，不直接等待模型同步返回完整视频。推荐流程：

```text
1. web 提交商品信息/素材/创作目标
2. server 创建 GenerationJob，状态为 queued
3. server 将 job payload 入队
4. worker 按阶段执行任务
5. worker 持续写入 job stage、progress、trace、partial result
6. web 通过轮询或 SSE 获取任务进度
7. 成功后 web 展示预览和导出入口
8. 失败时 web 展示失败阶段、原因和重试入口
```

推荐任务阶段：

```text
queued
material_analyzing
script_generating
storyboard_matching
media_generating
tts_generating
subtitle_composing
rendering
completed
failed
cancelled
```

失败重试策略：

- 模型调用失败：按 provider、endpoint、错误码记录 trace，允许局部重试。
- 单个分镜失败：只重试该分镜，不重跑整条视频。
- 渲染失败：保留已生成素材，重新进入 `rendering` 阶段。
- 审核或合规失败：给出可读原因，允许用户修改 Prompt 或替换素材。

## 7. AI 与模型边界

模型能力统一收口到 `packages/ai`，不要把火山引擎 OpenAPI 调用散落在 controller 或前端里。

```text
packages/ai/src/
├── providers/
│   ├── volcano-text.provider.ts
│   ├── volcano-image.provider.ts
│   ├── volcano-video.provider.ts
│   └── tts.provider.ts
├── prompts/
│   ├── script.prompt.ts
│   ├── storyboard.prompt.ts
│   └── material-analysis.prompt.ts
├── workflows/
│   ├── one-click-video.workflow.ts
│   ├── script-regenerate.workflow.ts
│   └── shot-regenerate.workflow.ts
└── index.ts
```

设计原则：

- 模型密钥只通过环境变量读取，不进入代码仓库。
- provider 层只负责调用模型，workflow 层负责任务编排。
- Prompt 模板版本化，方便解释生成效果和回溯问题。
- 所有模型调用写入 trace，包含输入摘要、模型名、耗时、状态、失败原因。
- 前端只接收业务结果和任务状态，不接触模型密钥和原始 OpenAPI。

如果后续需要 LangGraph，可以先把它放在 `packages/ai/src/workflows` 内部，不改变外部业务接口。

## 8. 是否需要 Python 服务

默认建议使用 TypeScript 全栈：

- 团队小，语言栈统一，联调成本低。
- PRD 推荐 React、Node.js、TypeScript，评审也容易理解。
- MVP 的素材检索可以用 `pgvector`，不必单独维护 Python 服务。

只有在以下情况出现时，再增加 Python sidecar：

- 需要自建多模态模型或复杂视频理解模型。
- 需要大量依赖 Python ML 生态。
- 需要离线批处理、模型评测或复杂向量召回实验。

可选结构：

```text
services/
└── ai-py/
    ├── app/
    ├── models/
    ├── requirements.txt
    └── README.md
```

`apps/server` 通过 HTTP/gRPC 调用 `services/ai-py`，不要让前端直接调用 Python 服务。

## 9. 前端状态与交互

推荐前端状态分层：

```text
React Query      服务端数据缓存：素材、剧本、任务、导出结果
Zustand          编辑器本地状态：选中分镜、时间轴缩放、临时改动
SSE/WebSocket    长任务状态推送
Form Schema      Zod + React Hook Form 管理 Prompt 和导出配置
```

核心页面建议：

```text
/material             素材库
/script               剧本生成与编辑
/creation/:jobId      分镜编辑、生成进度、预览
/dashboard            Mock 转化数据看板
```

MVP 可以优先做一条主路径：

```text
上传商品主图/素材 -> 输入商品卖点 -> 生成剧本 -> 生成基础分镜 -> 一键成片 -> 预览导出
```

## 10. 分阶段交付

### P0 必做

- 商品素材上传。
- 剧本生成。
- 基础分镜。
- 一键成片。
- 任务进度。
- 预览导出。

对应工程实现：

```text
apps/web: material + script + creation 主流程
apps/server: material/script/creation 三个模块
apps/worker: script-generate + video-render 两类 processor
data: Product/MaterialAsset/Script/StoryboardShot/GenerationJob/RenderOutput
```

### P1 进阶

- 素材标签和 Embedding 检索。
- 智能剪辑 Agent。
- 分镜级编辑。
- TTS、字幕、BGM。
- 失败重试。
- 生成 trace。
- Mock 数据看板。

### P2 加分

- 多因子归因。
- A/B 自动出片对比。
- 更完整的 Agent 编排。
- CI/CD 和可观测性。
- 合规审核流。
- 多语言 dubbing。

## 11. 工程规范

推荐基础工具：

```text
pnpm workspaces
Turborepo
TypeScript strict mode
ESLint
Prettier
StyleLint
Husky + lint-staged
Vitest
Playwright
Docker Compose
```

CI 至少覆盖：

- 安装依赖。
- 类型检查。
- lint。
- 单元测试。
- web build。
- server build。
- worker build。

环境变量必须通过 `.env.example` 暴露变量名，不提交真实密钥。

## 12. 主要取舍

推荐先做模块化单体，而不是微服务：

- 比赛周期内最重要的是端到端跑通和 Demo 稳定。
- 三大业务域虽然不同，但初期数据模型和任务链路高度相关。
- 后续如果某个域成为瓶颈，可以从 `apps/server/src/modules/*` 平移成独立服务。

推荐先用 BullMQ，而不是复杂工作流平台：

- Node 生态内集成成本低。
- 足够支持任务状态、重试、延迟执行和并发控制。
- 后续如果 Agent/workflow 变复杂，可以迁移到 Temporal、LangGraph 或独立调度服务。

推荐先用 pgvector，而不是单独向量数据库：

- MVP 部署简单。
- 数据和向量可以一起查询。
- 后续数据量变大，再迁移 Milvus/Qdrant。

## 13. 一句话总结

本项目推荐采用 `React + Node.js + TypeScript` 的 monorepo 架构，以 `apps/web` 承载商家端复杂编辑体验，以 `apps/server` 承载“素材-剧本-创作”的领域模型，以 `apps/worker` 承载视频生成长任务，并通过 `packages/shared`、`packages/ai`、`packages/video` 统一类型、模型调用和视频创作逻辑。这样既能快速完成 P0 端到端 Demo，也为 P1/P2 的 Agent 编排、素材检索、分镜级编辑和数据回流留下清晰扩展点。
