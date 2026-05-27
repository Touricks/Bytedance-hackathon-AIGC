# AIGC 电商视频生成器开源加速调研报告

## 执行摘要

这个项目最快的推进路径，**不是**去寻找一个完整的开源“电商 AI 视频生成器”然后 fork。真正实用的捷径，是在你们已经搭好的技术栈之上，**组合少量成熟、TypeScript 友好的构件**：当前仓库已经采用 monorepo 布局，前端有 React、Tailwind、`@dnd-kit/*`、TanStack Query，后端有 Fastify、BullMQ、Redis、MinIO、Swagger 和 Zod。因此，最高杠杆的动作是**继续强化现有选择**，只新增那些能减少自研 UI 或基础设施工作的工具。

最值得立即采用的**七个工具或模式**如下。**Uppy** 可以提供生产级的商家素材上传 UI，带预览和断点续传能力，避免手写文件上传体验。**React Hook Form + Zod** 是最快构建商家表单、并与共享 DTO 保持一致的方式。**继续保留 dnd-kit 和 TanStack Query**，因为它们已经在仓库中，而且正适合可排序分镜卡片和任务状态轮询。**BullMQ + bull-board** 能提供持久化异步编排，以及一个即时可用的队列管理 UI，用来排查 demo 失败。**fastify-type-provider-zod** 可以把 Zod 转成 Fastify 请求校验和 OpenAPI 文档，正好贴合现有 Fastify 栈。**Vercel AI SDK Core** 是 Node/TypeScript 生态里做结构化对象生成最干净的选择，前提是能使用 Node 22；否则，在现有 `packages/ai` 周围写一层轻量 Ark provider adapter 会更稳。**Recharts** 是最快搭建 mock 数据看板的选择。

同样重要的是，哪些工具**现在不应该引入**。我会避免现在引入 **LangGraph**，除非你们确实需要多 Agent 编排、持久化执行或 human-in-the-loop 控制，因为当前核心链路仍然基本是线性的。我会避免 **ffmpeg.wasm**，因为它明确标注为 experimental，而且明显慢于原生 FFmpeg。我会避免 **WebCodecs**，因为它非常底层，并且在主流浏览器中还不属于 baseline 能力。我会避免 **MoviePy**，因为它会把第二套 Python runtime 引入 Node-first 的 monorepo，而你们 P0/P1 有意不解决那些问题。我也会暂时避免 **Milvus**，因为它是为大规模分布式向量检索构建的，会给三人黑客松团队增加不必要的运维重量。也不建议把 **Remotion** 变成 P0 渲染引擎；它很适合 React 驱动的视频合成，但你们当前产品约束是一次 Seedance 整片调用，而且 Remotion 仓库本身提示了特殊 license，在某些情况下可能需要公司 license。

## 与当前架构最匹配的立即建议

对**前端**而言，当前仓库方向已经正确：`@dnd-kit/*` 可以承担可排序交互，TanStack Query 已经安装好用于服务端状态同步，Tailwind 也已经是样式基础。因此，不应在黑客松窗口期把时间花在替换 Redux、XState 或新的设计系统上。更好的做法是：为素材入库页面新增 **Uppy**，用 **React Hook Form + Zod** 管理上传元数据、商品表单和剧本生成参数，并刻意保持分镜编辑简单：先做可重排列表或卡片看板，而不是完整 NLE 时间线。预览/导出方面，因为当前流程每次请求生成一条短视频，P0 用普通 video player 加元数据侧编辑就足够；价值在编排和商家工作流，不在本地渲染复杂度。

对**后端**而言，应把 **BullMQ 视为异步传输层**，把 **Postgres `GenerationJob` 视为产品层事实来源**。BullMQ 官方文档已经提供了清晰的 job 生命周期、进度更新、flows 和 queue events；可以使用这些能力，但用户可见的状态、当前步骤、重试次数和错误摘要应该持久化到 Postgres，这样轮询 API 不会只依赖 Redis 内部状态。对你们最实用的模式是：`jobId = generationJob.id`，processor 内部调用 `job.updateProgress({ step, percent, traceId })`，用 `QueueEvents` 接生命周期钩子，并对远程视频生成 job 设置**有界并发**，避免某个商家的失败任务拖住整个 server-embedded worker。在受保护路由上挂载 **bull-board**，让团队能在 demo 期间检查 stuck、delayed、retried 和 failed jobs。

对**请求校验和 API 文档**而言，最合适的方向是更坚定地走 **Zod-first contracts**。你的 server 已经依赖 Fastify、`@fastify/swagger` 和 Zod，而 `fastify-type-provider-zod` 正是为把 Zod schema 接到 Fastify 校验与 Swagger 生成而设计的。这样可以让 `packages/shared` 中的 DTO 成为单一 schema 来源，让 `apps/server` 获得类型化请求/响应契约，并在后续可选生成 web app client types。这尤其重要，因为 P0 对象 `Product`、`Asset`、`GenerationJob`、`Script`、`StoryboardShot` 正是团队快速推进时最容易发生结构漂移的 payload。

对**文件上传和对象存储**而言，建议采用两阶段方案。**P0** 阶段，使用 `@fastify/multipart` 通过 server stream 上传到 MinIO/S3 即可，摩擦小；该插件支持 stream mode、per-request limits，以及在现有 Fastify 栈中处理 multipart。**P1** 阶段，再切到 presigned uploads，让大素材视频从浏览器直接进入对象存储，Node server 只负责签发 signed URL 和记录元数据。MinIO JS client 明确面向 S3-compatible object stores，AWS v3 presigner 也有第一方文档说明 signed upload URLs，因此这条路径不会把你们锁死在某个云厂商上。

对**日志和可观测性**而言，不要再引入另一套 logger。Fastify 开启 logging 时本身就使用 **Pino**，而 Pino 自身定位就是低开销、高吞吐 JSON logging。应增加结构化 child loggers，带上 `requestId`、`jobId`、`productId`、`merchantId` 和 `traceId`；之后再用 **OpenTelemetry JS** 做分布式 traces，因为 OTel vendor-agnostic，并支持 Node 自动 instrumentation。AI 侧 traceability，例如 prompt versions、model calls、parsed output、retries，**Langfuse** 是最强的开源补充，但它是 P1 工具，不是 P0 工具，因为它会额外引入一个服务和 UI。

## AI、Agent、检索与媒体决策

你们的模型供应商选择其实是隐藏优势：**Volcano Ark 与 OpenAI 兼容**，而 AI SDK 生态明确支持 OpenAI-compatible providers。这意味着你们**不需要**为了获得可靠结构化输出而引入重型 Agent 框架。最干净的设计是：在 `packages/shared` 定义 Zod schemas，在 `packages/ai` 定义 prompt templates 和 normalizers，通过 **Vercel AI SDK 的 OpenAI-compatible provider** 或轻量 custom adapter 调用 Ark，并在任何响应成为 `Script` 或 `StoryboardShot` 记录之前进行校验。一个务实 caveat 是，当前 AI SDK 文档写明本地开发需要 **Node 22+**；如果 runtime 或部署目标低于这个版本，黑客松阶段不应强行升级，而应在 `packages/ai` 中实现窄接口 Ark client，同时保留相同的 schema/repair loop。

对**结构化 JSON 可靠性**而言，一个朴素流程最稳：先按严格 schema 生成 object，立刻做 Zod validation，如果解析失败做一次 repair pass，并将原始模型结果和 normalize 后的 parsed object 都存下来便于调试。AI SDK Core 支持 schema-constrained object generation；LangChain JS 也支持基于 Zod 和 JSON Schema 的 structured output。不过，在你们的架构里，**LangChain 只有在开始需要 tools、retrievers 或 provider-agnostic chains，超出简单 request/response workflow 时才值得引入**。当前剧本生成和分镜生成足够确定，轻量方案更好。**LangGraph** 更靠后：它自己的文档将其定位在 durable execution、memory 和 human-in-the-loop agent orchestration 上，匹配 P2 的“Agent 编排”目标，而不是 P0/P1 的交付压力。**BAML** 在 schemas、retries 和 prompt versioning 成为真实痛点时很有潜力，但它会增加一套新的 DSL/codegen workflow，day one 不需要。

对**检索**而言，与当前架构最匹配的答案是 **Postgres-first**。`pgvector` 可以把向量与 products、assets、tags、jobs 放在同一个 system of record 中，同时保留 ACID 语义、joins 和普通 Postgres 运维习惯。对三人团队来说，这通常比早早启动一个专用向量服务更好。如果你们还没有稳定 embedding 模型，也仍然可以在 P0 交付可用检索：把 LLM 生成或商家填写的 tags 存在 `jsonb`，构建 generated search column，并用**全文检索**和 **`pg_trgm`** 做模糊查找。Postgres 文档直接支持这些能力。当 tagging surface 稳定后，P1 再迁移到 `pgvector`。只有当需要更强 payload filtering、hybrid lexical+dense retrieval，或向量检索开始主导查询模式时，才考虑 **Qdrant**。在真正需要分布式规模之前，避免 **Milvus**。对 **LanceDB** 也要谨慎：它对 embedded multimodal search 很有吸引力，也支持 TypeScript，但它偏 local/file-oriented 的运维模型与 Postgres-centric system-of-record 不够一致，而且 JS 路径近期关于 concurrent writers 的 open issues 对 server-backed transactional app 是真实警讯。

对**媒体**而言，最重要的结论是：当前产品目标已经移除了大部分构建本地媒体管线的理由。Seedance 官方材料强调 multi-shot video generation 和基于文本或图片输入的 whole-video generation，这正好符合你们“一次 12s 整片调用”的约束。因此 P0/P1 应把精力放在预览、进度和导出体验上，而不是 FFmpeg-based composition。若后续需要字幕、BGM fallback 或轻量 muxing，可以增加**服务端原生 FFmpeg**，由 Node 调用；FFmpeg 官方文档和 README 已覆盖 multiplexing、filtering、subtitle handling 以及 multiple inputs/outputs。相比之下，**ffmpeg.wasm** 仍标注为 experimental，且其性能文档也说明它不如原生 FFmpeg。**WebCodecs** 很强，但非常底层，并且还不是所有主流浏览器的 baseline。**MoviePy** 是成熟的 Python 自动化视频库，但除非你们明确要新增 media microservice，否则它不是这个 Node-first 系统的正确 runtime 选择。**Remotion** 应视为未来用于模板化片头片尾、字幕叠加变体或 storyboard preview 实验的层，而不是 P0 的核心引擎。

## 分阶段建议

**P0 应优先保证端到端 demo 成功，而不是架构纯粹性。** 我会保持当前 monorepo 形态和核心技术栈，新增 **Uppy** 做商家素材上传，新增 **React Hook Form + Zod** 做上传/商品/剧本表单，继续使用现有 **dnd-kit** 看板 UI 做分镜排序，继续使用 **TanStack Query** 做 job status 轮询，用 **fastify-type-provider-zod** 正式化 server contract，并接入 **BullMQ progress + bull-board**，让所有人都能看到系统在做什么。AI 侧，如果 Node 22 可用，就用 AI SDK Core 做 **schema-validated structured outputs**；否则，用一层轻量 Ark client 加 Zod validation 和一次 repair retry。数据侧，除非 embedding 模型已经 ready，否则**不要**加向量；先用 tags + Postgres FTS + `pg_trgm`。

**P1 应加固 demo 路径，并补上用户真实会触碰的功能。** 这个阶段适合引入 **presigned object-storage uploads**、用于 embedding search 的 **pgvector**、用于模型调用 trace 和 prompt versioning 的 **Langfuse**、用于 mock 数据看板的 **Recharts**，以及可选的 **Remotion Player** 或 reference-based lightweight editor view，用来增强 storyboard 或 per-shot preview，而不是过早接管渲染。**Zustand** 也可以在这个阶段变得有意义，但只有当 creation editor 出现足够多跨 panel 的 client state、组件局部 state 变痛时才需要；否则新增全局 client store 可能没有必要。

**P2 才适合引入更多系统，因为它们支持生产化，而不是 demo 观感。** 这包括用于字幕 muxing 和 BGM fallback 的**服务端 FFmpeg**，当检索语义超过 Postgres 能力时引入 **Qdrant**，作为更广泛 trace/export 标准的 **OpenTelemetry**，当你们真的实现 agent orchestration 或 human review nodes 时引入 **LangGraph**，以及当归因或 A/B 可视化需要 Recharts 难以快速覆盖的 Sankey/funnel/高级交互时引入 **Apache ECharts**。真正的合规审核流也应该在这个阶段考虑，因为在此之前更大的风险是无法完成生成主链路。

## 工具评估矩阵

下表刻意偏向**适合当前仓库和时间线**的工具。对于 GitHub 抓取结果中没有清晰 SPDX 标记的仓库，我在 license 字段写为 **“repo LICENSE”**，而不是猜测。

| 名称 | 官方来源 | License | Stars 与维护情况 | 主要能力 | 集成位置 | TS / Node / React 适配 | 复杂度 | 风险与替代方案 |
|---|---|---:|---|---|---|---|---|---|
| Uppy | Repo / docs | MIT | 30.8k；最新 release 2026 年 3 月 | 多文件上传、预览、断点续传、React 组件/headless hooks | `apps/web/src/features/assets` | 非常适合 React + TS | 中 | P0 上传加速器。替代：普通 file input 或 `react-dropzone`，如果想保持更小 surface area。 |
| React Hook Form | Repo / release | MIT | 44.7k；2026 年 5 月仍活跃发布 | 高性能表单，支持 Zod/Yup/AJV | `apps/web/src/features/*/forms` | 非常适合 React + TS | 低 | 很适合商家表单。替代：Formik，但 RHF 更轻。 |
| dnd-kit | Repo / release / already in repo | MIT | 17.1k；2026 年 4 月 release | 可访问、可扩展的拖拽和排序 UI | `apps/web/src/features/creation` | 非常适合 React + TS | 低 | 已安装。P0 不要换另一套拖拽栈。 |
| TanStack Query | Repo / release / already in repo | MIT | 49.5k；2026 年 5 月 release | 服务端状态缓存、轮询、mutations、retries | `apps/web/src/lib/query`、`features/jobs` | 非常适合 React + TS | 低 | 已安装。用它做 job polling，别自研 polling state。 |
| Recharts / Apache ECharts | Recharts repo / release；ECharts repo / release | MIT / Apache-2.0 | 27.2k 和 66.4k；2026 年都活跃维护 | 看板、KPI 卡片，后续高级归因可视化 | `apps/web/src/features/dashboard` | Recharts 对 React 很友好，ECharts 更强 | 低到中 | Recharts 是 P0 选择；ECharts 是 P2 高级归因和丰富视觉语法选择。 |
| BullMQ | Repo / docs / releases / architecture/docs already in repo server deps | MIT | 8.9k；2026 年 5 月 release | Redis-backed queueing、retries、progress、flows、lifecycle events | `apps/server/src/jobs` | 非常适合 Node + TS | 中 | 核心适配。用 DB-backed domain states；BullMQ 负责执行和进度传输。 |
| bull-board | Repo / adapters / release | repo LICENSE | 3.3k；2026 年 5 月 release | Queue inspector UI，带 Fastify adapter | `apps/server/src/admin/bull-board.ts` | 非常适合 Node + Fastify | 低 | 对 demo 和调试价值巨大。替代：BullMQ Pro UI，但这里没必要。 |
| fastify-type-provider-zod | Repo / Fastify Swagger integration / release | repo LICENSE | 580；最新 release 2025 年 9 月 | Zod 请求/响应校验，Fastify 与 Swagger transforms | `packages/shared/src/schemas`、`apps/server/src/routes` | 非常适合 Node + TS | 低到中 | 架构匹配度高。若担心 bus factor，可退回普通 JSON Schema generation。 |
| `@fastify/multipart` 与 presigned-upload 升级路径 | Multipart repo / release；S3 presigner docs；MinIO JS repo | MIT / Apache-2.0 / AWS docs | Multipart 542 stars；v10 2026 年 4 月；MinIO JS 活跃，8.0.7 于 2026 年 2 月 | 现在做 stream uploads，之后直传对象存储 | `apps/server/src/routes/uploads.ts`、`services/storage` | 非常适合 Node；浏览器通过 signed URL 上传 | 低到中 | 最好的分阶段路径。P0 server-streamed，P1 presigned。 |
| Vercel AI SDK Core | Repo / structured data docs / OpenAI-compatible docs / releases | repo LICENSE | 24.4k；2026 年 5 月非常活跃 | Provider-agnostic TS AI toolkit，结构化对象生成，OpenAI-compatible providers | `packages/ai/src/providers`、`workflows` | 若 runtime 兼容，非常适合 TS/Node | 中 | 如果 Node 22 可接受，是最佳 P0/P1 AI 层。fallback：轻量 Ark adapter + Zod validation。 |
| OpenTelemetry JS + Langfuse | OTel repo / vendor-agnostic docs；Langfuse repo / features / releases | repo LICENSE / repo LICENSE | 3.4k + 27.7k；2026 年 5 月都活跃 | 分布式 traces、AI observability、prompt/version management、eval hooks | `apps/server/src/observability`、`packages/ai/src/tracing` | 强 Node + TS 适配 | 中到高 | 非 P0 必需。P1 当 trace UI 有价值时引入 Langfuse；P0 保持 Pino logs。 |
| pgvector | Repo / Postgres release note / Postgres-compatible querying docs | repo LICENSE | 21.4k；成熟低波动 extension；README 当前安装 v0.8.2 | 在 Postgres 内做向量相似度检索，保留 joins 和 ACID | `apps/server/src/db`、`packages/shared` | 通过 Postgres client 很适合 Node | 中 | 当前架构默认最佳。替代：如果检索复杂或占主导，再考虑 Qdrant。 |
| Qdrant | Repo / overview docs | Apache-2.0 | 31.5k；大而活跃的 repo | 带 payload filtering 和 hybrid retrieval 的向量数据库 | 未来放入 `infra/`，不是 P0 | TS/Node client 生态不错 | 中到高 | 只有 pgvector 不够时再考虑。 |
| Remotion | Repo / releases / docs | Special Remotion license | 47.7k；2026 年 5 月 release | React 驱动的视频合成与渲染 | `apps/web` preview experiments 或未来 render service | React + TS 体验强 | 中到高 | 适合未来模板化变体，但不是当前 Seedance-first P0 的渲染重心。 |

**暂缓或避免的工具**

| 名称 | 官方来源 | License | Stars 与维护情况 | 主要能力 | 为什么现在不用 | 复杂度 | 更适合本项目的时机 |
|---|---|---:|---|---|---|---|---|
| LangGraph | Repo / docs / releases | MIT | 2.9k；2026 年活跃 | 带 memory 和 HITL 的 durable、controllable agent orchestration | P0 流程是线性的；现在引入 graph orchestration 概念成本大于收益 | 高 | P2 做 agent workflows 或 review gates 时再看 |
| BAML | Repo / features / releases | Apache-2.0 | 8.3k；2026 年 5 月仍有活跃 alpha releases | Schema-first prompt DSL，带 retries、streaming、generated clients | 有趣，但新 DSL/codegen loop 对黑客松团队太重 | 中到高 | 先用 TS 写 prompt；当 prompt estate 难管理时再引入 |
| ffmpeg.wasm | Repo / perf docs / core warning | MIT | 17.5k；活跃，但仍标注 experimental/相对 native FFmpeg 慢 | 浏览器端转码/编辑 | 对当前需求太慢太重；带来浏览器 CPU/内存压力，却没有产品收益 | 高 | 真需要媒体 muxing 时使用服务端原生 FFmpeg |
| WebCodecs | MDN / spec / compatibility note | Web standard | 标准化中，但低层且不是所有主流浏览器 baseline | 浏览器 encode/decode primitives | 对三人团队交付 demo 来说太底层 | 很高 | P0 用 `<video>`，后续服务端 FFmpeg |
| MoviePy | Docs / package page | MIT | 成熟 Python 工具；2026 年出现 2.2.1 package | Python 视频编辑自动化 | 与 monorepo runtime 不匹配；为 P0 没收益的问题新增 Python 运维面 | 中到高 | 保持 Node-first；以后需要时直接用 FFmpeg CLI |
| Milvus | Repo / docs / release notes | Apache-2.0 | 44.4k；2026 年 5 月 release | 为规模化构建的分布式向量数据库 | 当前规模和团队不需要这种运维面 | 高 | 先 pgvector，再 Qdrant |
| LanceDB | Repo / quickstart / concurrent-writer issue evidence | Apache-2.0 | 10.4k；2026 年活跃 | 带 TS 支持的 embedded/local multimodal retrieval | 对 local-first agent memory 很有吸引力，但不如 Postgres system-of-record 匹配，并发写入 profile 有警讯 | 中 | 现在用 pgvector；只有做 local-first multimodal 实验时再看 |

## 推荐的 Monorepo 集成映射与参考项目

下面的实现映射有意保守：它假设**不拆 worker microservice**，**P0/P1 不做 FFmpeg composition**，并且通过 Seedance 做**单次整片生成**。这与你们的 brief 和当前 repo 结构一致。

- `apps/web/src/features/assets`
  - `AssetUploader.tsx`：Uppy dashboard 或 headless uploader。
  - `AssetMetadataForm.tsx`：React Hook Form + Zod resolver，用于 tags、title、category、aspect ratio 和 upload validation。
  - `useCreateAssetUpload.ts`：TanStack Query mutation，对接 create-upload/init-upload 路径。

- `apps/web/src/features/creation`
  - `StoryboardBoard.tsx`：继续用 dnd-kit sortable cards 做 shot 顺序和简单 per-shot editing。
  - `ScriptEditor.tsx`：基于 RHF 的结构化剧本表单。
  - `PreviewPanel.tsx`：普通视频预览；当你们后续想要更丰富 storyboard preview 时，可以在 feature flag 后放 Remotion Player。

- `apps/web/src/features/jobs`
  - `useGenerationJobPolling.ts`：TanStack Query 轮询 `/generation-jobs/:id`。
  - `JobProgressCard.tsx`：从 API 渲染 `currentStep`、`percent`、`etaHint` 和 retry/failure details。
  - 暂时避免 SSE/WebSocket；P0 用 polling 已足够，也符合当前计划。

- `apps/web/src/features/dashboard`
  - `charts/`：P1 mock KPI charts 用 Recharts；把 ECharts 留给 P2 的 attribution/A-B funnels 或 Sankey-style 可视化。

- `apps/server/src/routes`
  - `uploads.ts`：先用 `@fastify/multipart` 做 server-stream uploads；后续增加 `POST /uploads/presign`。
  - `generation-jobs.ts`：读取 Postgres-backed job status，而不是只读 Redis state。
  - `openapi.ts`：一次性注册 Swagger + zod transforms。

- `apps/server/src/jobs`
  - `queues/generation.queue.ts`：queue constructors 和 naming。
  - `processors/generate-script.processor.ts`、`generate-storyboard.processor.ts`、`generate-video.processor.ts`：server-embedded BullMQ processors，对 video generation 设置低并发。
  - `events/generation.events.ts`：`QueueEvents` listeners，将 progress/failure/completion 镜像到 Postgres。
  - `admin/bull-board.ts`：受保护的 queue inspector route。

- `packages/shared/src/schemas`
  - `product.ts`、`asset.ts`、`generation-job.ts`、`script.ts`、`storyboard.ts`。
  - 增加共享枚举，例如 `GenerationJobStep` 和 `GenerationJobStatus`，以及 response DTOs 和 job payload schemas。

- `packages/ai/src`
  - `providers/ark.ts`：OpenAI-compatible Ark provider 或轻量 fallback adapter。
  - `prompts/script.ts`、`prompts/storyboard.ts`：版本化 prompt builders。
  - `workflows/generate-script.ts`、`workflows/generate-storyboard.ts`：structured-output + repair loop。
  - `observability/tracing.ts`：P0 no-op，P1 接 Langfuse hooks。

- `apps/server/src/search`
  - `asset-search.sql.ts`：P0 基于 Postgres FTS + `pg_trgm` 的 tag/keyword search。
  - `asset-vector-search.ts`：P1 pgvector query module。
  - tags 存 `jsonb`，search text 存 generated/stored column，embedding 后续再加。

- `infra/docker-compose.yml`
  - 保留 `postgres`、`redis`、`minio`。
  - 仅在 P1 compose overlay 中可选加入 `langfuse`，让 P0 环境保持简单。
  - 除非有证据表明 Postgres 不够，否则不要单独加 vector DB container。

关于“借鉴架构或组件，而不仅仅是概念”的问题，我找到的最有用开源参考**不是**完整 commerce-video generator，而是**具体交互参考**。`reactvideoeditor/free-react-video-editor` 是浏览器端 timeline 和 preview 交互模式的有用基础，但它明确是 simplified example，应该借鉴思路，而不是作为强依赖采用。`Storyboarder` 是更老但仍值得参考的 panel metadata、animatic-style workflows 和 shot-centric UX 案例；缺点是它是 desktop/Electron 产品，公开 release 较旧，因此同样应该作为 UX 参考，而不是代码依赖。换句话说，对你们项目来说，获胜策略是**围绕现有技术栈组装成熟 primitives**，而不是“fork 一个 turnkey AI ad generator”。

最终判断很直接。因为 Seedance 已经支持 multi-shot whole-video generation，因为 Ark 与 OpenAI 兼容，也因为当前仓库已经具备正确的 React/Fastify/BullMQ 骨架，最佳技术选择是构建一个**薄编排产品**：上传器 + schema-safe prompt workflows + queueed generation + polling UI + Postgres-first retrieval。在端到端主路径稳定之前，比这更激进的方案大概率会拖慢团队，而不是加速交付。
