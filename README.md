# 电商场景 AIGC 带货视频生成系统

这是 ByteDance Hackathon AIGC 电商带货视频项目。当前仓库已经进入 **V0 架构基线已确认** 的状态，后续 PRD 提炼和实现拆分应基于本文档入口继续，不要重新从零做架构判断。

## 新会话先读

1. [CONTEXT.md](./CONTEXT.md)  
   领域词汇表。先确认“创作蓝图”“草稿蓝图”“冻结蓝图”“一键成片”“成片任务”等词的含义。

2. [docs/plan_0523/proposed_architecture.md](./docs/plan_0523/proposed_architecture.md)  
   当前架构主文档，也是 V0 取舍的主要来源。

3. [docs/plan_0523/grill-with-docs-note/](./docs/plan_0523/grill-with-docs-note/)  
   架构追问和已确认决策记录。重点看：
   - `20260523-07-creative-blueprint-prompt.md`
   - `20260523-08-two-command-api.md`
   - `20260523-09-persist-creative-blueprint.md`
   - `20260523-10-blueprint-draft-freeze-version.md`

4. [docs/plan_0523/supporting_docs/implementation-slices.md](./docs/plan_0523/supporting_docs/implementation-slices.md)  
   V0 实现切片。

5. [docs/plan_0523/supporting_docs/worktree-modules.md](./docs/plan_0523/supporting_docs/worktree-modules.md)  
   后续 worktree 开发边界。

6. [docs/plan_0523/supporting_docs/demo-readiness.md](./docs/plan_0523/supporting_docs/demo-readiness.md)
   V0 演示与验收交接：上传素材、创作蓝图、一键成片、任务进度、预览导出、mock 兜底和真实模型 smoke checks。

7. [docs/prd_safe.pdf](./docs/prd_safe.pdf)
   原始安全版 PRD。

## V0 范围

V0 只交付六项：

- 商品素材上传。
- 剧本生成。
- 基础分镜。
- 一键成片。
- 任务进度。
- 预览导出。

以下不进入 V0 主路径：检索、TTS、字幕合成、BGM 合成、数据看板、A/B 对比、复杂分镜编辑、移动端专项优化。

## 已确认主流程

```text
上传商品素材与结构化创作参数
  -> 同步生成并持久化创作蓝图
  -> 用户只读确认剧本/基础分镜
  -> 点击一键成片
  -> 创建异步成片任务 GenerationJob
  -> Seedance 图生视频生成 <=12s 成片
  -> 轮询任务进度
  -> 预览导出
```

关键边界：

- 用户只修改结构化字段：商品标题、核心卖点、目标人群、风格偏好、商品主图。
- 用户不直接编辑图生视频 prompt。
- 创作蓝图生成同步返回，UI 使用普通 loading。
- 成片任务异步执行，任务进度只服务视频生成长任务。
- `POST /api/creative-blueprints` 返回稳定 `scriptId`。
- `POST /api/creation/jobs` 接收 `scriptId` 并创建成片任务。
- 视频生成前的草稿蓝图可覆盖；一旦创建成片任务即冻结，后续修改创建新版本。
- 同一冻结 `scriptId` 可创建多个成片任务，用于失败重试或多次生成择优。

## 模型与存储口径

- P0 必须真实调用 Ark 文本模型和 Seedance。
- Seedance 主路径固定为图生视频：上传商品图或 demo 商品图 + 内部 whole-video prompt。
- V0 Seedance prompt 使用保守三段式模板：商品 hero -> 卖点/使用场景 -> CTA。
- mock provider 和预生成视频只作为本地开发与现场兜底，不替代 P0 验收。
- P0 上传素材先保存到 server 本地文件目录；MinIO/S3 推迟到对象存储升级。

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

V0 演示资产：

- 商品图：`apps/web/public/mocks/products/demo-product.svg`
- 现场兜底成片：`apps/web/public/mocks/videos/fallback-flower.mp4`

默认 mock fallback 可离线运行；真实 Ark/Seedance 凭证和 smoke check 步骤见 [demo-readiness.md](./docs/plan_0523/supporting_docs/demo-readiness.md) 与 [model-smoke.md](./docs/plan_0523/supporting_docs/model-smoke.md)。

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

不要为了延续讨论而继续追问明显实现细节。只有会改变 V0 范围、数据模型边界、用户可见流程、模型调用主路径或 Demo 交付风险的问题，才需要继续拉用户确认。
