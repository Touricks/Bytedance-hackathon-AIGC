# 电商场景 AIGC 带货视频生成系统

ByteDance Hackathon AIGC 电商带货视频项目。当前仓库的 active 实现是 **V2 per-shot pipeline**：素材清点 → 商品 brief → UGC 分镜 → shotprompt 审批 → 逐分镜（图片 prompt → 图片 batch → 选图 → 视频脚本 → 视频 batch → 选视频）→ 最终 ffmpeg compose 成片。

## 新会话先读

1. [CONTEXT.md](./CONTEXT.md)
   领域词汇表。先确认"商品素材""商品 brief""UGC 分镜""shotprompt""image batch""video batch""final compose"等词的含义。

2. [docs/architecture.md](./docs/architecture.md)
   架构入口，指向当前 V2 架构、数据模型、spec 与历史 arc。

3. [docs/arc_v6.md](./docs/arc_v6.md)
   **当前 V2 架构事实源**：apps/server 模块拓扑、`shot` / `artifact` / `generation` / `job` / `trace` 模块、provider 三独立 triplet、final-compose 边界、idempotency 与恢复路径。

4. [docs/erd.md](./docs/erd.md)
   V2 Postgres 数据模型：`storyboard_shots`、`image_prompt_artifacts`、`image_generation_batches`、`image_candidates`、`selected_shot_images`、`video_script_artifacts`、`video_generation_batches`、`video_candidates`、`selected_shot_videos`、`generation_jobs`、`trace_events`、`final_video_jobs`。

5. [docs/0528-agent-arc/spec/2026-05-28-storyboard-image-video-pipeline-design-r2.md](./docs/0528-agent-arc/spec/2026-05-28-storyboard-image-video-pipeline-design-r2.md)
   驱动 V2 实现的 spec（包含 r2 §10 测试策略、§12 acceptance checklist 和 §12.1 upstream blocker 记录）。

6. [docs/0528-agent-arc/plans/2026-05-28-pipeline-gap-closure-plan.md](./docs/0528-agent-arc/plans/2026-05-28-pipeline-gap-closure-plan.md)
   Provider smoke + asset URL resolver + 集成测试 fixture 的 gap-closure 计划（已并入 main）。

7. [docs/prd_safe.pdf](./docs/prd_safe.pdf)
   原始安全版 PRD。

8. [docs/archived/](./docs/archived/)
   历史 arc / 讨论 / bug 记录。当前 V1 架构快照保存在 `archived/history_arc_design/arc_v5.md`。

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

## 本地开发

安装依赖：

```bash
pnpm install
```

复制环境变量：

```bash
cp .env.example .env
```

`DATABASE_URL` 是必填项；`MODEL_MODE=real` 时还需要齐全的 `TEXT_* / IMAGE_* / VIDEO_*`（参见 [`.env.example`](./.env.example)）。如果缺失，应用启动时直接失败。

启动基础设施：

```bash
docker compose -f infra/docker-compose.yml up -d
```

启动应用：

```bash
pnpm dev
```

默认 web 走 `WEB_PORT=5173`，server 走 `SERVER_PORT=3000`，前端通过 `PUBLIC_API_BASE_URL` 指向 server。

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
- workspace 落盘根目录：`WORKSPACE_DIR`（默认 `storage/workspaces`）
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

不要为了延续讨论而继续追问明显实现细节。只有会改变 V2 主链路范围、数据模型边界、用户可见流程、模型调用主路径或 Demo 交付风险的问题，才需要继续拉用户确认。
