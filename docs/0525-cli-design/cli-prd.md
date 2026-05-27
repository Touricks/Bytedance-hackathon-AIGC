# PRD：DaiReel —— 本地部署的商家带货视频生成 CLI

> 工作名 **DaiReel**（带货 + Reel，呼应 ArcReel），名称可改。
> 一句话核心业务价值：**商家在本地工作目录引用商品素材、给一句需求，AI 分阶段提议（产品概述 → UGC 分镜 → 视频剧本），人在可编辑 Web 逐段改后批准，一键出 ≤15s 可投放带货视频，并可按反馈迭代。**
>
> 状态：草案 v0（由会话上下文综合而成，待复审）
> 关联材料：`AAA-discussion/origin/prd_safe.pdf`（赛题需求）、`arc_codex_r4.md`（现有带货系统基线）、`events.jsonl`（真实链路 trace）、ArcReel 仓库核心 prompt 体系。

---

## Problem Statement

商家想把"一个商品 + 一句带货诉求"快速变成可投放的短视频，但当前两类做法都不顺手：

- **现有带货链路（arc_codex r4）是"一次性蓝图 → 一段整片"**：商家填表单 → 模型一次性出蓝图 → 一次出片。剧本与分镜对商家**只读、不可改**；要调整只能改输入字段重跑，迭代回路长、可控性差。
- **赛题需求（prd_safe）要的是"素材 → 剧本 → 创作"可干预闭环**，强调剧本要能看清 Hook/卖点/受众/CTA、分镜可编辑、商品一致性（必须保留 Logo/包装）、长任务进度与失败兜底，并希望与商家现有 coding agent / 发文动线打通。

商家（及其使用的通用 agent，如 codex/claude）缺少一个**本地可一键部署、agent 友好、且让人能在每一步"看见并修改"剧本与分镜**的工具：既要 AI 主动提议，又要人能在可编辑 Web 界面里改了再批准，而不是被动看引导。

---

## Solution

一个**本地部署**的带货视频生成系统，由三部分组成：

1. **DaiReel CLI**：一键完成本地部署（检查 Docker、注入 API key 到 `.env`、`docker compose up` 拉起服务栈），并把服务能力以 **bash 命令**暴露；通过把 SKILL 注入到 `~/.codex/skills` 与 `~/.claude/skills`，让**通用 agent 自动感知**这些命令的存在。
2. **本地服务栈（docker compose）**：FastAPI 后端（封装火山引擎 **Seedpro 2.0** 文+图→剧本/分镜、**Seedance** 图生视频）+ **可编辑交互式 Web 应用**（剧本/分镜的人审与修改 + 看板）+ **Postgres**（跨线程注册表与当前快照）。
3. **工作目录线程模型**：用户指定一个本地工作目录即开启一个"线程"，中间数据落在该目录的 dot 文件夹 `.daireel/`（单线程真相源）；用户给初始文字 prompt 并**引用工作目录下的图片/视频文件**作为商品素材。

交互范式：**agent 先提议（生成）→ 结果以可编辑表单推到 Web → 用户改并批准 → 推进下一阶段**。服务侧**线程状态机是单一协调者**，agent 与 Web 都是推进同一线程的无状态客户端；agent 在每个用户回合通过状态检测"定位首个未完成阶段"自动接续（复用 ArcReel manga-workflow 的中断恢复编排）。

视频生成 MVP 走**单条整片**：⓪ 素材清点 `assets`（扫描工作目录素材）→ ① 产品概述 `brief` → ② UGC 分镜 `storyboard` → ③ 视频剧本 `shotprompt`（附录1 式）→ 确定性编译 → 一次 Seedance 图生视频（≤15s）。三个创意阶段均**人可审阅并直接修改**。多镜头 per-shot 渲染 + ffmpeg 拼接为 P1。模版契约详见 `builder-templates/`。

---

## User Stories


### 本地部署与配置
1. 作为商家，我想通过cli检查本机 Docker 是否就绪，以便在出问题前知道缺什么。
2. 作为商家（未装 Docker），我想让cli给出官方安装引导链接，以便我自行装好 Docker Engine（CLI 不代我安装系统级 Docker）。
3. 作为商家，我想通过cli在docker上拉起整套服务（后端 + Postgres），以便一键完成本地部署。
4. 作为商家，我想用一条命令启动服务并打开前端页面，以便被引导着操作。
5. 作为商家，我想在前端被引导着填入火山引擎 API key，让 CLI 自动写入 `.env`，以便我不用手工编辑配置文件。
6. 作为商家，我想 CLI 校验 `.env` 完整性（key 是否齐全/有效），以便尽早暴露配置错误而非在生成时才失败。

### 服务启动与 agent 感知
7. 作为通用 agent 用户，我想 CLI 把 SKILL 注入到 `~/.codex/skills` 与 `~/.claude/skills`，以便我的 agent 自动知道带货服务与其 bash 命令的存在。
8. 作为通用 agent，我想读到一份 SKILL 说明（命令清单 + 工作流 = 状态检测→提议→交 Web 评审），以便我正确驱动整个流程。

### 线程 / 工作目录
9. 作为商家，我想通过指定一个本地工作目录来开启一个线程（数据库建档），以便每个带货项目相互隔离。
10. 作为商家，我想 CLI 在工作目录下创建 `.daireel/` 存放全部中间数据，以便项目随目录走、可移植、可纳入版本管理。
11. 作为商家，我想用一条命令列出本机所有已登记为线程的工作目录，以便知道自己做过哪些项目。
12. 作为商家，我想看到每个线程当前已有的剧本/分镜/视频链接（如存在），以便快速判断进度（不需要历史版本）。
13. 作为 agent，我想用一条命令查询某线程当前所处阶段，以便每个回合自动接续到下一个未完成步骤。

### ① 产品概述 / ② UGC 分镜 / ③ 视频剧本（三阶段创意层，均可人审编辑）
14. 作为商家，我想给一句初始需求 prompt 并引用工作目录下的商品图，让系统产出 **产品概述 `brief`**（商品事实/受众/单一主卖点/证明/约束），以便确立策略底座。
15. 作为商家，我想在产品概述确认后让系统产出 **UGC 分镜 `storyboard`**（创作者角色/Hook/脚本/CTA/逐镜字幕），以便拿到平台原生脚本。
16. 作为商家，我想在 UGC 分镜确认后让系统产出 **视频剧本 `shotprompt`**（附录1：商品/必须保留/镜头/运动/演示/结尾/限制），以便精确控制画面与商品保真。
17. 作为商家，我想在可编辑 Web 表单里**直接修改**产品概述 / UGC 分镜 / 视频剧本的任意字段，以便表达意图而不是只能看。
18. 作为商家，我想这三个创意阶段各是一个**批准 gate**（改完点批准再推进），以便逐步把控质量。
19. 作为 agent，我想在每个阶段提议后提示用户去 Web 评审并结束本回合（不轮询不阻塞），以便符合 turn-based 工作方式。
20. 作为商家，我想"必须保留 / 限制"清单被严格带入生成，以便商品的 Logo/包装/形状不被篡改。
21. 作为商家，我想视频剧本只用**一个主镜头运动**，以便画面稳定、商品不漂移变形。
22. 作为商家，我想每个阶段的产出都能独立编辑、按需局部重生成而不必从头重来，以便最小代价迭代。

### 视频创作与下载
23. 作为商家，我想批准分镜后系统据修改后的 brief 出一条 ≤15s 的整片视频，以便直接拿到成品。
24. 作为商家，我想在视频生成这种长耗时任务期间看到进度，以便知道还要等多久。
25. 作为商家，我想通过下载接口/链接拿到视频文件，以便去投放或二次处理。
26. 作为商家（生成失败时），我想看到可读的失败原因（API key 失效 / 内容审核未过 / 商品图非法）并能重试，以便排障而非面对静默失败。
27. 作为商家，我想任意阶段中断后还能恢复到上次进度，以便不必从头再来。

### 反馈回环
28. 作为商家，我想看完视频后给出看法，让系统回到"改剧本"或"改分镜"阶段重生成，以便持续迭代到满意。
29. 作为商家，我想反馈能被路由到正确的阶段（策略问题→剧本，画面问题→分镜），以便最小代价修正。

### 可观测性
30. 作为商家/开发者，我想每个线程在 `.daireel/trace/events.jsonl` 里留下生成链路的 trace 事件，以便排查长链路问题。
31. 作为商家，我想 trace 对敏感数据脱敏（API key、原始图 base64 不落盘，仅留 mime/byteSize/sha256），以便安全地分享日志。
32. 作为商家，我想前端看板展示该线程的剧本/分镜/视频状态，以便一屏看清全貌。

---

## Implementation Decisions

### 待拍板的栈选择（唯一前置决策）
- **默认采用 Python/FastAPI 后端**，以便**几乎原样复用 ArcReel 的 prompt 资产**（`prompt_builders*.py` / `script_models.py` / `prompt_rules/episode_pacing.py`）。CLI 与 Web 用 Node/TS（贴合赛题技术栈与飞书 CLI/npx 习惯）。
- 备选：全 Node/TS（对齐现有 arc_codex），代价是把 ArcReel prompt 体系移植到 TS。数据流与接口不随该选择改变，仅 prompt 层实现不同。

### 拟构建的"深模块"（简单接口、可隔离测试、少变更）
1. **线程状态机（ThreadStateMachine）**：纯函数式状态迁移；输入当前态 + 事件 → 下一态。状态：`draft → materials_ready → brief_proposed → brief_approved → storyboard_proposed → storyboard_approved → shotprompt_proposed → shotprompt_approved → video_generating → video_ready →（feedback 回 brief/storyboard/shotprompt）`，任意态 `→ failed`。`materials_ready`（步0）为轻量可审、默认自动推进；三个创意阶段各为一个人审 gate。这是 agent 与 Web 的单一协调者。
2. **DotStore（工作目录真相源存取）**：读写 `.daireel/` 下 `thread.json / script.json / storyboard.json / board.json / outputs/ / trace/events.jsonl` 的文件式仓库；接口与底层文件布局解耦。
3. **PgSnapshotMirror（跨线程瘦索引）**：把 DotStore 的"当前快照"同步进 Postgres，仅服务两项功能——(1) 本机已登记线程的列表；(2) 各线程当前剧本/分镜/视频链接快照（current-only，无历史）。不存详情、不存大文件、**不存 trace**。
4. **Builder 模版层（复用 ArcReel 三层解耦，Path X）**：服务端 3 个创意 builder（① 产品概述 `brief` → ② UGC 分镜 `storyboard` → ③ 视频剧本 `shotprompt`）+ ④ feedback 路由 builder。各模版 schema 驱动（`response_schema` 强约束、`_meta` 隐藏运行时字段，对应 ArcReel `SkipJsonSchema`）；带货节奏因子复用 `episode_pacing.py` 机制（0-2 Hook / 2-5 相关 / 5-9 商品 / 9-12 证明 / 12-15 CTA），落在 ②、可插拔。契约详见 `builder-templates/`。
5. **ShotPromptCompiler（确定性，`shotprompt.json` → Seedance prompt）**：把已批准的 ③ 附录1 剧本编译成单条整片 Seedance 文本 prompt（`must_preserve`/`constraints` → 商品一致性约束 + 反向尾巴"禁止出现：BGM/文字字幕/水印"）。纯函数、易测；**非 LLM 模版**。
6. **Provider 客户端（SeedproClient / SeedanceClient）**：封装火山引擎调用边界；Seedpro 为文+图多模态（商品图作 `image_url`），Seedance 为图生视频任务（创建→轮询→产出 URL，复用 events.jsonl 已验证的轮询模式）。统一 `MODEL_MODE=mock|real`。
7. **CLI 命令层**：薄封装，把 bash 子命令映射到后端 HTTP；命令面与状态机对齐（见下表）。
8. **SkillInjector**：把 SKILL.md 写入 `~/.codex/skills`、`~/.claude/skills` 及项目本地 `.codex/skills` `.claude/skills`。
9. **MaterialIntake（步0：素材清点，逻辑上先于①）**：两段式——确定性扫描+校验工作目录素材（类型/大小/真实位图字节，复用 arc_codex `image-validation`）→ 多模态打标（role/relevance/主图建议）→ 写 `assets.json`。①/③ 的素材引用只能指向其 `usable` 项。详见 `builder-templates/0-material-intake.md`。

### 数据架构（真相源原则）
- **`.daireel/`（每工作目录）= 单线程真相源**：文件式（JSON + 媒体 + JSONL trace），git 友好，ArcReel 风格。
- **Postgres（中心，docker 内）= 跨线程瘦索引 + 当前快照镜像**：仅注册表 + 当前剧本/分镜/视频链接，current-only，无历史，无 trace，无详情。
- 二者职责不重叠；DotStore 是写入源，PgSnapshotMirror 是派生缓存。

### 服务接口（bash 命令 → 状态迁移）
- `deploy check` / `deploy init`（检查 docker、注入 .env、compose up）
- `serve`（启动服务、开 Web）
- `thread create --dir .`（建档：PG 注册 + scaffold `.daireel/`）→ `draft`
- `thread list`（读 PG）/ `thread status [--dir .]`（agent 状态检测入口）
- `materials index [--dir .]`（步0：扫描+校验+多模态打标 → `assets.json`）→ `materials_ready`；`materials show`
- `brief generate --prompt "…" [--ref product.jpg]` → `brief_proposed`；`brief show` / `brief approve`（主走 Web）→ `brief_approved`
- `storyboard generate` → `storyboard_proposed`；`storyboard approve` → `storyboard_approved`
- `shotprompt generate` → `shotprompt_proposed`；`shotprompt approve` → `shotprompt_approved`
- `video generate`（编译 + Seedance 轮询）→ `video_generating` → `video_ready`；`video download`
- `feedback "…"`（路由回 brief/storyboard/shotprompt）→ 回环
- `skill install`

### 交互/编排决策（方案 A）
- 服务状态机为单一协调者；**agent 不轮询、不阻塞**：每回合 `thread status` → 推进下一个未完成提议 → 提示用户去 Web 评审 → 结束回合。
- **Web 负责编辑 + 批准**，批准把状态推进一格。用户下次对 agent 说"继续"即自动接续（ArcReel manga-workflow 模式）。
- 已知 UX 摩擦：批准后控制权需回交 agent（ping-pong），Web 在批准后显式提示"回到 agent 输入继续"。

### Schema / 契约（4-artifact，详见 `builder-templates/`）
- **⓪ 素材清单 `assets.json`（步0 产物）**：`{ scanned_at, primary_product_ref, assets[]{ref,kind,mime,bytes,sha256,role,description,relevance,usable,included}, rejected[] }`。①/③ 的素材引用只能指向其 `usable:true` 项。
- **① 产品概述 `brief.json`**：`{ product{name,category,key_facts[],assets[]→引用 assets.json}, audience{who,pain_or_desire}, core_selling_point(单值), proof[], offer, platform, brand_tone, banned_expressions[], assumptions[] }`。
- **② UGC 分镜 `storyboard.json`**：`{ summary, creator_persona{role,tone,disclosure_required}, hook{type,first_line,first_frame}, shots[]{t_start,t_end,role,visual,voiceover,subtitle,product_shown}, cta{type,line}, risk_notes[] }`。
- **③ 视频剧本 `shotprompt.json`（附录1）**：`{ duration_sec, aspect_ratio, product{name,role,reference_assets[]}, must_preserve[], audience, use_case, hook_moment, product_moment, motion, camera(单值), demo_action, lighting_style, ending, constraints[] }`，隐藏 `_compiled` 由编译器回填。
- 各 artifact 带隐藏 `_meta`（stage/status/version/style…，对应 ArcReel `SkipJsonSchema`）；中文值、英文键。
- **商品图为视觉真相源**，prompt 不臆造 Logo/文字（复用 reference_video 模式"外观由参考图承担"的思想）。

### 复用 ArcReel 的"三层解耦"（schema / builder / pacing）—— DaiReel 剧本/分镜生成的工程骨架

ArcReel 把"剧本生成这一步"按三种关注点拆开、各放一处、为不同原因而改。DaiReel 的 Seedpro 出剧本/分镜这一步**照搬同一切分**：

| ArcReel 层 | 管什么 | 机器可校验 | 变更频率 | DaiReel 对应物 |
|---|---|---|---|---|
| **结构约束 schema** | 字段/类型/枚举/必填/对 LLM 隐藏的字段；作 `response_schema` 强约束，模型结构上写不错 | 是 | 几乎不变 | 剧本 schema + 附录1 分镜 brief schema，由 **SeedproClient 作 response_schema** |
| **内容写法 builder** | 每个字段怎么写好（视角切换 + 正反例），**故意不重复 schema 已约束的枚举**，不写 LLM 无法自检的硬限制 | 否（示例引导） | 改写作质量时变 | **剧本/分镜 PromptBuilder**（深模块 4） |
| **体裁因子 pacing** | 体裁级创作策略（钩子/转折/收尾节奏），可插拔、跨 builder 与 subagent 共享、有防漂移测试 | 否（方法论） | 换品类/体裁时变 | **带货节奏因子**（深模块 4 内，可插拔） |

**解耦的工程纪律（直接搬用）**：① builder 不碰 schema 的活（枚举/必填全推给 `response_schema`）；② 不写 LLM 无法自检的字数硬限制，用示例隐性表达；③ pacing 因子独立成块、被多处复用并用 sync 测试防漂移。

**为何对带货值钱**：pacing 因子的产品化 = 赛题要的"**策略×因子**库 / 爆款仿写 / 灵感模板"。不同品类（美妆/3C/食品）换不同因子即可，schema 与写作手艺不动。MVP 先硬编码一份带货默认因子，P1 再做成可检索/可挑选的因子库。附录1 的 `must_preserve` / `constraints` 即 ArcReel `productConsistencyRules` + 防崩短语的带货版"约束库"。

> 三层对应的 ArcReel 真实文件与行号见文末「附：ArcReel 参考文件索引」。

---

## Testing Decisions

- **测外部行为，不测实现细节**：断言命令/接口的可观察产出与状态迁移，不断言内部函数调用。
- **ThreadStateMachine**：纯函数式迁移的穷举测试（合法迁移、非法迁移被拒、failed 可从任意态进入、feedback 回环路由正确）。
- **ShotPromptCompiler**：给定附录1 brief → 断言编译出的 Seedance prompt 含"必须保留/限制"约束与反向尾巴；正反例对照（参考 ArcReel prompt builder 的正反例测试风格）。
- **DotStore ↔ PgSnapshotMirror 一致性**：写入 DotStore 后 PG 快照同步正确，且 PG 不含历史/trace。
- **Provider 客户端**：`MODEL_MODE=mock` 下确定性产出跑通端到端 + CI；`real` 模式留作 operator 手动 smoke（不进默认 CI），复用 arc_codex 的 smoke 思路。
- **端到端（mock）**：thread create → brief → storyboard → shotprompt → video → download → feedback 回环，验证状态机驱动的完整闭环与断点恢复。
- 待与用户确认：上述哪些模块**优先写测试**（建议至少 ThreadStateMachine、ShotPromptCompiler、DotStore↔PG 一致性三块）。

---

## Out of Scope

- **商品链接输入 + 服务端抓图**（P1）：MVP 只支持用户在工作目录引用本地图片/视频文件。
- **多镜头 per-shot 渲染 + ffmpeg 拼接**（P1）：MVP 只做单条整片（一次 Seedance 调用）。
- **素材库 / Embedding 多颗粒度检索与智能召回**（P1，PRD 的素材模块进阶项）。
- **看板"因子 × 转化"归因可视化、A/B 自动出片对比**（P1/P2）。
- **TTS / 多语言配音 / 字幕 / BGM 合成**（P1）。
- **历史版本记录**：Postgres 与 Web 均只呈现当前态，不做版本历史。
- **CLI 代装系统级 Docker Engine**：仅检测 + 引导链接。
- **生产级可观测性后端**：trace 保持文件式 JSONL。
- **真实电商后台对接 / 分发与转化真实数据**：按赛题 FAQ 用 mock 或自建模拟服务。

---

## Further Notes

- **复用 ArcReel 的差异化价值**：ArcReel 已把"结构约束（schema）/ 内容写法（builder）/ 体裁因子（pacing rules）"三者解耦，正是赛题"分层策略库 + 因子库 + 约束库"的工程雏形；DaiReel 把它从"小说体裁"迁到"带货体裁"。
- **与现有 arc_codex 的关系**：arc_codex r4 是"一次性蓝图 + 一段整片"的只读基线；DaiReel 的增量在于**可编辑人审闭环 + 工作目录线程模型 + agent 状态检测编排**。
- **风险点**：(1) 火山引擎 Seedpro 2.0 / Seedance 的真实 API contract 尚未逐字核对（按 arc_codex 的 Ark video task 推断），落地前需对照火山引擎 OpenAPI 校验；(2) 商品图内容审核失败的兜底文案需补；(3) 方案 A 的 agent↔Web 控制权回交 UX 需打磨。
- **赛期约束**：20 天黑客松；P0 即可构成端到端可演示闭环，满足赛题"可访问 / 可理解 / 可复核 / 能体现全栈能力"的交付原则。
- **后续动作**：本 PRD 可经 `writing-plans` 转为分阶段实现计划，或 `to-issues` 切成可独立认领的纵切片任务。

---

## 附：ArcReel 参考文件索引（带进原项目文档用）

> 仓库根：`ArcReel/`（本机：`/Users/carrick/ResearchWorkspace/Reference/ArcReel`）。下列为**仓库相对路径**；行号基于探索时版本，可能漂移，定位以符号名为准。
> **这些文件已复制到 `arcreel-reference/`**（与本 PRD 同级）；原项目无法访问 ArcReel 仓库时，直接用该离线包，索引见 `arcreel-reference/README.md`。

### 三层解耦的真实出处

| 层 | 文件（ArcReel/ 下） | 关键符号 / 行号 | 看点 | DaiReel 对应模块 |
|---|---|---|---|---|
| **schema** | `lib/script_models.py` | `class ImagePrompt`(L62) / `VideoPrompt`(L69) / `NarrationSegment`(L93) / `DramaScene`；`SkipJsonSchema`(L13,111–114)；注释"Gemini response_schema"(L5) | Pydantic 强约束 + 对 LLM 隐藏运行时字段 | 剧本 / 附录1 分镜 brief schema |
| **builder** | `lib/prompt_builders_script.py` | 设计哲学 docstring(L4「不重复 schema 枚举」、L7「不写无法被 LLM 自检的字数限制」)；`_SCENE_WRITING_GUIDE`(L59)；`_ACTION_WRITING_GUIDE`(L67)；`build_narration_prompt`(L88)；`build_drama_prompt`(L189) | 视角切换 + 正反例写作指引 | 剧本/分镜 PromptBuilder |
| **pacing** | `lib/prompt_rules/episode_pacing.py` | `DRAMA_PACING_RULES`(L15)；`NARRATION_PACING_RULES`(L23)；`render_pacing_section`(L30)；docstring「逐字镜像 + 防漂移」(L7–9) | 体裁因子独立成块、可插拔 | 带货节奏因子 |
| pacing 开关 | `lib/prompt_rules/__init__.py` | `is_v2_enabled`(L17) | 因子启用闸（灰度） | 因子开关 |

### 约束库 / 一致性 / 编排 周边

| 文件（ArcReel/ 下） | 看点 | DaiReel 对应 |
|---|---|---|
| `lib/prompt_builders.py` | `_NEGATIVE_TAIL_VIDEO`「禁止出现：BGM/文字字幕/水印」、`_*_GUARD` 防崩短语、`build_character/scene/prop_prompt`、`append_video_negative_tail` | `must_preserve`/`constraints` 约束 + 反向尾巴 + BriefCompiler |
| `lib/prompt_builders_reference.py` | `build_reference_video_prompt`：用 `@名称` 引用、**禁止描写外观**（由参考图承担一致性） | 商品图作视觉真相源、prompt 不臆造 Logo/文字 |
| `lib/script_generator.py` | 把 schema + builder 串起来调模型 + `_add_metadata` 注入隐藏字段（集号等真相源） | SeedproClient 的生成编排 |

### pacing 因子的 subagent 镜像 + 防漂移测试（"因子可复用"的证据）

| 文件（ArcReel/ 下） | 看点 |
|---|---|
| `agent_runtime_profile/.claude/agents/split-narration-segments.md` | pacing 文本被逐字镜像进 subagent 指令 |
| `agent_runtime_profile/.claude/agents/normalize-drama-script.md` | 同上（drama 体裁） |
| `agent_runtime_profile/.claude/skills/generate-script/SKILL.md` | skill 如何调用 generate-script 串起三层 |
| `tests/prompt_rules/test_subagent_md_sync.py` | **防漂移**：builder/pacing 与 subagent .md 文本不一致即失败 |
| `tests/prompt_rules/test_episode_pacing.py` | 因子渲染单测 |
| `tests/test_prompt_builders_script_v2.py` | builder 输出（正反例/字段指引）单测 |

### 取用方式

参考文件已打包在 `arcreel-reference/`（`lib/` + `agents/` + `skills/` + `tests/`，共 13 个文件）。带进原项目时，把 `content_claude/` 整个目录（本 PRD + `builder-templates/` + `arcreel-reference/`）一起拷过去即可，**无需访问 ArcReel 仓库**。
