# 电商场景 AIGC 带货视频生成系统

ByteDance Hackathon AIGC 电商带货视频项目。根 README 只做项目入口说明；架构、数据、接口与 prompt 链路的权威细节以 `docs/core/` 为准。

当前 V2 方向是：商家上传商品素材 -> 模块化 AI 链路生成并批准生效创作产物 -> 显式应用 shot prompt 创建分镜链路实例 -> 逐分镜生成候选图/候选视频并选择当前结果 -> ffmpeg 拼接成片。

> 注意：`docs/core/arc_v2.md` 描述迁移目标架构，`docs/core/prompt_workflow.md` 描述当前 prompt 组装和跨模块 artifact 流通，`docs/core/prompt_artifact.md` 描述 prompt 相关表字段与存储契约。开发时需要同时看这些文档，避免把目标态、流程态和字段契约混在一起。

## 新会话先读

1. [CONTEXT.md](./CONTEXT.md)
   领域词汇表。先确认“创作工作目录”“创作要求”“待审创作产物”“生效创作产物”“分镜链路实例”“分镜图选择”“分镜视频选择”等词的含义。

2. [AGENTS.md](./AGENTS.md)
   Agent 协作约定、测试命令、trace 查看方式和 worktree 约定。

3. [docs/core/arc_v2.md](./docs/core/arc_v2.md)
   V2 模块化目标架构。

4. [docs/core/erd.md](./docs/core/erd.md)
   V2 数据表、artifact、selection、shot set、trace 与 queue 关系。

5. [docs/core/interface.md](./docs/core/interface.md)
   V2 HTTP 业务接口和状态语义。

6. [docs/core/openapi.yaml](./docs/core/openapi.yaml)
   机器可读 OpenAPI 契约。

7. [docs/core/prompt_workflow.md](./docs/core/prompt_workflow.md)
   当前 prompt 组装流程、workspace module 到 per-shot agent 的 artifact 流通和调试入口。

8. [docs/core/prompt_artifact.md](./docs/core/prompt_artifact.md)
   当前 prompt 链路相关 artifact 字段、状态锚点和 provider 生成记录。

9. [docs/plan/](./docs/plan/) 与 [docs/test/](./docs/test/)
   迁移计划、模块提案、Postman/Newman 测试数据和验收说明。

## 仓库拓扑

```text
Bytedancehack/
├── apps/
│   ├── server/          # 后端：Fastify API、BullMQ worker、Postgres、文件落盘、ffmpeg compose
│   └── web/             # 当前前端：React/Vite
├── packages/
│   ├── ai/              # provider、agent/workflow、prompt assembly
│   ├── shared/          # Zod 契约、领域类型、job payload 类型
│   └── config/          # lint/format/tsconfig 预设
├── docs/
│   ├── core/            # 架构、ERD、接口、OpenAPI、prompt workflow/artifact
│   ├── plan/            # 迁移计划
│   └── test/            # Postman/Newman 测试资料
├── scripts/             # reset/dev/test orchestration
└── CONTEXT.md           # 领域语言
```

依赖方向：

```text
shared  -> zod
ai      -> shared, @openai/agents, openai, zod
web     -> shared
server  -> shared, ai
```

## V2 主链路

```text
workspace init / storage bind
  -> materials upload / material intake
  -> prompt requirements propose / approve
  -> material-intake propose / approve
  -> product-brief propose / approve
  -> storyboard propose / approve
  -> shotprompt propose / approve
  -> apply shot set
  -> per shot:
       image-prompt propose
       image generation batch
       image-select
       video-script propose
       video generation batch
       video-select
  -> final compose
  -> final video file + compiled manifest
```

核心语义：

- Workspace 级模块统一采用 `propose -> approve`：`propose` 只写待审 artifact，`approve` 才变为当前生效 artifact。
- 下游只读取 `approved/current`，不会读取 proposed artifact。
- 每个 prompt module 拥有自己的 artifact 表，`workspace_artifact` 退出 V2 主链路。
- `shotprompt approve` 不创建、不删除、不重建 `storyboard_shots`；必须显式调用 shot set apply。
- `shot_sets` 是分镜链路实例。新的 active shot set 会归档旧 active shot set，但不会物理删除旧候选、旧选择或旧成片。
- 上游变化通过 `upstreamChanged` 提示表达，不级联 reset 下游，不删除候选，不清空选择。
- `image_select_artifacts` 和 `video_select_artifacts` 是每个 shot 的 current selection 指针；重复选择用 UPSERT 覆盖。
- `STALE` 只表示同一 shot 的旧 prompt/script 轮次不再是当前轮次，不表示上游 artifact 变化。
- 产品上不做单会话版本追踪和回滚 UI；数据库物理 append 只服务审计、debug 和追溯。

## Prompt 架构

V2 将主体 prompt 和契约 prompt 分离：

```text
packages/ai/src/prompts/
├── module-prompt-assembler.ts   # 组装 subject + runtime context + contract
└── modules/<module>/
    ├── subject.md               # 主体创作任务：模块要创作什么
    └── contract.md              # 输入 artifact、输出 schema、JSON 格式、provider/safety 硬约束
```

边界：

- 用户编辑的是结构化“创作要求”，不是 raw prompt 或 system prompt。
- `subject.md` 可以迭代创作策略；`contract.md` 锁定输入、输出和 provider 约束。
- `module-prompt-assembler.ts` 统一拼装 `Subject Prompt`、`Runtime Context` 和 `Schema Contract`，并生成 subject/contract 模板 id 与 hash。
- workspace module 的 runtime context 由各 prompt builder 注入 approved artifact 与请求参数；per-shot `image-prompt` / `video-script` agent 的 instructions 也使用同一 assembler，真实业务上下文以 JSON user message 传入。
- `prompt_requirements_artifacts.data` 当前主要作为 workspace module 的依赖门槛和 source fingerprint；逐 shot 阶段通过 approved shotprompt 的 `shotImage` / `shotVideo` dict 注入图像和视频 agent。
- artifact 表保存 `prompt_assembly` 元数据和短 preview；完整 assembled prompt 写入 `trace_events` 和 workspace 本地 `.daireel/trace/events.jsonl`。
- 跨 module artifact 流通和每个节点的读取/写入规则见 [docs/core/prompt_workflow.md](./docs/core/prompt_workflow.md)。
- 文本 agent 走 `@openai/agents` Runner + Zod outputType；`MODEL_MODE != real` 时 workflow wrapper 可短路到确定性 fixture。

## 数据与运行时

- PostgreSQL 16 是唯一业务事实源；访问层维持原生 `pg` Pool + 手写参数化 SQL。
- Redis 只服务 BullMQ 队列，不作为业务缓存。
- `trace_events` 表是可查询 trace 来源；workspace `.daireel/trace/events.jsonl` 是本地调试 trace。
- `generation_v2` 队列承载 image candidate、video retry/recovery、final compose 等异步任务。
- final compose 使用 ffmpeg，必须绑定具体 `shot_set_id` 和有序 `sourceVideoCandidateIds`。
- 真实 provider 链路使用 Ark text、Ark Seedream image、Ark Seedance video；三组 provider env 独立配置。

## 关键表与 artifact

V2 目标主链路围绕这些表组织：

| 模块 | 表 / artifact | 语义 |
|---|---|---|
| 创作要求 | `prompt_requirements_artifacts` | 用户可编辑的结构化要求，作为 prompt 链路依赖和 source fingerprint。 |
| material-intake | `material_intake_artifacts` | 素材解读、选用素材、图像输入描述。 |
| product-brief | `product_brief_artifacts` | 商品卖点、人群、语气、约束。 |
| storyboard | `storyboard_artifacts` | 视频结构、节奏和镜头目标。 |
| shotprompt | `shot_prompt_artifacts` | 每个 shot 的时间段、`shotImage`、`shotVideo`。 |
| shot-set | `shot_sets` + `storyboard_shots` | 显式应用 shotprompt 后生成的分镜链路实例。 |
| shot requirements | `shot_prompt_requirements` | 每个 shot 的图像/视频要求 dict。 |
| image-prompt | `image_prompt_artifacts` | per-shot 图像 prompt artifact。 |
| image generation | `image_generation_batches` + `image_candidates` | 图像候选生成事实。 |
| image-select | `image_select_artifacts` | 每个 shot 当前选定图。 |
| video-script | `video_script_artifacts` | per-shot 视频脚本与 Seedance provider prompt。 |
| video generation | `video_generation_batches` + `video_candidates` | 视频候选生成事实。 |
| video-select | `video_select_artifacts` | 每个 shot 当前选定视频。 |
| final-compose | `final_video_jobs` | 成片任务、输入 manifest、输出文件。 |

迁移完成后，`workspace_artifact`、`selected_shot_images`、`selected_shot_videos`、`shotprompt approve` 内级联删除并重建 shots 的逻辑都应退出主链路。

## 本地开发

### 1. 准备依赖

需要本机已安装：

- Node.js 22+
- pnpm 9.x（仓库声明 `pnpm@9.15.4`）
- Docker Desktop 或兼容 Docker Compose
- ffmpeg

安装 JS 依赖：

```bash
pnpm install
```

启动基础设施：

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 2. 配置环境变量

复制模板：

```bash
cp .env.example .env
```

常用字段：

| 字段 | 说明 |
|---|---|
| `WEB_PORT` | Vite 前端端口，默认常用 `5173`。 |
| `SERVER_PORT` | Fastify 后端端口，默认常用 `3000`。 |
| `PUBLIC_API_BASE_URL` | 前端 API base host；本地通常为 `http://localhost`。 |
| `DATABASE_URL` | Postgres 业务事实源。 |
| `REDIS_URL` | BullMQ 队列 Redis。 |
| `USE_REDIS_QUEUE` | 是否启用 Redis 队列；真实链路推荐 `true`。 |
| `MODEL_MODE` | `real` 调真实 provider，`mock` 用 fixture。 |
| `TEXT_API_KEY` / `TEXT_BASE_URL` / `TEXT_ENDPOINT_ID` | Ark text provider。 |
| `IMAGE_API_KEY` / `IMAGE_BASE_URL` / `IMAGE_ENDPOINT_ID` | Ark Seedream image provider。 |
| `VIDEO_API_KEY` / `VIDEO_BASE_URL` / `VIDEO_ENDPOINT_ID` | Ark Seedance video provider。 |
| `DEFAULT_IMAGE_CANDIDATES` / `MAX_IMAGE_CANDIDATES_PER_SHOT` / `DEFAULT_VIDEO_CANDIDATES` / `MAX_VIDEO_CANDIDATES_PER_SHOT` | 每个 shot 的默认/最大候选数量。 |

`MODEL_MODE=real` 的完整链路需要 text / image / video 三组 provider 配置齐全。workspace 本地存储通过 `POST /api/workspaces/:workspaceId/storage/bind` 绑定目录。

### 3. 启动服务

```bash
pnpm dev
```

也可以显式选择模式：

```bash
pnpm dev:real
pnpm dev:mock
```

默认地址：

- Web: `http://localhost:5173`
- API: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`

### 4. 重置开发状态

新一轮 Postman / 集成测试前推荐：

```bash
pnpm reset:dev -- --yes
```

该命令会清理开发端口、Postgres 业务表和 Redis 队列，然后启动 `pnpm dev`。

只清空、不重启服务：

```bash
pnpm reset:dev -- --yes --no-dev
```

也可以单独执行：

```bash
pnpm db:clear -- --yes
pnpm redis:clear -- --yes
```

重置脚本不会删除 workspace `.daireel/trace/events.jsonl`、deprecated repo-local `storage/trace` / `storage/uploads` 或 MinIO 内容。

## 验证与调试

常用验证：

```bash
pnpm typecheck
pnpm lint
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test
pnpm --filter @aigc-video/web test
pnpm build
```

真实 provider smoke 仅保留后端图像链路 / 视频链路，并固定每条链路只生成 1 个候选：

```bash
pnpm --filter @aigc-video/server test:integration:smoke
```

多真实模型联调 package scripts 已移除，包括 `realitest`、`realitest:parallel`、`agenttest:real`、`test:agent-chain`、`smoke:providers` 和 `smoke:real-providers`。历史直连脚本仍保留禁用保护，手动调用时只会打印停用说明，不会发起 provider 请求。

查看 one-picture trace：

```bash
node scripts/extract-one-picture-events.mjs
```

集成测试：

```bash
pnpm --filter @aigc-video/server test:integration:smoke
```

Playwright e2e：

```bash
pnpm --filter @aigc-video/web test:e2e
```

V2 agent-chain 验收资料位于 `docs/test/agent-chain/`：

```text
docs/test/agent-chain/
├── agent-chain.postman.json
├── agent-chain.env.json
└── agent-chain.data.json
```

这些 Postman/Newman 资产当前只作为公开契约参考保留；完整 agent-chain 真实模型联调入口已关闭。当前真实 provider 自动 smoke 只跑后端 image-flow / video-flow。

## API 契约

- 人类可读业务接口：[docs/core/interface.md](./docs/core/interface.md)
- 机器可读 OpenAPI：[docs/core/openapi.yaml](./docs/core/openapi.yaml)
- 测试侧 OpenAPI/Postman 资料：[docs/test/](./docs/test/)

通用约定：

- 全部路由前缀 `/api`，URL 无版本号。
- 错误统一映射为 `{ code, message, details? }`。
- 标记为幂等的 POST 必须携带 `Idempotency-Key`。
- 宽高比枚举固定为 `9:16 | 16:9 | 1:1`。
- 下游查询返回 `upstreamChanged` 提示，但不自动 reset 下游。

## Worktree 环境

后续 PRD 提炼和实现分支建议使用 git worktree。remote 不提交 `.env`、`node_modules`、本地上传文件和模型权重；这些都需要在每个 worktree 本地准备。

从当前主工作目录创建 worktree：

```bash
git fetch origin
git switch main
git pull --ff-only origin main

mkdir -p ../Bytedancehack-wt
git worktree add -b feat/prd ../Bytedancehack-wt/prd main
```

进入 worktree 后复制本地环境变量：

```bash
cd ../Bytedancehack-wt/prd
cp /Users/carrick/ResearchWorkspace/Bytedancehack/.env .env
pnpm install
```

如果 worktree 要和主目录同时启动应用，注意调整 `WEB_PORT` 和 `SERVER_PORT`，避免端口冲突。
