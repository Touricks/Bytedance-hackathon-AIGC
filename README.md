# 电商场景 AIGC 带货视频生成系统

ByteDance Hackathon AIGC 电商带货视频项目。当前仓库的 active 实现是 **V2 per-shot pipeline**：素材清点 → 商品 brief → UGC 分镜 → shotprompt 审批 → 逐分镜（图片 prompt → 图片 batch → 选图 → 视频脚本 → 视频 batch → 选视频）→ 最终 ffmpeg compose 成片。

## 新会话先读

1. [CONTEXT.md](./CONTEXT.md)
   领域词汇表。先确认"商品素材""商品 brief""UGC 分镜""shotprompt""image batch""video batch""final compose"等词的含义。

2. [docs/archived/](./docs/archived/)
   历史 arc / 讨论 / bug 记录。

3. [docs/core/](./docs/core/)
   核心架构文件

3. [docs/test/](./docs/test/)
   核心测试文件

## V2 主链路范围

P0 围绕以下能力交付：

- 商品素材上传 + 自动 intake。
- 商品 brief、UGC storyboard、shotprompt 三段结构化生成与审批。
- shotprompt approve 即在 Postgres 中 seed `storyboard_shots`。
- 每个 shot 独立走：图片 prompt 提议 → 生成图片 batch（N 候选）→ 选图 → 视频脚本提议 → 生成视频 batch（M 候选）→ 选视频。
- 全部 shot 选完视频后，触发 final compose（确定性 ffmpeg concat），生成可下载 MP4 + 可哈希 manifest。
- 任意时刻可编辑 prompt / script，下游被 stale 化（`shot.stale.ts` 规则）。

以下不进入当前主路径：检索、字幕合成、BGM、TTS、A/B 对比、跨 shot 编排重排、移动端专项优化、partial-candidate 重生、SSE/WebSocket 推送。

## 已确认主流程

```text
workspace 选择/恢复
  -> 上传/导入商品素材到 .daireel/materials/
  -> material_intake
  -> brief propose -> approve
  -> storyboard propose -> approve
  -> shotprompt compile -> approve（同时 seed storyboard_shots）
  -> 进入 /workspaces/<id>?shot=<id>&step=<step> focus 模式
  -> 逐 shot：image_prompt -> image_candidates -> video_script -> video_candidates -> review
  -> 全部 VIDEO_SELECTED 后 -> 合成最终视频（final_compose）
  -> 下载 MP4 + 查看 compiled manifest hash
  -> 提交成片反馈，structured route 回 brief/storyboard/shotprompt
```

关键边界：

- 用户编辑的是结构化 artifact：brief / storyboard / shotprompt / image-prompt / video-script。
- 用户不直接编辑最终 Seedance provider prompt（由 `video-shot-script` agent 写入 `providerPrompt`）。
- 每个 batch POST 与 final-compose POST 都强制要求 `Idempotency-Key` header（`ON CONFLICT (idempotency_key) DO NOTHING` 去重）。
- 编辑上游 prompt / script 立即在同一事务里 STALE 下游、丢弃已选 candidate（参考 `apps/server/src/modules/shot/shot.stale.ts`）。
- 三组 provider 配置完全独立：text / image / video 各自 `*_API_KEY` / `*_BASE_URL` / `*_ENDPOINT_ID`；text、video 保留 ARK_ 兼容回退，image 没有 ARK_ 别名。
- `final-compose.worker.ts` 边界硬性：不允许 import 任何 text/image/video provider 或 `packages/ai/agents` 模块（由 `final-compose.boundary.unit.test.ts` 静态扫描守住）。

## 模型与存储口径

- P0 必须真实调用 Ark text（OpenAI 兼容）、Ark Seedream（image，异步 task + 轮询）、Ark Seedance（video，异步 task + 轮询）。`MODEL_MODE=real` 时三组 provider env 缺一即 boot 失败。
- 图生视频主路径：image-prompt agent 生成首帧 prompt → image batch 出候选 → 选定首帧 → video-script agent 写 4–8 秒 providerPrompt（中文）→ Seedance 图生视频。
- Seedance-facing prompt 必须中文构建；JSON 字段名与 enum 仍为英文（机器契约）。
- Ark 文本链路通过 `@openai/agents` Runner + Zod outputType 严格 JSON schema 约束；`MODEL_MODE != real` 时 workflow wrapper 短路到确定性 fixture，仅服务本地开发与单测。
- Postgres 是业务事实源；`trace_events` 表是可查询 trace 来源；workspace `.daireel/trace/events.jsonl` 是本地调试 trace。repo-local `storage/trace` 已 deprecated。
- final compose 阶段必须配置 ffmpeg 与 Ark video provider；缺少任一启动即失败，不返回 fallback 视频。

## 本地开发 Quickstart

### 1. 准备依赖

需要本机已安装：

- Node.js 22+（当前本地验证使用 Node 25）
- pnpm 9.x（仓库声明 `pnpm@9.15.4`）
- Docker Desktop 或兼容 Docker Compose
- ffmpeg（final compose 启动时会检查）

安装 JS 依赖：

```bash
pnpm install
```

启动基础设施（Postgres、Redis、MinIO）：

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 2. 配置 `.env`

复制模板：

```bash
cp .env.example .env
```

新用户至少检查这些字段：

| 字段 | 默认/示例 | 说明 |
|---|---|---|
| `WEB_PORT` | `5173` | Vite 前端端口。 |
| `SERVER_PORT` | `3000` | Fastify 后端端口。 |
| `PUBLIC_API_BASE_URL` | `http://localhost` | 前端 API base host；本地 localhost 会自动拼 `SERVER_PORT`。 |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/aigc_video` | Postgres 业务事实源，必须可连接。 |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ 队列 Redis。 |
| `USE_REDIS_QUEUE` | `true` | 开启 Redis 队列；本地真实链路推荐保持开启。 |
| `MODEL_MODE` | `real` | `real` 会调用真实模型；`mock` 仅用于本地/单测 fixture。 |
| `TEXT_API_KEY` / `TEXT_BASE_URL` / `TEXT_ENDPOINT_ID` | Ark OpenAPI | 文本 provider，brief/storyboard/shotprompt/image prompt/video script 会用。 |
| `IMAGE_API_KEY` / `IMAGE_BASE_URL` / `IMAGE_ENDPOINT_ID` | Ark OpenAPI | 图片 provider，image batch 会用。 |
| `VIDEO_API_KEY` / `VIDEO_BASE_URL` / `VIDEO_ENDPOINT_ID` | Ark OpenAPI | Seedance video provider，video batch 会用。 |
| `DEFAULT_*_BATCH_SIZE` / `MAX_*_BATCH_SIZE` | 见模板 | 每个 shot 的默认/最大候选数。 |

S3/MinIO 字段目前是可选实验配置；当前本地 workspace 主路径通过 `POST /api/workspaces/:workspaceId/storage/bind` 绑定本地绝对目录。

如果只跑无模型 Postman smoke，可以不填模型 key，但不要调用 provider collection。真实 provider、`pnpm dev` 的完整演示链路需要 `.env` 中三组模型字段齐全。

### 3. 启动服务

```bash
pnpm dev
```

默认地址：

- Web: `http://localhost:5173`
- API: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`

也可以显式选择模式：

```bash
pnpm dev:real
pnpm dev:mock
```

### 4. 重置数据库和队列

新一轮 Postman / 集成测试前，推荐一键重置：

```bash
pnpm reset:dev -- --yes
```

这个命令会停止当前 `SERVER_PORT` / `WEB_PORT` 监听进程，清空 Postgres business tables，清空 Redis BullMQ `generation` / `generation_v2` 队列 key，然后重新启动 `pnpm dev`。

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

常用验证：

```bash
pnpm typecheck
pnpm lint
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test
pnpm --filter @aigc-video/web test
pnpm build
```

Provider 联通验证（需要 `.env` 中三组 provider key）：

```bash
pnpm --filter @aigc-video/server smoke:providers
```

集成测试（命中真实 Ark / Seedance）：

```bash
# @smoke：provider-smoke + refresh-recovery（fast）
pnpm --filter @aigc-video/server test:integration:smoke

# @provider：包含 image-flow（中等成本，~3-6 min）
pnpm --filter @aigc-video/server test:integration:provider

# @expensive：video-flow + final-compose + final-compose-contract（高成本，20-40 min）
pnpm --filter @aigc-video/server test:integration:expensive
```

Playwright e2e（命中真实 backend + 真实 provider）：

```bash
# 1) 在另一个终端启动 pnpm dev 并确认 server 就绪
# 2) 跑 e2e（默认 mock 路径）
pnpm --filter @aigc-video/web test:e2e

# 3) 跑真实 provider e2e（消耗 Ark/Seedance 额度，需要 .env 全配）
RUN_REAL_PROVIDER_E2E=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 \
  pnpm --filter @aigc-video/web test:e2e -- e2e/real-provider-flow.spec.ts
```

V2 demo 素材：

- 测试用商品图：`apps/server/test/helpers/fixtures/red-apple.png`
- workspace 存储目录：通过 `POST /api/workspaces/:workspaceId/storage/bind` 绑定本地绝对路径；不再读取 `WORKSPACE_DIR`
- final compose 输出：`<workspace>/.daireel/final/<finalVideoJobId>/final.mp4`

## Worktree 环境准备

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

如果 worktree 要和主目录同时启动应用，注意端口冲突，可在该 worktree 的 `.env` 中调整：

```text
WEB_PORT=
SERVER_PORT=
```

说明：

- `.env` 从本机主工作目录复制，不从 remote 获取，不提交。
- `node_modules` 每个 worktree 单独 `pnpm install`；pnpm 会复用全局 store。
- Postgres/Redis 等基础设施本机通常只启动一套即可。
- 本地模型、大文件和上传目录通过 `.env` 或本地路径约定引用，不进 Git。

## 后续 PRD 工作

后续 PRD 提炼请在 git worktree 中进行。建议先基于已提交的 `main` 创建工作树，再在工作树内产出 PRD 或任务拆分文档。
