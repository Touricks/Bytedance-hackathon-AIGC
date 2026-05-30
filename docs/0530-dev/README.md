# 0530 Dev Backend Plan

更新时间：2026-05-30

本目录承接 `docs/0529-dev/product-api/` 与 `docs/0529-dev/prompt-api/`，目标是把 0529 的产品能力、Prompt 模块约束，收敛成 0530 后端开发与后端测试执行方案。

## 输入文档

| 来源 | 读取结论 |
|---|---|
| `docs/0529-dev/product-api/capability-map.md` | 产品主链路是 workspace -> material intake -> brief -> storyboard -> shotprompt -> image/video candidates -> final compose；后续还会扩展保存、发布、渠道数据。 |
| `docs/0529-dev/product-api/user-journey.md` | 用户旅程以本地 workspace 为根，完成素材上传、逐步确认、成片预览/下载，再进入 KOL 渠道发布与数据查看。 |
| `docs/0529-dev/prompt-api/provider-contracts.md` | Ark text/vision、Seedream image、Seedance video、deterministic mock 必须有清晰边界；Prompt 输出必须是可 parse 的 JSON。 |
| `docs/0529-dev/prompt-api/modules/*.md` | 所有 LLM agent 只生成可编辑/可确认中间 artifact；select 是同步点；re-propose 才 stale；首尾帧和 scene reference 是场景一致性的关键。 |

## 本目录文件

| 文件 | 用途 |
|---|---|
| `backend-development-plan.md` | 后端开发计划、阶段拆分、验收标准。 |
| `code-architecture-comments.md` | 代码架构注释建议：哪些文件要解释哪些业务不变量。 |
| `prompt-workflow-modularization-plan.md` | Prompt module 当前组装位置、artifact 依赖和向无代码节点化工作流演进的计划。 |
| `openapi.yaml` | 0530 目标后端 OpenAPI 契约。包含 logical workspace + storage binding、workspace-scoped shot workflow 与 P2 Campaign/KOL 路径。 |
| `postman-test-plan.md` | Postman 后端测试计划、运行顺序、变量、断言与失败场景。 |
| `bytedancehack-0530.postman_collection.json` | 可导入 Postman 的 0530 contract smoke collection，包含 P1 rounds/select 与 P2 Campaign / KOL 接口。 |
| `migration-v1/` | workspace/storage 解耦迁移计划与执行说明。 |

## 0530 核心原则

1. LLM 只能生成可编辑、可确认的中间 artifact；artifact 一旦 approve，后续 provider prompt 必须由确定性 compiler 或已确认字段组装，不再让文本模型改写。
2. 所有 provider-facing prompt 均以中文构建，尤其是 Seedance 视频生成 prompt。
3. 后端只接受 `workspaceId` / `shotId` / 用户自由文本指示；上游 artifact、素材 ref、首尾帧 URL、生成数量由后端注入。
4. `select` 只表示用户选择当前候选，不触发 stale；只有重新 propose / 重新生成一轮候选，才把旧轮次标记为 `STALE`。
5. workspace 与 storage binding 分离：`POST /api/workspaces` 只创建逻辑会话，`POST /api/workspaces/:workspaceId/storage/bind` 才绑定 local/S3；未绑定时 `nextAction=BIND_STORAGE`。
6. 后端测试先证明契约和状态机正确，再接真实 provider smoke；新版本测试前先执行 `pnpm db:clear -- --yes` 清理 Postgres business tables。
