# 电商场景 AIGC 带货视频生成系统

这是 ByteDance Hackathon AIGC 电商带货视频项目。当前仓库的 active 实现已经切到 **V1 workspace pipeline**：素材清点、商品 brief、UGC 分镜、视频剧本、Seedance 成片与结构化成片反馈路由。

## 新会话先读

1. [CONTEXT.md](./CONTEXT.md)  
   领域词汇表。先确认“商品素材”“商品 brief”“UGC 分镜”“视频剧本”“一键成片”“成片任务”等词的含义。

2. [docs/architecture.md](./docs/architecture.md)
   当前架构入口，指向实现架构、数据模型、演示与模型 smoke 文档。

3. [docs/arc_v5.md](./docs/arc_v5.md)
   当前已实现 V1 架构事实源：Postgres 事实源、workspace `.daireel/`、五段 prompt 链路、Seedance 整片生成和反馈路由。

4. [docs/export/sdd.md](./docs/export/sdd.md)
   当前软件设计文档：V1 API 表面、prompt 模板、Ark `response_format`、Seedance prompt 边界与四人分工。

5. [docs/plan_0523/current-support/model-smoke.md](./docs/plan_0523/current-support/model-smoke.md)
   历史真实 Ark text / OpenAI fallback dependency smoke check 步骤，可作为 provider smoke 参考。

6. [docs/plan_0523/current-support/provider-contract-correction.md](./docs/plan_0523/current-support/provider-contract-correction.md)
   Provider contract 修正历史：解释旧 `SEEDANCE_*` 口径为什么被替换。

7. [docs/prd_safe.pdf](./docs/prd_safe.pdf)
   原始安全版 PRD。

## V1 主链路范围

P0 仍围绕六项演示能力交付：

- 商品素材上传。
- 剧本生成。
- 基础分镜。
- 一键成片。
- 任务进度。
- 预览导出。

以下不进入当前 V1 主路径：检索、真实 TTS 合成、字幕合成、BGM 合成、数据看板、A/B 对比、复杂分镜编辑、移动端专项优化。

## 已确认主流程

```text
选择或恢复 workspace
  -> 上传/导入商品素材到 .daireel/materials/
  -> 素材清点 material_intake
  -> 生成并人工确认商品 brief
  -> 生成并人工确认 UGC storyboard
  -> 生成并人工确认 video shotprompt
  -> 点击一键成片，创建异步 GenerationJob
  -> Ark-backed Seedance 图生视频生成成片
  -> 轮询任务进度
  -> 预览导出
  -> 提交成片反馈，structured route 回 brief/storyboard/shotprompt
```

关键边界：

- 用户修改结构化 artifact：商品 brief、UGC storyboard、video shotprompt。
- 用户不直接编辑最终 Seedance provider prompt。
- Brief、storyboard、shotprompt 先 proposed，人工确认后 approved。
- 成片任务异步执行，任务进度只服务视频生成长任务。
- V1 成片任务只消费 approved `ShotPromptArtifact`，不再从 V0 `GeneratedScript` / `CreativeBlueprint` 构建 prompt。
- `POST /api/creative-blueprints` 和 `POST /api/creation/jobs` 已从 active server/web surface 移除。
- `POST /api/workspaces/feedback/route` 在 real mode 使用 Ark `feedback_route_v1` structured output，而不是靠关键词规则改写 artifact。

## 模型与存储口径

- P0 必须真实调用 Ark 文本 endpoint 和 Ark 视频 endpoint。
- Seedance 是视频能力/模型名；鉴权与 endpoint 配置统一走 Ark provider contract。
- 视频主路径固定为图生视频：approved 商品素材 + 由 approved `ShotPromptArtifact` 编译出的中文 Seedance prompt。
- 所有 Seedance-facing prompt 必须以中文构建；JSON 字段名和 enum 仍保持英文作为机器契约。
- Ark 文本链路通过 strict JSON Schema `response_format` 约束输出；mock/deterministic 只服务本地开发与测试。
- `OPENAI_BASE_URL` 下的 OpenAI-compatible 配置只作为历史 fallback LLM 参考，不参与视频生成。
- mock provider 和预生成视频只作为本地开发与现场兜底，不替代 P0 验收。
- Postgres 是业务事实源；workspace `.daireel/trace/events.jsonl` 是当前 workspace trace。repo-local `storage/trace` 已 deprecated。
- `MOCK_FINAL_VIDEO_URL` 可用于本地/现场 fallback 成片预览。

## 本地开发

安装依赖：

```bash
pnpm install
```

复制环境变量：

```bash
cp .env.example .env
```

`DATABASE_URL` 是必填项。服务端启动时会从仓库根目录 `.env` 读取它；如果缺失，应用会直接失败，而不会退回进程内存存储。

启动基础设施：

```bash
docker compose -f infra/docker-compose.yml up -d
```

启动应用：

```bash
pnpm dev
```

常用验证：

```bash
pnpm --filter @aigc-video/web test
pnpm --filter @aigc-video/server test
pnpm --filter @aigc-video/ai test
pnpm typecheck
pnpm lint
pnpm build
```

V1 演示资产：

- 商品图：`apps/web/public/mocks/products/demo-product.svg`
- 现场兜底成片：`apps/web/public/mocks/videos/fallback-flower.mp4`

默认 mock fallback 可离线运行；真实 Ark/Seedance smoke 可参考 [model-smoke.md](./docs/plan_0523/current-support/model-smoke.md)。完整 Seedance 成片验收建议使用 `pnpm dev:real` 并上传 raster 商品图。

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

不要为了延续讨论而继续追问明显实现细节。只有会改变 V1 主链路范围、数据模型边界、用户可见流程、模型调用主路径或 Demo 交付风险的问题，才需要继续拉用户确认。
