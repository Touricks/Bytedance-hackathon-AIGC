# 项目架构与第三方库集成方案

## 1. 文档定位

本文是 `plan_0523/` 的架构审阅入口，用于把以下材料收束成可执行开发计划：

- `docs/prd_safe.pdf`
- `docs/arc_codex_r3.md`
- `docs/deep_research/05222200_OpenSourceSolution/report_zh.md`

本文不替代 PRD 和架构文档，而是把当前讨论后的最终开发取舍转成审阅口径。

## 2. 背景与输入材料

PRD 要求系统覆盖“素材-剧本-创作”三大模块，P0 必做能力包括：

- 商品素材上传。
- 剧本生成。
- 基础分镜。
- 一键成片。
- 任务进度。
- 预览导出。

当前 V0 范围严格保持在上述六项，不把检索、TTS、字幕合成、BGM 合成、数据看板、A/B 对比、复杂分镜编辑、移动端专项优化纳入主路径。

P1/P2 扩展包括素材标签/Embedding 检索、智能剪辑 Agent、分镜级编辑、TTS/字幕/BGM、生成 trace、数据看板、A/B 对比、可观测性和 CI/CD。

`arc_codex_r3.md` 的关键架构结论保持成立：

```text
P0/P1 不做分镜级渲染，不做 FFmpeg 拼接。
保留分镜作为剧本脚本结构，用一次 Seedance 12s 调用生成整片。
项目采用轻量 monorepo：apps/web + apps/server + packages/shared + packages/ai + packages/config。
worker 逻辑内嵌 server，未来需要扩容时再物理拆分。
```

`report_zh.md` 的第三方库建议作为基础，但经过本轮讨论后需要做两处修正：

- AI runtime 不再默认选择 Vercel AI SDK Core；P0 优先官方 `openai` SDK + Zod validation + repair retry，并做 OpenAI Agents SDK trace spike。
- 检索侧因本地已有 bge-m3 和 Qdrant，计划采用 Postgres 事实源 + Qdrant 向量索引 + embedding sidecar 的双库检索方案，但它不阻塞 P0 主路径。
- P0 模型链路必须真实调用 Ark 文本模型和 Seedance；mock provider 只作为开发和现场兜底，不作为架构验证替代。

## 3. 当前推荐架构

当前项目继续采用轻量 monorepo：

```text
apps/web       React + TypeScript 商家工作台
apps/server    Fastify + BullMQ 模块化单体，HTTP API 与 processors 同进程
packages/shared 前后端共享 DTO、Zod schema、job 状态、领域类型
packages/ai     server-only 的模型调用、prompt、workflow、validation、trace
packages/config 共享工程配置
infra/          Postgres、Redis、Qdrant、embedding service；MinIO/S3 推迟到对象存储升级
```

核心业务链路：

```text
商品素材/商品信息
  -> 生成创作蓝图 Script / StoryboardShot / improvementHints
  -> 用户只读确认
  -> 创建成片任务 GenerationJob
  -> 压缩为 Seedance whole-video prompt
  -> 一次 Seedance 图生视频生成 <=12s 成片
  -> 保存 final_video Asset
  -> 前端轮询成片任务进度并预览/导出
```

关键约束：

- `StoryboardShot` 是剧本结构单元，不是视频渲染切片。
- Postgres 是业务事实源。
- Redis/BullMQ 是异步执行与进度传输层。
- P0 上传素材先保存到 server 本地文件目录，并通过 Asset URL 暴露给前端和生成链路；MinIO/S3 作为后续对象存储适配升级，不进入 P0 必需路径。
- P0 真实调用 Ark 文本模型生成结构化剧本，并真实调用 Seedance 生成成片；`.env` 已包含相关运行配置。
- P0 Seedance 主路径固定为图生视频：上传商品图或 demo 商品图 + whole-video prompt；纯文本视频生成只作为兜底或实验路径。
- P0 v0 的 Seedance prompt 使用保守三段式模板：商品 hero -> 卖点/使用场景 -> CTA；`StoryboardShot` 提供叙事灵感，不承诺逐镜头渲染。
- V0 主流程采用两步式：先生成并展示剧本/基础分镜，再由用户点击“一键成片”触发 Seedance 成片生成。
- V0 剧本/基础分镜预览为只读确认；用户只能通过商品标题、卖点、目标人群、风格偏好等结构化 UI 字段重新生成剧本，不直接编辑图生视频 prompt。
- V0 后端拆成两个命令/API：创作蓝图生成返回 Script / StoryboardShot / improvementHints；一键成片接收 scriptId 并创建成片任务，不在单个 GenerationJob 中途暂停等待确认。
- V0 创作蓝图生成同步返回，UI 显示普通 loading；只有成片任务进入异步进度轮询。
- V0 创作蓝图同步返回前立即持久化 Product / Script / StoryboardShot / improvementHints，并返回稳定 scriptId；前端不临时持有未落库蓝图再进入成片。
- V0 蓝图版本规则：视频生成前的草稿蓝图可直接覆盖；一旦用于创建成片任务，该蓝图冻结为只读，后续修改创建新的 Script version。
- V0 允许同一个冻结 scriptId 创建多个成片任务；GenerationJob 记录每次成片尝试，Script 记录稳定创作方案。
- Qdrant 只保存可重建向量索引，不保存完整业务对象。
- bge-m3 权重不进入 git，也不 bake 进镜像，通过 `BGE_M3_MODEL_PATH` 只读挂载到 embedding service。

## 4. 项目目录设计

当前推荐目录：

```text
Bytedancehack/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── features/
│   │       │   ├── material/
│   │       │   ├── script/
│   │       │   └── creation/
│   │       ├── components/
│   │       ├── lib/
│   │       │   ├── api/
│   │       │   ├── job/
│   │       │   └── store/
│   │       └── routes/
│   ├── server/
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── material/
│   │       │   ├── script/
│   │       │   ├── creation/
│   │       │   └── retrieval/              # P0+ / P1
│   │       ├── jobs/
│   │       │   └── processors/
│   │       ├── common/
│   │       └── db/
│   └── embedding/                          # P0+ / P1，bge-m3 sidecar
├── packages/
│   ├── shared/
│   ├── ai/
│   └── config/
├── infra/
├── models/                                 # gitignored，本地模型约定目录
├── mocks/
└── docs/
```

P0 不新增：

- `packages/video`
- `packages/ui`
- `apps/worker`
- FFmpeg composition service
- LangGraph runtime

这些能力在明确进入 P2 或出现实际扩容需求后再拆。

## 5. 核心业务流

P0 一键成片：

```text
1. 用户上传商品主图到 server 本地文件目录，或选择 demo 商品。
2. 用户填写标题、卖点、目标人群、风格偏好。
3. 用户点击“生成剧本/基础分镜”，UI 进入普通 loading。
4. 创作蓝图生成命令同步调 packages/ai，通过 Ark 文本模型生成结构化 Script / StoryboardShot / improvementHints。
5. packages/ai 用 Zod 校验输出；失败时做一次 repair retry；仍失败则兜底模板。
6. server 持久化 Product / Script / StoryboardShot / improvementHints，返回 scriptId。
7. web 只读展示剧本和 2-4 个 StoryboardShot；用户如需调整，返回修改结构化字段并覆盖当前草稿蓝图。
8. 用户确认后点击“一键成片”。
9. server 接收 scriptId，冻结该蓝图并创建成片任务 GenerationJob。
10. creation workflow 将 StoryboardShot 压缩为完整 Seedance whole-video prompt。
11. media-generate processor 使用上传商品图或 demo 商品图，真实调用 Seedance 图生视频，一次生成 <=12s 成片。
12. server 保存 final_video Asset，更新 GenerationJob。
13. web 轮询成片任务状态，完成后预览和导出。
```

P0 兜底策略：

- `mocks/videos/` 准备 1-2 条预生成视频。
- 上传文件目录写入 `.gitignore`，只提交 demo/mock 素材，不提交用户上传文件。
- mock provider 只作为本地开发、模型不可用和现场兜底路径；P0 验收不以 mock provider 代替真实模型调用。
- 模型失败时保留可读 failure reason。
- 剧本失败时使用模板化脚本。
- 现场演示同时提供实时生成路径和预生成样例路径。

## 6. 数据与任务模型

P0 主表：

```text
Product
Asset
GenerationJob
Script
StoryboardShot
```

`improvementHints` 可先保存在 `Script.rawJson` 中，作为创作蓝图的一部分；等 P1 做质量诊断统计或提示效果分析时再拆独立表。

`Script.version` 仅在已冻结蓝图之后的再次修改中递增；视频生成前的重新生成覆盖当前草稿蓝图。

P0 成片任务状态机：

```text
queued
  -> media_generating
  -> completed

任意阶段 -> failed
```

P1/P2 扩展实体：

```text
MaterialSlice
MaterialEmbedding
CreativeTemplate
ReferenceVideoAnalysis
ConversionMetric
ExperimentVariant
```

Qdrant point 不作为事实源，只保存：

```text
entityType
entityId
productId
tags
source
createdAt
minimal searchable text
```

搜索时：

```text
Qdrant search
  -> 返回 entityId
  -> Postgres hydrate 完整业务对象
```

## 7. 第三方库集成计划

### P0 直接采用

```text
React Hook Form + Zod
TanStack Query
Fastify
BullMQ
Pino
官方 openai SDK
Zod validation + repair retry
```

说明：P0 不把 MinIO/S3 作为必需依赖。若时间不足，素材上传使用 server 本地文件目录；若后续需要公网持久化、presigned upload 或多实例部署，再把本地存储替换为 MinIO/S3-compatible adapter。

### P0 可选但高价值

```text
Uppy
fastify-type-provider-zod
bull-board
OpenAI Agents SDK trace spike
```

### P0+ / P1

```text
Qdrant
bge-m3 embedding sidecar
@qdrant/js-client-rest
Recharts
Langfuse 或 OpenTelemetry
presigned upload
```

### 暂缓

```text
Vercel AI SDK Core
LangGraph
BAML
Remotion as render engine
ffmpeg.wasm
WebCodecs
MoviePy
Milvus
```

## 8. 关键修正后的取舍

### AI runtime

修正后的建议：

```text
P0/P1 先在 packages/ai 中封装窄接口 runtime：
优先使用官方 openai SDK 调用 Ark/OpenAI-compatible endpoint；
输出统一经过 packages/shared 的 Zod schema 校验，并保留一次 repair retry；
同时做最小 OpenAI Agents SDK spike，验证 trace 对 Ark 调用是否可用；
只有明确需要多 provider 抽象、streamObject、AI SDK UI 或 provider registry 时，再引入 Vercel AI SDK Core。
```

### 检索

修正后的建议：

```text
Postgres 是业务事实源；
Qdrant 是向量检索索引；
bge-m3 是本地 embedding model，通过 apps/embedding sidecar 暴露 HTTP API；
不同时维护 pgvector 和 Qdrant 两条向量主路径。
```

模型位置：

```text
models/bge-m3/                 # 项目内约定，gitignored
BGE_M3_MODEL_PATH=...          # 实际路径
/models/bge-m3                 # Docker 内只读挂载路径
```

## 9. 设计论据与取舍

这套计划优先保证 P0 端到端可演示，而不是追求完整视频中台。

保留 `apps/server` 内嵌 processors，是为了减少部署物和联调面；保留 `packages/ai` 是为了收口最高风险的模型调用；不抽 `packages/video` 是因为 Seedance 12s 整片生成已经满足 P0/P1；不抽 `packages/ui` 是因为当前只有一个前端应用。

检索侧升级为 Qdrant 双库架构，是因为本地 bge-m3 和 Qdrant 已经具备，原报告“先 Postgres FTS / pg_trgm”的前提已经变化。但检索仍应作为 P0+ 或 P1 worktree，不阻塞主链路。

AI 侧优先官方 `openai` SDK，是因为当前目标是 Ark/OpenAI-compatible 的受控 workflow，不是多 provider SDK 抽象。OpenAI Agents SDK 只作为 trace spike 进入 `packages/ai` 内部，不让 agent 概念侵入业务模块。

## 10. 后续演进

P0 完成后，优先演进：

- 分镜轻编辑：改某个 shot，再重新生成整条 12s 视频。
- 生成 trace：prompt version、model call、raw output、parsed output、repair retry。
- 素材检索：bge-m3 + Qdrant + Postgres hydrate。
- Mock 数据看板：Recharts 展示生成因子与效果指标。
- 失败重试：任务级 retry、模型级 repair、用户级 retry。

P2 再考虑：

- 独立 `apps/worker`
- `packages/video`
- 服务端 FFmpeg
- LangGraph agent orchestration
- A/B 自动出片与归因
- 合规审核流
- 完整 CI/CD 和可观测性平台
