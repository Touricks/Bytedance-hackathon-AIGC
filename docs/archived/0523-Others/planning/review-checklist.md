# 审阅清单

## 1. 架构口径

- [ ] 是否同意 P0/P1 不做分镜级渲染和 FFmpeg 拼接？
- [ ] 是否同意 `StoryboardShot` 定义为剧本结构单元，而不是渲染切片？
- [ ] 是否同意 P0 只有 `apps/web` 和 `apps/server` 两个主要部署物？
- [ ] 是否同意 worker 逻辑先内嵌 server，后续再物理拆出 `apps/worker`？
- [ ] 是否同意暂不抽 `packages/video` 和 `packages/ui`？

## 2. AI runtime

- [x] P0 默认使用官方 `openai` SDK 调 Ark/OpenAI-compatible endpoint。
- [ ] 是否同意 Vercel AI SDK Core 暂不作为默认依赖？
- [ ] 是否同意 OpenAI Agents SDK 先作为 trace spike，而不是主架构核心？
- [ ] 是否保留 Zod validation + one repair retry + fallback template？
- [ ] 是否需要在 P0 展示 trace，还是 P1 再做可视化？

## 3. 检索与数据

- [ ] 是否同意 Postgres 是业务事实源？
- [ ] 是否同意 Qdrant 只作为可重建向量索引？
- [ ] 是否同意不同时维护 pgvector 和 Qdrant 两套向量主路径？
- [ ] 是否同意 bge-m3 模型权重不进 git、不进镜像？
- [ ] 是否同意 `BGE_M3_MODEL_PATH` + `/models/bge-m3:ro` 的挂载约定？
- [ ] Qdrant + bge-m3 是 P0+ 加分项还是 P1？

## 4. 第三方库

- [ ] 是否采用 React Hook Form + Zod 做表单？
- [ ] 是否采用 TanStack Query 做 job polling？
- [x] P0 先用普通 file input，不引入 Uppy。
- [ ] 是否引入 fastify-type-provider-zod？
- [ ] 是否引入 bull-board 作为 demo 调试 UI？
- [ ] 是否把 Recharts 放到 P1 mock dashboard？

## 5. Worktree 与协作

- [ ] 是否先合 `feat/foundation-contracts`？
- [ ] 是否接受 `feat/ai-generation-pipeline` 同时修改 `packages/ai` 和 server jobs？
- [ ] 是否接受 `feat/web-creation-flow` 先基于 mock API 开发？
- [ ] 是否把 `feat/retrieval-qdrant-bge` 独立成增强分支？
- [ ] 是否限制业务分支随意修改 `packages/shared`？

## 6. P0 演示

- [x] V0 范围保持在商品素材上传、剧本生成、基础分镜、一键成片、任务进度、预览导出。
- [x] V0 主流程采用两步式：先预览剧本/基础分镜，再点击一键成片。
- [x] V0 剧本/基础分镜预览只读；用户只能通过结构化 UI 字段重新生成，不直接编辑图生视频 prompt。
- [ ] 是否有预置 demo 商品？
- [ ] 是否有 1-2 条预生成兜底视频？
- [ ] 是否可以无登录访问评委演示路径？
- [ ] 是否有 README / 运行说明？
- [ ] 是否有系统架构图或文字说明？
- [ ] 是否能用 5-8 句讲清端到端流程？

## 7. 待确认问题

1. 已确认：P0 必须真实调用 Ark 文本模型和 Seedance；相关配置已在 `.env` 中实现。
2. 已确认：P0 Seedance 主路径固定为图生视频，纯文本视频生成只作为兜底或实验路径。
3. 已确认：P0 需要真实上传，但先保存到 server 本地文件目录；MinIO/S3 推迟到对象存储升级。
4. 已确认：P0 v0 使用保守三段式 Seedance prompt 模板，StoryboardShot 只提供叙事灵感。
5. 已确认：复杂分镜编辑不进入 V0 主路径。
6. 已确认：移动端专项优化不进入 V0 主路径。
7. 已确认：V0 用户流程分成“先生成剧本/分镜预览，再点击一键成片”两步。
8. 已确认：V0 剧本/基础分镜预览只读确认；用户通过结构化字段修改后重新生成剧本。
9. 已确认：创作蓝图包含 `improvementHints`，通过 `fieldsToChange` 枚举引导用户修改结构化字段，不自动改 prompt。
10. 已确认：两步式流程后端拆成两个命令/API；创作蓝图生成返回蓝图，一键成片接收 scriptId 创建成片任务。
11. 已确认：创作蓝图生成同步返回，UI 使用普通 loading；只有成片任务进入异步进度轮询。
12. 已确认：创作蓝图同步返回前立即持久化 Product / Script / StoryboardShot / improvementHints，并返回稳定 scriptId。
13. 已确认：视频生成前修改草稿蓝图直接覆盖；蓝图用于成片后冻结只读，后续修改创建新的 Script version。
14. 已确认：同一个冻结 scriptId 可创建多个成片任务，GenerationJob 记录每次成片尝试。
