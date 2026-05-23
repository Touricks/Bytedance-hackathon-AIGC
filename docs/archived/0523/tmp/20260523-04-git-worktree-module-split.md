# 2026-05-23 单轮讨论：当前项目使用 git worktree 时的开发模块划分

## 核心观点

当前项目使用 git worktree 时，不建议按物理目录简单划分为：

```text
一个人 apps/web
一个人 apps/server
一个人 packages/ai
```

这种划分看起来清楚，但会导致业务链路割裂，尤其是 P0 一键成片流程需要前端表单、API DTO、server route、job processor、AI workflow、状态轮询一起闭环。

更合理的方式是：

```text
先用一个短生命周期 foundation 分支稳定共享契约；
再按可独立验收的业务切片开 worktree。
```

## 推荐三人并行划分

### Worktree 1：foundation-contracts

定位：所有人后续开发的底座，生命周期要短，尽快合入主线。

负责范围：

```text
packages/shared/
apps/server/src/common/
apps/server/src/db/
infra/
.env.example
turbo / tsconfig / lint / CI
```

主要任务：

- 定义 `Product`、`Asset`、`GenerationJob`、`Script`、`StoryboardShot`。
- 定义 job status / stage / error code。
- 定义 API request / response DTO。
- 定义 env schema。
- 确认 docker-compose 中 Postgres、Redis、MinIO、Qdrant、embedding service 的边界。
- 加上最小 CI：typecheck、lint、build。

设计理由：

- `packages/shared` 是全项目最高冲突区，不能让三条业务分支同时随意改。
- DTO、job 状态、错误码一旦稳定，前端和后端可以并行 mock。
- 这个分支不应该拖太久，否则所有 worktree 都会反复 rebase。

建议分支名：

```text
feat/foundation-contracts
```

### Worktree 2：ai-generation-pipeline

定位：生成链路，负责从商品输入到结构化剧本、Seedance prompt、视频任务。

负责范围：

```text
packages/ai/
apps/server/src/jobs/
apps/server/src/modules/script/
apps/server/src/modules/creation/
apps/server/src/common/trace.ts
mocks/scripts/
mocks/videos/
```

主要任务：

- 官方 `openai` SDK / Ark-compatible client。
- OpenAI Agents SDK trace spike。
- Zod validation + repair retry。
- script generation workflow。
- storyboard 到 whole-video prompt 的压缩。
- Seedance video provider。
- BullMQ processors。
- job progress / trace / failure reason。
- 兜底 mock 视频。

设计理由：

- 这是项目最高风险链路，应该独立 worktree 快速试错。
- 它可以通过 shared DTO 和 mock input 自测，不必等待完整 UI。
- `apps/server` 的 job processors 与 `packages/ai` 强相关，应该放在同一条分支里做，避免接口来回扯。

建议分支名：

```text
feat/ai-generation-pipeline
```

### Worktree 3：web-creation-flow

定位：用户可见主路径，负责上传、表单、剧本展示、任务进度、视频预览。

负责范围：

```text
apps/web/src/features/material/
apps/web/src/features/script/
apps/web/src/features/creation/
apps/web/src/components/
apps/web/src/lib/api/
apps/web/src/lib/job/
apps/web/src/routes/
```

主要任务：

- 商品信息表单。
- 素材上传 UI。
- 脚本和分镜展示。
- 任务创建入口。
- React Query job polling。
- 视频预览和导出。
- 前端 mock mode。

设计理由：

- 前端可以先基于 `packages/shared` DTO 和 mock API 开发。
- 主页面流程应该由一个人/一个分支贯通，避免多个 UI worktree 互相覆盖路由和状态管理。
- UI 与 server 的耦合通过 `apps/web/src/lib/api` 收口，不直接依赖后端实现细节。

建议分支名：

```text
feat/web-creation-flow
```

## 如果要引入 Qdrant + bge-m3

建议单独开第四个 worktree，而不是塞进 foundation 或 AI pipeline。

### Worktree 4：retrieval-qdrant-bge

定位：素材检索和向量索引，是增强能力，不阻塞 P0 一键成片。

负责范围：

```text
apps/embedding/
apps/server/src/modules/retrieval/
apps/server/src/jobs/processors/material-index.processor.ts
packages/shared/src/schemas/retrieval.ts
infra/docker-compose.yml
models/README.md
```

主要任务：

- bge-m3 embedding service。
- Qdrant Docker service。
- material index job。
- Qdrant collection schema。
- search API。
- Postgres hydration。

设计理由：

- 检索链路和生成链路可以解耦。
- Qdrant、embedding service、docker volume 会频繁调试，不应该污染 P0 主链路。
- 可以在 P0 主流程稳定后再合入，作为 demo 加分项。

建议分支名：

```text
feat/retrieval-qdrant-bge
```

## 不建议的划分方式

### 不建议：纯目录划分

```text
feat/web-only
feat/server-only
feat/ai-only
```

问题：

- `apps/server` 和 `packages/ai` 在生成链路里高度耦合。
- `apps/web` 需要 DTO 和 API 契约，不能脱离 shared 独立设计。
- 容易出现“每个人都完成了自己的目录，但主流程没跑通”。

### 不建议：一人改所有 shared

如果三条分支都修改 `packages/shared`，冲突会非常高。  
shared 只能通过 foundation 分支先定主干，后续新增 schema 要非常克制，并尽快合主线。

### 不建议：按技术爱好划分

例如：

```text
一个人只做 LangGraph / Agents
一个人只做 Qdrant
一个人只做 UI
```

问题是当前项目最重要的是端到端可演示，而不是每个技术点都深入。

## 推荐 worktree 命名

假设主仓库在：

```text
/Users/carrick/ResearchWorkspace/Bytedancehack
```

worktree 可以放在同级目录：

```text
/Users/carrick/ResearchWorkspace/Bytedancehack-wt/
├── foundation-contracts/
├── ai-generation-pipeline/
├── web-creation-flow/
└── retrieval-qdrant-bge/
```

示例命令：

```bash
mkdir -p ../Bytedancehack-wt

git worktree add -b feat/foundation-contracts ../Bytedancehack-wt/foundation-contracts main
git worktree add -b feat/ai-generation-pipeline ../Bytedancehack-wt/ai-generation-pipeline main
git worktree add -b feat/web-creation-flow ../Bytedancehack-wt/web-creation-flow main
git worktree add -b feat/retrieval-qdrant-bge ../Bytedancehack-wt/retrieval-qdrant-bge main
```

如果当前默认分支不是 `main`，把命令里的 `main` 换成实际主分支。

## 合并顺序建议

推荐顺序：

```text
1. feat/foundation-contracts
2. feat/ai-generation-pipeline
3. feat/web-creation-flow
4. feat/retrieval-qdrant-bge
```

其中 `web-creation-flow` 不必等 `ai-generation-pipeline` 完成，可以先用 mock API 开发。  
但最终集成前，必须以 `packages/shared` 的 DTO 为准。

## 每个 worktree 的验收标准

### foundation-contracts

```text
pnpm typecheck
pnpm lint
pnpm build
```

并且 shared schemas 能被 web/server/ai 同时 import。

### ai-generation-pipeline

```text
给定 mock product input
可以生成 Script JSON
可以生成 video prompt
可以创建/推进 GenerationJob
失败时有 trace 和 repair retry
```

### web-creation-flow

```text
用户可以填写商品信息
可以上传/选择素材
可以创建任务
可以看到 job progress
可以预览 mock 或真实视频
```

### retrieval-qdrant-bge

```text
embedding service 可以加载本地 bge-m3
Qdrant collection 可以初始化
素材可以被 index
search API 返回 Qdrant hits 并从 Postgres hydrate
```

## 一句话

当前项目用 git worktree 时，应该先短分支稳定 `packages/shared + infra + env + job contract`，再按“生成链路”、“前端主流程”、“检索增强”三个可独立验收的业务切片并行开发；不要按物理目录或技术爱好拆分。

