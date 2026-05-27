# 交接文档：DaiReel 带货视频生成 CLI（设计→开发）

> 生成于 2026-05-25。上一会话完成了 DaiReel 的产品/架构设计与 prompt 契约；**下一步是回原项目做开发**。
> 本文只做导航与状态交接，**不重复**已落盘的 PRD/契约/对照图内容——按路径去读它们。

---

## 0. 一句话

本地部署的商家带货视频生成 CLI + 服务 + 可编辑 Web：商家在工作目录引用商品素材、给一句需求，AI 分阶段提议（产品概述 → UGC 分镜 → 视频剧本），人在可编辑 Web 逐段改并批准，一键出 ≤15s 带货视频并可按反馈迭代。复用 ArcReel 的"schema/builder/pacing 三层解耦"prompt 工程。

## 1. 权威产物在哪（先读这些，勿重写）

设计资料都在 ArcReel 仓库的 `AAA-discussion/` 下（本机 `/Users/carrick/ResearchWorkspace/Reference/ArcReel`）。**`content_claude/` 已做成自包含**，可整目录拷进原项目：

| 文件 | 内容 |
|---|---|
| `AAA-discussion/content_claude/cli-prd.md` | **PRD**（Problem/Solution/32 条 User Story/Implementation/Testing/Out-of-Scope/附录） |
| `AAA-discussion/content_claude/builder-templates/README.md` | 服务端 builder 层总约定（管线/三层/文件布局/状态机/级联/mock/trace） |
| `…/builder-templates/0-material-intake.md` … `4-feedback-router.md` | **5 个模版契约**（⓪素材清点 / ①产品概述 / ②UGC分镜 / ③视频剧本 / ④feedback路由），各含边界 + IO 契约 + JSON schema + 三层归属 |
| `AAA-discussion/agentsFrame/design/pipeline-overview.md` | **对照图**：模版×artifact×状态机（mermaid + ASCII + 三层落点表 + feedback 分类表） |
| `AAA-discussion/content_claude/arcreel-reference/` | **ArcReel 源码离线包**（13 文件，因原项目访问不到 ArcReel 仓库），含 README 索引 |
| `AAA-discussion/agentsFrame/agents/1-4*.md` | 用户最初草拟的 4 个 agent persona（已被收敛为上面的模版，留作出处） |
| `AAA-discussion/origin/` | 输入材料：`prd_safe.pdf`(赛题)、`arc_codex_r4.md`(现有带货系统基线)、`events.jsonl`(真实链路 trace) |

## 2. 已锁定的关键决策（细节见 PRD，勿再讨论）

- **架构 Path X**：智能在**服务端**（封装火山引擎 Seedpro 2.0 文+图→剧本/分镜、Seedance 图生视频）；外部通用 agent(codex/claude) 是**薄编排**（状态检测→触发生成→交 Web 评审→结束回合，不轮询）。
- **真相源**：工作目录 `.daireel/` 文件式（单线程真相源）；**Postgres 仅跨线程瘦索引/当前快照**（无历史、无 trace、无详情）；**trace 落 `.daireel/trace/events.jsonl`**。
- **管线（4-artifact + 编译 + 出片）**：`⓪ assets.json → ① brief.json → ② storyboard.json → ③ shotprompt.json →(确定性编译)→ Seedance → video`，`④ feedback` 路由回 ①/②/③。
- **状态机**：`draft → materials_ready → brief_proposed/approved → storyboard_proposed/approved → shotprompt_proposed/approved → video_generating → video_ready →(feedback)`，任意态 `→ failed`。①②③ 各为人审 gate；⓪ 轻量可审、默认自动推进。
- **MVP 单条整片**（≤15s，一次 Seedance）；per-shot 拼接、链接抓图、素材库 Embedding 检索、TTS/字幕/BGM、A/B、看板归因 = **P1+**。
- **部署**：用户自备 Docker → CLI `deploy check/init`（注入 .env + `compose up` 后端+Postgres）；不代装 Docker Engine。
- **三层解耦**：schema(`response_schema`+隐藏`_meta`) / builder(正反例写法) / pacing(带货节奏因子，落 ②、可插拔)。

## 3. 开发前必须先定/核对的事项（阻塞项）

1. **后端语言（唯一前置决策，PRD §0）**：默认 **Python/FastAPI**（原样复用 `arcreel-reference/` 的 prompt 资产）；备选全 Node/TS（对齐现有 arc_codex，但要移植 prompt 层）。**开工前先拍板。**
2. **火山引擎真实 API 契约**：Seedpro 2.0 / Seedance 的请求-响应/轮询/鉴权尚未逐字核对（现按 arc_codex 的 Ark video task 推断）。落地前对照火山引擎 OpenAPI 校验，必要时调 `arcreel-reference/` 里 provider 的字段映射。
3. **原项目位置/形态**：用户将"回原项目"开发；目标仓库路径未提供。把 `content_claude/` 整目录拷入作参考。

## 4. 风险/待打磨

- 方案 A 的 agent↔Web 控制权回交（ping-pong）：批准后需用户回 agent 说"继续"，Web 端要给显式提示。
- 商品图内容审核失败的兜底文案未定。
- `④ feedback` 路由"不盲覆盖 + 级联 stale + 提议→确认"逻辑较细，见 `4-feedback-router.md`。

## 5. 建议的下一步与 suggested skills

**下一步顺序建议**：先定后端语言(§3.1) → 用 `writing-plans` 把 PRD 转成分阶段实现计划 → `to-issues` 切纵切片 → `feature-dev` 逐切片开发（建议从 ThreadStateMachine + DotStore + ⓪/① 跑通最小闭环）。

**Suggested skills（下个 agent 可调用）**：
- `superpowers:writing-plans` —— 把 `cli-prd.md` 转成可执行实现计划（强烈建议先做）。
- `to-issues` —— 计划切成可独立认领的 tracer-bullet 纵切片。
- `feature-dev:feature-dev` —— 带架构意识的逐切片开发。
- `superpowers:test-driven-development` —— 状态机/编译器/DotStore↔PG 一致性优先 TDD（PRD Testing 节已点名这三块）。
- `grill-with-docs` —— 若开发中发现契约有歧义，回炉对着 PRD/契约再 grill。
- `claude-api`（若后端选 Python 且要接 Anthropic 风格）/ 直接对照 `arcreel-reference/` 复用 prompt builders。

**给下个 agent 的第一动作**：读 `AAA-discussion/content_claude/cli-prd.md` 与 `builder-templates/README.md`，确认 §3 的三个阻塞项，再开 `writing-plans`。

---

## 约束提醒（来自项目规范）

- 回复用户**必须用中文**。
- 提交信息/PR 不得出现模型代号、"Claude Code"、AI 署名等（用户全局规范）。
- Windows 兼容、ruff/basedpyright/pytest 等代码规范见 ArcReel `CLAUDE.md`（若在 ArcReel 仓内开发）。
