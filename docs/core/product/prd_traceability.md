# PRD Traceability

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Product goals mapped to architecture and tests
Depends On: `product/original_prd.md`, `product/product_scope.md`
Blocks: MVP readiness claims without acceptance evidence
Decision State: Accepted

## 1. Traceability Matrix

| Product goal | Architecture owner | Contract owner | Test evidence |
|---|---|---|---|
| Merchant reviews structured creative artifacts before downstream generation | `domain.md`, `runtime_flow.md` | `contracts/interface.md` workspace module endpoints | Server module API/unit tests; web creative-review tests |
| Users edit 创作要求, not raw prompts | `data_model.md`, `agent.md` | `PromptRequirementsData` in OpenAPI | `packages/shared` creative factor tests; web requirements form tests |
| Approved/current artifacts drive downstream modules | `domain.md` | Module state endpoints | Workspace service tests |
| 上游变更提示 does not erase downstream work | `runtime_flow.md`, `data_model.md` | `UpstreamDrift` responses | shot stale/upstream drift tests |
| Approved 分镜生成要求 must be explicitly applied | `runtime_flow.md`, `erd.md` | `/shot-sets` endpoints | shot-set and workspace API tests |
| Candidate counts are operation parameters | `backend.md`, `contracts/interface.md` | generation request schemas | shot/generation service tests |
| Stable video persistence gates selection and final compose | `backend.md`, `data_model.md` | video rounds/select endpoints | video worker and integration tests |
| 成片 carries 成片创作归因 | `data_model.md`, `erd.md` | final video and dashboard endpoints | final compose/dashboard/campaign API tests |
| Dashboard video list reads imported artifacts | `frontend.md`, `data_model.md` | dashboard endpoints | data dashboard web/API tests |

## 2. Readiness Gate

A feature that touches one of the goals above is not ready until docs, OpenAPI/interface mapping, and at least one targeted test are updated or explicitly deemed unchanged.

## 3. 课题功能分级映射（P0 / P1 / P2）

对照课题「功能分级与加分项」逐项核对：

| 分级 | 能力项 | 实现情况 | 状态 |
| --- | --- | --- | --- |
| P0 | 商品素材上传 | 多类型素材上传 + AI 素材解读审核（`apps/server/src/modules/workspace/`） | 已完成 |
| P0 | 剧本生成 | 商品卖点 → 分镜脚本 → 分镜生成要求三步链路，先草拟后批准（`packages/ai/src/workflows/`） | 已完成 |
| P0 | 基础分镜 | 15 秒三镜结构（Hook / 卖点证明 / 行动号召），逐分镜图 / 视频候选与选择（`apps/server/src/modules/shot/`） | 已完成 |
| P0 | 一键成片 | 全自动链路编排，中途可随时切回手动接管（`one-click-final-video.worker.ts`） | 已完成 |
| P0 | 任务进度 | 异步链路细粒度进度展示与失败反馈 | 已完成 |
| P0 | 预览导出 | 在线预览与下载，9:16 / 16:9 画幅 | 已完成 |
| P1 | 失败重试 | 429 / 5xx 分级重试 + 指数退避，轮询超时检测 | 已完成 |
| P1 | 生成过程 trace | 全链路 trace 事件双写 PostgreSQL 与本地事件文件 | 已完成 |
| P1 | Mock 数据看板 | 效果矩阵 / 转化漏斗 / 跨渠道对比 / AI 建议助手（`apps/web/src/features/data-dashboard/`） | 已完成 |
| P1 | 分镜级编辑 | 单镜带建议重生成、自定义分镜时长、素材切片替换 | 已完成 |
| P1 | 素材标签 / Embedding 检索 | 规则与标签驱动的素材匹配（role + relevance）；未接入向量检索 | 部分完成 |
| P1 | TTS / 字幕 / BGM | 分镜级口播文案 + 闭集 voiceProfile 注入视频 prompt，配音随视频同步生成；字幕 / BGM 未实现 | 部分完成 |
| P1 | 智能剪辑 Agent | 一键自动选图 + 成片自动编排；无素材切片级智能剪辑 | 部分完成 |
| P2 | 多因子归因 | 成片快照四因子 + 投放策略推荐引擎（`architecture/recommendation_engine.md`） | 已完成 |
| P2 | Agent 编排 | 5 个 AI workflow 串联，一键成片全链路自动执行 | 已完成 |
| P2 | 长任务体验 | 断点续传、幂等防重、失败保留中间产物 | 已完成 |
| P2 | 可观测性 | trace 审计 + 前端工作台状态展示 | 已完成 |
| P2 | CI/CD | 本地质量门禁（lint / 格式化 / 契约校验）；无云端流水线 | 部分完成 |
| P2 | A/B 对比 | 多候选生成为人工对比提供基础；无自动出片对比 | 未实现 |
| P2 | 合规审核流 | 因子引导真实性 / 合规边界 + prompt 级禁用表达与证据义务 + 全链路人工 approve | 已完成 |
| 创新（开放） | AI 创作因子推荐 / 参考视频导入 | 视觉模型推断四因子一键预填；参考视频分析自动预填创作要求 | 已完成 |

