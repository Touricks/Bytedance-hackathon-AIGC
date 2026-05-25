# DaiReel 服务端 Builder 模版契约（Path X）

> 本目录定义 DaiReel **服务端 builder 层**的 4 个 prompt 模版及其**边界 / 输入输出契约**。
> 设计原则照搬 ArcReel 的"三层解耦 + 文件契约 + 单一 artifact owner"。
> 状态：草案 v0，待复审。配套 PRD：`../20260525-143155-daireel-带货视频生成cli-prd.md`。

---

## 0. 定位（Path X）

- 这 4 个模版是**服务在每个阶段调用火山引擎 Seedpro 时使用的 prompt 模版**；智能在服务侧。
- 外部通用 agent（codex/claude）是**薄编排**：状态检测 → 触发对应阶段生成 → 提示用户去 Web 评审 → 结束回合。
- 三个创意阶段（①②③）产出**人可审阅并直接修改**的 artifact；④ 是迭代回环的路由器。

## 1. 标准管线与 artifact

```
prompt + workdir ─►⓪ assets.json ─►① brief.json ─►② storyboard.json ─►③ shotprompt.json
                                                              │
                          (确定性编译器: schema 校验 + 反向尾巴; 非 LLM 模版) ─┘
                                                              ▼
                                                    Seedance ─► video
④ feedback 路由: video + 看法 ─► 判定回 ①/②/③ + 修改指令 ─► 目标阶段带指令重生成
```

| 模版 | artifact（`.daireel/` 下） | 人审 | 文件 |
|---|---|---|---|
| ⓪ 素材清点 | `assets.json` | 轻量可审/自动推进 | [0-material-intake.md](./0-material-intake.md) |
| ① 产品概述 | `brief.json` | ✅ 可编辑+批准 | [1-product-brief.md](./1-product-brief.md) |
| ② UGC 分镜 | `storyboard.json` | ✅ 可编辑+批准 | [2-ugc-storyboard.md](./2-ugc-storyboard.md) |
| ③ 视频剧本 | `shotprompt.json` | ✅ 可编辑+批准 | [3-video-shotprompt.md](./3-video-shotprompt.md) |
| ④ feedback 路由 | 路由决策（不直接改 artifact） | 提议→确认 | [4-feedback-router.md](./4-feedback-router.md) |

> 确定性编译器（`shotprompt.json → Seedance text prompt`）是**代码/skill，不是 LLM 模版**，故不在本目录的 4 个模版内；它做 schema 校验、把 `must_preserve`/`constraints` 写入约束、追加反向尾巴"禁止出现：BGM/文字字幕/水印"。

## 2. 三层解耦（每个模版都按此切分）

| 层 | 管什么 | 落点 |
|---|---|---|
| **schema** | 字段/类型/枚举/必填/隐藏字段；作 `response_schema` 强约束 | 各文件「输出契约」 |
| **builder** | 每个字段怎么写好（视角 + 正反例），**不重复 schema 已约束的枚举** | 各文件「工作流程」 |
| **pacing** | 体裁级节奏因子（可插拔、品类可换） | 主要在 ② |

来源（ArcReel `lib/`）：schema=`script_models.py`；builder=`prompt_builders_script.py`；pacing=`prompt_rules/episode_pacing.py`。

## 3. 通用约定（所有模版共享）

### 3.1 文件布局（单线程真相源）
```
<workdir>/
├─ <用户引用的素材，如 product.jpg / demo.mp4>
└─ .daireel/
   ├─ thread.json        状态机当前态 + 元数据
   ├─ assets.json        ⓪ artifact（可引用素材清单）
   ├─ brief.json         ① artifact
   ├─ storyboard.json    ② artifact
   ├─ shotprompt.json    ③ artifact（含编译产物 _compiled）
   ├─ board.json         前端看板详情
   ├─ outputs/video_*.mp4
   └─ trace/events.jsonl
```

### 3.2 IO 契约通则（ArcReel 铁律）
- **读**：上游 artifact 路径 + 线程配置 + 工作目录被引用的素材。**不接收大块自由文本**（除①的初始 prompt）。
- **写**：**唯一**的下游 artifact（合 schema）；命令侧只回**一段摘要**，大内容留在 `.daireel/`。
- 单一 owner：一个 artifact 只能由一个模版写；下游不得改写上游字段。

### 3.3 隐藏信封 `_meta`（不由 LLM 填，服务运行时管理）
每个 artifact 都带：
```jsonc
"_meta": {
  "stage": "brief|storyboard|shotprompt",
  "status": "proposed|approved|stale",
  "version": 1,
  "generated_at": "ISO8601",
  "model": "seedpro-2.0",
  "edited_by_user": false,
  "style": "ugc"            // 风格因子（默认 ugc；可选 商业感），见 §3.6
}
```
对应 ArcReel 的 `SkipJsonSchema`：这些字段**不进 `response_schema`**，避免 LLM 填写污染。

### 3.4 标记约定
- `assumed:true`：①里信息缺失时模型做的合理假设，须显式标注，供用户在 Web 优先复核。
- `status:"stale"`：feedback 回环后被置脏、待重生成的下游 artifact。

### 3.5 素材引用
- 一律用**相对工作目录**的文件名（如 `product.jpg`、`media/demo.mp4`），不写绝对路径、不内联 base64。
- 真实商品优先 image-to-video（③的 `reference_assets`），不臆造 Logo/文字。

### 3.6 风格因子（商业感 / UGC）
- 不是独立模版，是 `_meta.style` 一个因子，注入 ② 与 ③ 的 pacing/写法。
- MVP 默认 `ugc`；`商业感` 为可切换值。这是 pacing 层的复用点，未来可扩成因子库。

### 3.7 输出语言
- 所有**字符串值用中文**；**JSON 键名 / 枚举值保持英文**（对齐 ArcReel）。

## 4. 状态机（步0 + 3 个人审 gate）

```
draft
 → materials_ready     （步0：扫描+打标，轻量可审/自动推进）
 → brief_proposed      → brief_approved
 → storyboard_proposed → storyboard_approved
 → shotprompt_proposed → shotprompt_approved
 → video_generating    → video_ready
 →（feedback）回 brief / storyboard / shotprompt 任一已批准态
任意态 → failed（可读原因，可重试）
```
- agent 每回合 `thread status` 检测首个未完成 gate → 触发该阶段生成 → 交 Web 评审 → 结束回合。
- Web 负责编辑 + 批准，批准推进一格。

## 5. feedback 级联规则（详见 4-feedback-router.md）
- 回 ① → ②③ 置 `stale`；回 ② → ③ 置 `stale`；回 ③ → 仅重出 video。
- **不盲覆盖**：重生成时把"上一版 + 修改指令"一起喂 builder，已批准内容作 hint 保留。
- **提议→确认**：路由器先提议目标阶段与理由，用户确认后才重生成。

## 6. 与 PRD 的关系
- 本契约把 PRD 的 2-artifact（script/storyboard）**细化为 3-artifact**（brief/storyboard/shotprompt）。
- PRD 的「Schema/契约」与「状态机/服务接口」节应据此同步更新（可后续一并改）。

## 7. mock / real 与 trace
- 4 个模版都受 `MODEL_MODE=mock|real` 约束；mock 下产确定性 artifact 供端到端/CI。
- 每次生成写 `trace/events.jsonl`，敏感数据脱敏（key/base64 不落盘，仅 mime/byteSize/sha256）。
