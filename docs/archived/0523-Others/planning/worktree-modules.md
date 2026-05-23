# Git Worktree 开发模块划分

## 1. 划分原则

当前项目不建议按物理目录拆成：

```text
web-only
server-only
ai-only
```

更合适的方式是按可独立验收的业务切片拆分：

```text
先短分支稳定共享契约；
再围绕主链路并行开发；
检索增强独立 worktree，不阻塞 P0。
```

## 2. Worktree 1：foundation-contracts

分支：

```text
feat/foundation-contracts
```

范围：

```text
packages/shared/
apps/server/src/common/
apps/server/src/db/
infra/
.env.example
CI / tsconfig / lint
```

职责：

- 定义 `Product`、`Asset`、`GenerationJob`、`Script`、`StoryboardShot`。
- 定义 `CreativeBlueprint` / `improvementHints` / 结构化创作参数 DTO。
- 定义 request/response DTO。
- 定义 job status、stage、error code。
- 定义 env schema。
- 确认 Postgres、Redis、MinIO、Qdrant、embedding service 的 compose 边界。
- 建立最小 CI 或本地验证命令。

验收：

```text
shared schemas 能被 web/server/ai 同时 import
pnpm typecheck
pnpm lint
pnpm build
```

## 3. Worktree 2：ai-generation-pipeline

分支：

```text
feat/ai-generation-pipeline
```

范围：

```text
packages/ai/
apps/server/src/jobs/
apps/server/src/modules/script/
apps/server/src/modules/creation/
apps/server/src/common/trace.ts
mocks/scripts/
mocks/videos/
```

职责：

- 官方 `openai` SDK / Ark-compatible client。
- OpenAI Agents SDK trace spike。
- Zod validation + repair retry。
- creative blueprint generation workflow。
- StoryboardShot 到 whole-video prompt 的压缩。
- Seedance video provider。
- BullMQ media processors。
- 成片任务 progress / trace / failure reason。
- 兜底 mock 视频。

验收：

```text
给定结构化创作参数可以生成 CreativeBlueprint JSON
可以生成 video prompt
可以创建并推进成片任务 GenerationJob 状态
失败时有 trace 和 repair retry
```

## 4. Worktree 3：web-creation-flow

分支：

```text
feat/web-creation-flow
```

范围：

```text
apps/web/src/features/material/
apps/web/src/features/script/
apps/web/src/features/creation/
apps/web/src/components/
apps/web/src/lib/api/
apps/web/src/lib/job/
apps/web/src/routes/
```

职责：

- 商品信息表单。
- 素材上传 UI。
- 脚本和分镜展示。
- 创作蓝图只读确认。
- 一键成片任务创建入口。
- React Query job polling。
- 视频预览和导出。
- 前端 mock mode。

验收：

```text
用户可以填写商品信息
可以上传/选择素材
可以生成创作蓝图并确认
可以创建成片任务
可以看到 job progress
可以预览 mock 或真实视频
```

## 5. Worktree 4：retrieval-qdrant-bge

分支：

```text
feat/retrieval-qdrant-bge
```

范围：

```text
apps/embedding/
apps/server/src/modules/retrieval/
apps/server/src/jobs/processors/material-index.processor.ts
packages/shared/src/schemas/retrieval.ts
infra/docker-compose.yml
models/README.md
```

职责：

- bge-m3 embedding service。
- Qdrant Docker service。
- material index job。
- Qdrant collection schema。
- search API。
- Postgres hydration。

验收：

```text
embedding service 可以加载本地 bge-m3
Qdrant collection 可以初始化
素材可以被 index
search API 返回 Qdrant hits 并从 Postgres hydrate
```

## 6. 推荐目录

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

## 7. 合并顺序

```text
1. feat/foundation-contracts
2. feat/ai-generation-pipeline
3. feat/web-creation-flow
4. feat/retrieval-qdrant-bge
```

`web-creation-flow` 可以先基于 mock API 开发，但最终集成必须以 `packages/shared` 的 DTO 为准。

## 8. 冲突控制规则

- `packages/shared` 的修改优先集中在 foundation 分支。
- 后续业务分支需要新增 DTO 时，先同步主线。
- `apps/server/src/jobs` 与 `packages/ai` 高度相关，放在同一条生成链路分支。
- Qdrant 和 embedding service 不进入 P0 主链路 worktree。
- 前端 mock API 必须模拟真实 DTO，不另起一套字段。
