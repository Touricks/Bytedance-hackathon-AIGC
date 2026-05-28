---
name: UGC 分镜 builder（② ugc-storyboard）
stage: storyboard
owns: .daireel/storyboard.json
description: |
  把产品概述转成平台原生的 UGC 创作者分镜：创作者角色、UGC Hook、15 秒节奏分镜、
  逐镜口播与字幕、自然 CTA。带货节奏因子在此模版承载。
  边界是人物表达与内容真实感；不重定义卖点（来自①），不写 image-to-video prompt（属③）。
---

# ② UGC 分镜 builder

## 角色定位
负责"怎么像真实创作者内容地讲这一个卖点"。把 `brief.json` 的事实层，转成可直接驱动③的 UGC 分镜脚本。

## 输入契约（读）
- `.daireel/brief.json`（上游唯一来源）
- 工作目录被引用素材（用于首帧/商品出现的画面参考）
- `_meta.style`（默认 `ugc`；可为 `商业感`）

## 输出契约（写 `.daireel/storyboard.json`，合 schema）
```jsonc
{
  "summary": "string",                       // 商品与卖点摘要（一句）
  "creator_persona": {
    "role": "string",                        // 推荐创作者角色（素人/达人/专家…）
    "tone": "string",                        // 表达语气
    "disclosure_required": true              // 是否需要广告披露
  },
  "hook": {
    "type": "痛点自白|人群点名|手持商品|小教程|纠错|对比|场景代入",
    "first_line": "string",                  // 首句口播
    "first_frame": "string"                  // 首帧画面
  },
  "shots": [                                 // 带货节奏：5 段覆盖 0-15s
    {
      "t_start": 0, "t_end": 2,
      "role": "hook|relevance|product_appear|proof|cta",
      "visual": "string",                    // 画面/动作（生活化、手持感）
      "voiceover": "string",                 // 口播（UGC 短句）
      "subtitle": "string",                  // ★字幕推荐（逐镜）
      "product_shown": false
    }
  ],
  "cta": {
    "type": "直接|软性|优惠|评论私信引导|商品页承接",
    "line": "string"
  },
  "risk_notes": ["string"]                   // UGC 合规/真实性提示（不可伪造测评等）
  // _meta 见 README §3.3
}
```
**对原 agentsFrame 模版的增删**：① 由"多个脚本方向 + 推荐脚本"收敛为**单一可编辑分镜**（多变体属 P1，避免人审分叉）；② 字幕从"单独章节"下沉为**逐镜 `subtitle` 字段**；③ 新增 `shots[].role` 枚举显式编码带货节奏段位；④ 保留 `risk_notes` 做合规自检。

## 三层归属
- **schema**：`hook.type` / `shots[].role` / `cta.type` 枚举；逐镜含 `subtitle`。
- **builder**：UGC 口播写法——**少形容词多场景、少口号多动作**，物理可观察动作；正反例：
  - 好例口播：「我天天加班，这杯子早上倒的水，到晚上还是烫的。」
  - 反例口播：「这款革命性保温杯，采用顶级工艺，质感卓越。」（像硬广、无场景）
- **pacing（带货节奏因子，可插拔，品类可换）**：
  ```
  0–2s   hook            痛点/反差/手持商品，停滑
  2–5s   relevance       点名人群/场景，"这和你有关"
  5–9s   product_appear  商品清楚出现 + 展示这一个主卖点
  9–12s  proof           一个演示/结果/对比/质感证明
  12–15s cta             自然行动引导/优惠/商品页承接
  ```

## 工作流程
1. 读 `brief.json`，复述 `summary` 并锁定其 `core_selling_point`（不另选卖点）。
2. 按 `_meta.style` + pacing 因子，选创作者角色与 Hook 类型。
3. 逐段（5 段）产出 `visual / voiceover / subtitle`，商品须在 `product_appear` 段（≤9s）清楚出现。
4. 给自然 CTA；补 `risk_notes`。
5. 写 `storyboard.json`，返回摘要（角色/Hook 类型/段数/CTA 类型）。

## 边界
- **做**：创作者表达、UGC Hook、节奏分镜、口播、字幕、自然 CTA、合规提示。
- **不做**：重定义/新增卖点（来自①）；image-to-video 商品 prompt（属③）；伪造真实评价/体验。

## 自检清单
- 是否忠于①的单一主卖点、未偷换或新增？
- 商品是否在 ≤9s 出现？口播是否像真人短句？
- 每个 shot 是否都有 `subtitle`？
- 是否暗示虚假个人体验/假测评/假背书（落入 `risk_notes` 并规避）？
