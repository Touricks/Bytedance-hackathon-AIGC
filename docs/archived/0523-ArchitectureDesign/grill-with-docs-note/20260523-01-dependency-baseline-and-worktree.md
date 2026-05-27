# 2026-05-23 Grill Note：依赖基线与 Git Worktree 开发规则

## 审阅状态

已确认。

本笔记记录 `grill-with-docs` 自检后已经达成一致的工程执行规则，供后续审阅和并入正式计划。

## 背景

当前 v2 工程计划已经确定使用 monorepo 与 git worktree 并行开发，但原计划仍缺少两个关键执行细则：

1. 第三方库怎么装、装在哪个 package。
2. 多个 worktree 如何避免同时修改 `package.json`、`pnpm-lock.yaml`、`.env.example` 和 `infra/docker-compose.yml`。

如果不先解决这两个问题，后续 `feat/ai-generation-pipeline`、`feat/web-creation-flow`、`feat/retrieval-qdrant-bge` 会高概率同时改 lockfile 和基础配置，造成不必要的合并冲突。

## 已确认决策 1：`foundation-contracts` 升级为依赖基线分支

`feat/foundation-contracts` 不只是共享契约分支，也承担 **依赖基线分支** 的职责。

它需要先于其他业务 worktree 合入主线，用来统一：

- `packages/shared` 领域契约。
- job status / stage / error code。
- `.env.example`。
- 基础 Docker Compose 边界。
- P0 已确定第三方库的安装位置。
- `pnpm-lock.yaml` 的第一轮稳定版本。

后续业务 worktree 必须基于这个 baseline 创建，而不是同时从旧 `main` 分叉。

推荐顺序：

```text
1. 先提交 docs/archived/0523 与 docs/plan_0523，形成 plan baseline。
2. 从 plan baseline 创建 feat/foundation-contracts。
3. foundation-contracts 完成 shared/env/infra/dependency baseline。
4. 合回 main。
5. 再从更新后的 main 创建 ai-generation-pipeline、web-creation-flow、retrieval-qdrant-bge。
```

## 已确认决策 2：第三方库按 package ownership 安装

依赖安装规则如下：

```text
root:
  只放 workspace/tooling 依赖。

apps/web:
  只放浏览器端和 React 交互依赖。

apps/server:
  只放 API、队列、存储、数据库、检索 client 依赖。

packages/ai:
  只放模型调用 runtime、AI workflow 内部依赖。

packages/shared:
  只放 Zod 和纯 schema/type 依赖，避免业务 SDK。

apps/embedding:
  Python service，不走 pnpm，用 requirements.txt 或 pyproject.toml。
```

具体归属建议：

```text
root devDependencies:
  turbo
  typescript
  eslint
  prettier
  husky
  lint-staged

apps/web dependencies:
  @tanstack/react-query
  react-hook-form
  @hookform/resolvers
  zod
  lucide-react
  zustand
  Uppy                       # 若 P0 决定引入
  dnd-kit                    # 若 P0 做分镜排序
  Recharts                   # P1 mock dashboard

apps/server dependencies:
  fastify
  @fastify/cors
  @fastify/multipart
  fastify-type-provider-zod  # 若 P0 决定引入
  @fastify/swagger           # 若 P0 输出 API docs
  bullmq
  ioredis
  bull-board                 # 若 P0 需要队列调试 UI
  pg                         # Postgres client
  minio 或 @aws-sdk/client-s3 # 二选一，取决于对象存储策略
  @qdrant/js-client-rest     # retrieval worktree 使用
  zod

packages/ai dependencies:
  openai
  @openai/agents             # 仅 trace spike 确认要做时安装
  zod

packages/shared dependencies:
  zod

apps/embedding:
  fastapi
  uvicorn
  sentence-transformers 或 FlagEmbedding
```

## 已确认决策 3：业务 worktree 不随意新增基础依赖

规则：

- 业务 worktree 可以修改自己负责 package 的业务代码。
- 业务 worktree 如果需要新增依赖，优先确认该依赖是否已经属于 foundation baseline。
- 若确实需要新增依赖，应只修改对应 package 的 `package.json`，并在 PR/审阅说明中解释原因。
- 不允许多个 worktree 同时批量安装跨 package 依赖。
- `packages/shared` 不引入非 schema/type 必需的业务 SDK。
- `apps/server` 不直接 import `openai` 或 `@openai/agents`，只调用 `packages/ai` 的 workflow。
- `apps/web` 不 import `packages/ai`，也不接触任何模型 API key。

## 已确认决策 4：worktree 创建必须基于已提交 baseline

当前 `docs/archived/0523/` 与 `docs/plan_0523/` 是未跟踪文件。  
如果直接从当前 `main` 创建 worktree，新 worktree 不会包含这些计划文档。

因此在创建业务 worktree 前，应先形成一个 plan baseline commit。

推荐命令形态：

```bash
git add docs/archived/0523 docs/plan_0523 docs/deep_research
git commit -m "docs: add 0523 architecture and development plan"

mkdir -p ../Bytedancehack-wt
git worktree add -b feat/foundation-contracts ../Bytedancehack-wt/foundation-contracts main
```

等 `feat/foundation-contracts` 合回 `main` 后，再创建：

```bash
git worktree add -b feat/ai-generation-pipeline ../Bytedancehack-wt/ai-generation-pipeline main
git worktree add -b feat/web-creation-flow ../Bytedancehack-wt/web-creation-flow main
git worktree add -b feat/retrieval-qdrant-bge ../Bytedancehack-wt/retrieval-qdrant-bge main
```

## 对现有计划的影响

建议后续将以下内容并入正式计划：

- 在 `supporting_docs/worktree-modules.md` 中补充 “dependency baseline branch” 规则。
- 在 `proposed_architecture.md` 的第三方库章节中补充安装归属表。
- 在 `supporting_docs/review-checklist.md` 中增加 lockfile / package ownership 审阅项。
- 可选：若团队认为该决策足够长期，后续升级为 ADR。

## 下一轮需要继续确认的问题

下一个问题建议讨论：

```text
foundation baseline 是否一次性安装所有 P0 可选高价值库，
还是只安装必需库，把 Uppy、bull-board、fastify-type-provider-zod、@openai/agents 留给对应 worktree？
```

推荐答案：

```text
foundation baseline 只安装 P0 必需且已经确定的依赖；
P0 可选库保留在对应 worktree 中安装，但必须遵守 package ownership。
```

原因：

- 这样可以降低 baseline 分支体积。
- 避免可选库在尚未验证需求前污染 lockfile。
- 又不会让基础依赖和 worktree 规则失控。

