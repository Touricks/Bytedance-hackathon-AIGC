---
name: feedback 路由 builder（④ feedback-router）
stage: feedback
owns: 路由决策（不直接改任何 artifact）
description: |
  把用户对成片的看法分类，判定应回到 ①产品概述 / ②UGC分镜 / ③视频剧本 哪个阶段，
  并产出喂给目标 builder 的"修改指令"。
  边界是路由与指令；不直接重写 artifact、不自行重生成——由状态机执行重生成，且先提议后确认。
---

# ④ feedback 路由 builder

## 角色定位
负责"用户这条反馈应该改哪一层、怎么改"。是迭代回环的调度器，**不产创意、不改 artifact**，只产路由决策 + 修改指令。

## 输入契约（读）
- 用户对视频的看法（自由文本）
- 当前 `brief.json` / `storyboard.json` / `shotprompt.json`
- （可选）成片视频或其首帧，用于核对反馈所指

## 输出契约（写 路由决策；不写三个创意 artifact）
```jsonc
{
  "target_stage": "1|2|3",            // 回到哪个阶段
  "category": "string",               // 命中的看法类型（见分类法）
  "rationale": "string",              // 为何路由到该阶段（给用户看的解释）
  "edit_directive": {                 // 喂给目标 builder 的修改指令
    "keep": ["string"],               // 明确保留（避免重生成时丢失已认可内容）
    "change": ["string"],             // 要改什么
    "target_fields": ["string"]       // 建议改动的字段（对应目标 artifact 的 key）
  },
  "cascade": ["storyboard|shotprompt"], // 需置 stale 的下游 artifact
  "confidence": 0.0                   // 路由置信度；低时建议向用户澄清
  // _meta 见 README §3.3
}
```

## 分类法（看法 → 目标阶段）
| 用户看法类型 | target_stage | cascade（置 stale） |
|---|---|---|
| 卖点选错 / 受众不对 / 痛点不准 / 价格优惠 / 平台 / 品牌语气 / 踩禁用词 | **1**（产品概述） | storyboard, shotprompt |
| 创作者角色不合 / 口播不像真人 / Hook 不抓人 / 脚本节奏 / CTA 软硬 / 字幕 | **2**（UGC 分镜） | shotprompt |
| 商品不像原图 / 镜头运动 / 商品运动 / 演示动作 / 时长 / 结尾定格 / 某变化违规 | **3**（视频剧本） | （仅重出 video） |

## 三条规则（对齐 ArcReel "重做此阶段=附加修改要求后重新 dispatch"）
1. **不盲覆盖**：重生成时把"上一版 artifact + `edit_directive`"一起喂目标 builder，`keep` 内容作 hint 保留，未被 `change` 触及的字段优先继承。
2. **级联但可复用**：`cascade` 中的下游 artifact 仅置 `status:"stale"`，由其各自 builder 重生成（继承未触及字段），不在本模版改写。
3. **提议→确认**：先输出路由决策给用户（"建议改②，因为你说 Hook 不抓人"），用户在 Web/对话确认 `target_stage` 后，状态机才回退并触发重生成。`confidence` 低于阈值时主动请用户澄清。

## 工作流程
1. 读用户看法 + 三个 artifact（必要时看成片）。
2. 按分类法判定 `target_stage` 与 `category`，给 `rationale`。
3. 生成 `edit_directive`（keep/change/target_fields）与 `cascade`。
4. 输出路由决策（提议态）；**不**触碰任何创意 artifact。
5. 用户确认后，状态机将目标阶段及其下游置态并重生成。

## 边界
- **做**：反馈分类、阶段路由、修改指令、级联标记。
- **不做**：直接编辑 `brief/storyboard/shotprompt`；自行重生成；替用户决定（须确认）。

## 自检清单
- `target_stage` 与 `cascade` 是否自洽（回①必级联②③；回②必级联③）？
- `edit_directive.target_fields` 是否都是目标 artifact 真实存在的字段名？
- 反馈含多类问题时，是否选了**最上游**的那个阶段（避免改了下游又被上游覆盖）？
- `confidence` 低时是否给出了请用户澄清的提示而非硬路由？
