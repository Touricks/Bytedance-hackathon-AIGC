# arc_v2 — 架构设计与仓库拓扑

> 电商 AIGC 短视频生成系统（`ecommerce-aigc-video`）。本文描述**当前 main 分支真实代码**的架构与仓库拓扑，作为 `erd.md` / `interface.md` / `openapi.yaml` 的总纲。
>
> 术语遵循 `CONTEXT.md`：创作工作目录（workspace）、上传素材（material）、创作蓝图 / 剧本（script）、分镜（shot）、成片（final video）。

---

## 1. 一句话定位

商家上传商品素材 → AI 构建管线（物料解读 → 产品 brief → 故事板 → 分镜提示）→ **逐分镜管线（per-shot pipeline）**（图像提示 → 候选图 → 视频脚本 → 候选视频 → 选定）→ ffmpeg 拼接出一条成片，并可发布到渠道/KOL 并回收指标。

技术基座：**Fastify 5 + Zod + BullMQ + 原生 `pg`（PostgreSQL）+ ffmpeg**，AI 调用走火山引擎 **Ark（文本/Seedream 图像）** 与 **Seedance（视频）**。

> ⚠️ 注意：本系统**不是 NestJS**。没有装饰器/DI/Guard/Pipe，“controller” 是向 Fastify 实例注册路由的普通函数，校验靠每个 handler 内显式 `schema.parse()`。

---

## 2. 仓库拓扑（Repository Topology）

pnpm 9 workspace + Turbo 2。`pnpm-workspace.yaml` 收录 `apps/*` 与 `packages/*`。

```
Bytedancehack/
├── apps/
│   ├── server/                # @aigc-video/server  — Fastify API + BullMQ worker + Postgres
│   │   └── src/
│   │       ├── main.ts        # 进程入口：assert ffmpeg → 注册 generation_v2 processor → 启动 worker → listen
│   │       ├── app.ts         # buildServer()：db.initialize()、CORS、multipart、注册各模块路由
│   │       ├── common/        # config.ts(env)、errors.ts(toHttpError)、image-validation.ts
│   │       ├── db/
│   │       │   ├── client.ts          # pg Pool；PostgresDbAdapter(V1) + PostgresDb2Adapter(V2, = db.db2)
│   │       │   └── schema/schema.sql  # 权威 DDL，启动时幂等执行（即“迁移”机制）
│   │       └── modules/
│   │           ├── material/   # 商品图登记 / base64 上传（legacy 适配器）
│   │           ├── pipeline/   # GET 管线契约元数据
│   │           ├── script/     # 旧 v1 script 查询
│   │           ├── workspace/  # 线性构建管线（draft→…→shotprompt_approved），最大模块(~2k 行)
│   │           ├── shot/        # 逐分镜状态机：图像提示/候选/选定 + 视频脚本/候选/选定
│   │           ├── generation/  # createImageBatch/createVideoBatch/createFinalCompose + 三个 worker + ffmpeg
│   │           ├── campaign/    # 成片发布 + 指标回收
│   │           ├── trace/       # trace_events 读写
│   │           └── job/job.queue.ts  # BullMQ 队列/Worker + 在途任务恢复
│   └── web/                   # @aigc-video/web    — React 19 + Vite 6 前端
│       └── src/
│           ├── main.tsx                       # 基于 pathname 的手写路由（无 router 库）
│           ├── lib/api/client.ts              # API 基址解析 + fetchJson/postJson + 各资源 API 模块
│           └── features/workspace/Focus/      # FocusRouter 按 ShotStatus 驱动逐分镜 UI 步骤
├── packages/
│   ├── ai/                    # @aigc-video/ai     — Provider 抽象 + agent/builder 工作流 + prompts + trace
│   ├── shared/                # @aigc-video/shared — 领域类型、zod 契约、队列契约、shotprompt 编译器
│   └── config/                # @aigc-video/config — eslint/prettier/tsconfig 预设（纯工具配置）
├── infra/docker-compose.yml   # postgres:16 / redis:7 / minio
├── scripts/                   # clear-postgres.mjs / clear-redis.mjs / reset-dev-session.mjs
├── docs/                      # 本目录（arc_v2/erd/interface/openapi + reference/ 等）
└── CONTEXT.md                 # 领域语言权威表
```

### 2.1 工作区依赖图（who imports whom）

```
config        （叶子，仅 lint/ts 工具预设，无运行时依赖）

shared  ──────────────►  zod
ai      ──────────────►  shared,  @openai/agents,  openai,  zod
web     ──────────────►  shared            （仅共享类型，不碰 ai / server）
server  ──────────────►  shared,  ai
```

- `shared` 是**契约枢纽**，被所有人引用。
- `ai` 仅被 `server` 消费。
- `web` 与后端只通过 `shared` 的类型 + HTTP 契约耦合，**不直接 import 后端代码**。
- 无循环依赖。Turbo `build` 任务 `dependsOn: ["^build"]`，按依赖图拓扑构建；`dev` 为 persistent 任务。

### 2.2 各 workspace 角色

| Workspace | 包名 | 角色 |
|---|---|---|
| `apps/server` | `@aigc-video/server` | Fastify API + BullMQ worker + Postgres 访问。唯一持有业务事实（Postgres）与文件落盘。|
| `apps/web` | `@aigc-video/web` | React 19 + Vite 前端；TanStack Query 轮询 + Zustand 状态 + 手写 pathname 路由。|
| `packages/ai` | `@aigc-video/ai` | Provider 抽象（text/image/video）+ Ark/Seedance 集成 + `@openai/agents` 驱动的两个 agent + builder 工作流 + `.md` prompts + 管线契约登记 + trace。|
| `packages/shared` | `@aigc-video/shared` | 领域实体/枚举、artifact zod 契约、队列名与 job payload 类型、`compileShotPrompt` 确定性编译器、阶段文案常量。|
| `packages/config` | `@aigc-video/config` | 仅 eslint/prettier/tsconfig 预设。**不做 env 校验**（env 解析在 server 与 packages/ai 各自实现）。|

---

## 3. 运行时拓扑与进程模型

```
┌────────────┐   HTTP (JSON / multipart)   ┌──────────────────────────────────────┐
│  apps/web  │ ──────────────────────────► │            apps/server (Fastify)        │
│  React/Vite│ ◄────────────────────────── │  全部路由硬编码 /api 前缀，无 URL 版本号  │
└────────────┘     轮询 batch / 流式 trace   │                                        │
                                            │   buildServer(): db.initialize() →     │
                                            │   注册 material/pipeline/script/        │
                                            │   workspace/shot/generation/campaign/   │
                                            │   trace 模块路由                         │
                                            └───────────┬──────────────┬─────────────┘
                                                        │ enqueue       │ 直接调用
                                                        ▼               ▼
                                         ┌──────────────────────┐  ┌──────────────────────┐
                                         │  BullMQ queue         │  │  packages/ai          │
                                         │  generation_v2        │  │  Ark text(brief/      │
                                         │  (USE_REDIS_QUEUE!=    │  │  storyboard/shotprompt│
                                         │   true 时退化为         │  │  /feedback)、         │
                                         │   setTimeout 内联执行)  │  │  agent(image-prompt / │
                                         └──────────┬────────────┘  │  video-script)         │
                                                    │ 三类 job        └──────────────────────┘
                          ┌─────────────────────────┼─────────────────────────┐
                          ▼                          ▼                         ▼
                generate_images           generate_videos           compose_final_video
                image.worker.ts           video.worker.ts           final-compose.worker.ts
                → generateImagesWithArk    → generateVideoWithSeedance → ffmpeg concat
                  (Seedream 同步)            (异步 task + 轮询)            → final.mp4
                          │                          │                         │
                          └──────────────┬───────────┴─────────────────────────┘
                                         ▼
                       Postgres(业务事实) + 本地 FS <workspace>/.daireel/(媒体产物)
```

进程模式由 `SERVER_RUNTIME` 控制：`all`（默认，API+Worker 同进程）/ `api`（仅 API）/ `worker`（仅消费）。
- 启动时 `main.ts` 先 `assertFfmpegAvailable()`，注册 `generation_v2` 单一 processor（按 `data.kind` 分派到三个 worker），再 `startGenerationV2Worker()`。
- API 模式额外执行 `recoverInflightGenerationJobs()`：把 `generation_jobs` 中 PENDING/RUNNING 且 `queue_job_id` 为空的任务重新入队，并把 RUNNING 的 batch 重置为 PENDING。Worker 幂等：batch 非 PENDING 时直接返回。

---

## 4. 两套数据世代（V1 builder vs V2 per-shot）

代码里并存两代表结构，**V2（复数表名）为当前主线**：

- **构建管线（V1 builder，仍在用）**：`workspace` 模块的线性状态机（`draft → materials_ready → brief_proposed/approved → storyboard_proposed/approved → shotprompt_proposed/approved`）。每一步在 `MODEL_MODE==="real"` 时调用 Ark 文本 provider，否则走 `packages/shared` / `packages/ai` 的确定性 builder，把结果 upsert 进 `workspace_artifact`（按 `(workspace_id, artifact_type)` 唯一）。
- **桥接点**：`shotprompt/approve` 触发 `seedShotsFromShotPrompt()`——在事务里清空并按 `ShotPromptArtifact.shots[]` 重建 `storyboard_shots` + `shot_asset_refs`，由此进入 V2。
- **逐分镜管线（V2 per-shot，主线）**：每个 shot 独立走「图像提示 artifact → 图像 batch/候选 → 选图 → 视频脚本 artifact → 视频 batch/候选 → 选视频」的状态机（见 `shot.state.ts` 的 `ShotStatus` 枚举），全部 shot 选定后允许 `final-videos` 拼接成片。
- `db.initialize()` 每次启动都 `drop` 掉 V1 遗留表 `storyboard_shot` / `generation_job` / `workspace_video_archive`，仅保留共享表 `product` / `asset` / `creative_workspace` / `script` / `workspace_artifact` 与全部 V2 复数表。

详见 [`erd.md`](./erd.md)。

---

## 5. AI Provider 层（packages/ai）

- **按任务键分流的 Provider 配置**（`providers/provider-config.ts`）：`resolveTextProviderConfig` / `resolveImageProviderConfig` / `resolveVideoProviderConfig`，各自从 `TEXT_* / IMAGE_* / VIDEO_*`（并向 `AI_*_` 与 `ARK_*` 回退）读取 `apiKey / endpointId / baseURL`，缺失则返回 `null`，对应 worker 抛 `<task> provider not configured`。`isRealProviderMode()` ⇔ `MODEL_MODE==="real"`。
- **文本**：`ark-text.provider.ts` — OpenAI 兼容 Chat Completions（用 `openai` SDK），支持 `json_schema` 响应格式。
- **图像**：`ark-image.provider.ts` — Seedream 同步 `POST images/generations`；`count>1` 用 `sequential_image_generation`；支持参考图（图生图）；宽高比→尺寸映射（9:16→1600×2848、16:9→2848×1600、1:1→2048×2048）。
- **视频**：`seedance-video.provider.ts` — 异步 `POST contents/generations/tasks` + 轮询 `GET .../tasks/{id}`（默认 10s × 20 次）；用 `first_frame`/`last_frame` 角色拼 `content[]`；`durationSec` 限 4–12。
- **Agent**（`@openai/agents` v0.0.5）：`storyboard-image-prompt.agent.ts`、`video-shot-script.agent.ts`，分别绑定 zod `outputType` 与 `prompts/*/v1.system.md`。mock 模式返回确定性、schema 合法的对象。
- **契约登记**：`contracts/pipeline.contracts.ts` 的 `getPipelineContracts()` 暴露每个步骤（material_intake / product_brief / storyboard / shotprompt / feedback_route / video_export）的 provider、prompt builder、输入输出 JSON schema、目标 artifact，可经 `AIGC_VIDEO_PIPELINE_CONTRACT_OVERRIDES` 覆盖。由 `GET /api/pipeline/contracts` 暴露。

---

## 6. 存储与队列基座

| 关注点 | 现状 |
|---|---|
| **业务事实** | PostgreSQL（`DATABASE_URL` 必填，唯一事实源）。原生 `pg`，手写参数化 SQL；无 ORM、无迁移工具——`schema.sql` 启动幂等执行兼作迁移。|
| **队列** | BullMQ over ioredis，队列名 `generation_v2`（旧 `generation` 仅保留常量）。`USE_REDIS_QUEUE!=="true"` 时退化为 `setTimeout(0)` 内联执行，**无需 Redis**。Worker 并发 = `maxImageBatchSize + maxVideoBatchSize`（默认 16）。Redis **仅作队列**，无应用级缓存。|
| **媒体产物** | 当前实际全部落本地 FS，挂在工作目录 `<workspace>/.daireel/` 下（materials / generated-images / videos / final / trace）。|
| **对象存储** | infra 起了 MinIO，`workspace_storage_bindings` 与 `*_candidates.object_key` 已为 S3 预留字段，但**代码未接 S3 SDK**——非 LOCAL 绑定时文件操作抛 `STORAGE_NOT_LOCAL`。|
| **可观测** | 双轨 trace：Postgres `trace_events` 表（结构化、可查询）+ `<ws>/.daireel/trace/events.jsonl`（工作区本地 append-only 日志）。|

落盘约定与 URL：图像 `.daireel/materials/generated-images/<batch>-<cand>.<ext>` → `/api/workspaces/{ws}/materials/generated-images/<file>`；视频 `.daireel/videos/<batch>-<cand>.<ext>` → `/api/workspaces/{ws}/videos/<file>`；成片记录在 `final_video_jobs.local_path/local_url`。详见 [`erd.md`](./erd.md) 第 4–5 节。

---

## 7. 端到端主流程（一条成片的生命周期）

1. **建/开工作目录** — `POST /api/workspaces` 或 `/api/workspaces/init`：写 `creative_workspace` + LOCAL `workspace_storage_bindings`，落 `.daireel/workspace.json` manifest。
2. **上传素材** — `POST /api/workspaces/materials`（multipart 或 base64）→ `.daireel/materials/`，登记 `asset` 行。
3. **构建管线** — `material-intake` → `brief/propose`+`brief/approve` → `storyboard/propose`+`storyboard/approve` → `shotprompt/compile`+`shotprompt/approve`。real 模式调 Ark 文本，否则确定性 builder，结果进 `workspace_artifact`。
4. **播种分镜** — shotprompt 批准触发 `seedShotsFromShotPrompt()`，生成 `storyboard_shots`（每分镜一行 DRAFT）。
5. **逐分镜图像** — `image-prompts/propose`（agent）→ `image_prompt_artifacts`（ACTIVE）；`POST .../image-batches`（须带 `Idempotency-Key`）→ 写 `image_generation_batches`+`generation_jobs`，shot→`IMAGE_GENERATING`，入队 `generate_images`。
6. **图像 worker** — `generateImagesWithArk` → `image_candidates`，batch→SUCCEEDED/PARTIAL/FAILED，shot→`IMAGE_CANDIDATES_READY`。前端轮询 batch。
7. **选图** — `.../image-candidates/select` → `selected_shot_images`，shot→`IMAGE_SELECTED`。
8. **逐分镜视频** — `video-scripts/propose`（agent，须所有 shot 已选图）→ `video_script_artifacts`（关联选中图 + 邻帧）；`POST .../video-batches` → `generate_videos` → `generateVideoWithSeedance` → `video_candidates`，shot→`VIDEO_CANDIDATES_READY`。
9. **选视频** — `.../video-candidates/select` → `selected_shot_videos`，shot→`VIDEO_SELECTED`。全部选定后 `shot-workflow-status.canComposeFinalVideo=true`。
10. **成片合成** — `POST /api/workspaces/:id/final-videos`（须 `Idempotency-Key`）→ `final_video_jobs`（有序 `source_shot_video_ids`）入队 `compose_final_video`；worker 下载各候选视频→ffmpeg concat（libx264/aac/+faststart）→ `final.mp4`，写 manifest+hash，`local_url=/api/workspaces/{ws}/final-videos/{id}/file`。
11. **发布与指标**（可选） — `campaign-publications` 登记渠道/KOL 发布，`.../metrics` 回收曝光/点击/转化/花费并算 CTR。

---

## 8. 关键横切约定（写接口/契约时必读）

- **路由前缀**：所有业务路由硬编码 `/api`，**URL 无版本号**（“v2” 仅体现在内部命名与表名）。
- **响应包络**：多数返回 `{ data: ... }`，但**不一致**（部分 handler 返回裸对象）。`interface.md` / `openapi.yaml` 按各 handler 实际形态标注。
- **幂等**：`POST .../image-batches`、`.../video-batches`、`.../retry`、`.../final-videos` **必须带请求头 `Idempotency-Key`**，缺失返回 400 `IDEMPOTENCY_KEY_REQUIRED`。
- **鉴权**：**全站无鉴权**（hackathon 单租户）。
- **宽高比枚举**：固定 `["9:16","16:9","1:1"]`，默认 `9:16`。
- **错误**：`common/errors.ts` 的 `toHttpError` 把 `HttpError`→其状态码、`NotFoundError`→404、普通 `Error`→400，其余→500；不少 handler 直接抛错走 Fastify 默认 500。
- **遗留/未实现引用**：`nextAction` 提示里出现的 `/api/workspaces/video/generate`、`/api/jobs/:id` 属 V1 残留，当前代码**未实现**，不进 `openapi.yaml`。

---

## 9. 配置与本地编排

- 关键 env：`DATABASE_URL`(必填)、`SERVER_PORT`(3000)、`WEB_PORT`(5173)、`REDIS_URL`、`USE_REDIS_QUEUE`、`SERVER_RUNTIME`、`MODEL_MODE`(real/mock)、`TEXT_/IMAGE_/VIDEO_*`(+`ARK_*` 回退)、`DEFAULT/MAX_IMAGE/VIDEO_BATCH_SIZE`、`UPLOAD_DIR`+`UPLOAD_URL_PREFIX`(legacy 商品图上传)、`ALLOW_TEST_CLEANUP`。
- `infra/docker-compose.yml`：postgres:16(`aigc_video`,5432)、redis:7(6379)、minio(9000/9001, bucket `aigc-video`)。
- 脚本：`pnpm db:clear` / `redis:clear` / `reset:dev`（停端口监听→清 PG 业务表→清 `bull:generation*` 队列→`pnpm dev`；不删 `.daireel/trace`、uploads、MinIO 内容）。
