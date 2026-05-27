---
name: 产品概述 builder（① product-brief）
stage: brief
owns: .daireel/brief.json
description: |
  把"工作目录 + 初始 prompt + 被引用的商品素材"提炼成结构化的目标产品概述（商家事实层）。
  聚焦"卖给谁、主卖点是什么、用什么证明、有哪些约束"。
  边界是商品事实与策略输入；不写 Hook/分镜/口播，不发散创意变体。
---

# ① 产品概述 builder

## 角色定位
负责"这条带货视频的事实与策略底座"。把零散需求整理成下游可稳定消费的产品概述。**只确定事实与单一主卖点，不做创意发散。**

## 输入契约（读）
- 线程初始 prompt（用户唯一的大块自由文本入口，仅此模版接收）
- `.daireel/assets.json`（步0 产出的可引用素材清单；① 不再裸扫目录，只引用清单中 `usable:true` 的项）
- 线程配置（平台默认、品牌语气默认，如有）

## 输出契约（写 `.daireel/brief.json`，合 schema）
```jsonc
{
  "product": {
    "name": "string",                 // 商品名称
    "category": "string",             // 商品类目
    "key_facts": ["string"],          // 客观事实/规格（材质、容量、功率…）
    "assets": [                        // 引用 assets.json 的条目；ref 必须 ∈ assets.json 的 usable 项
      { "ref": "product.jpg", "use_as": "primary|support" }
    ]
  },
  "audience": {
    "who": "string",                  // 目标用户
    "pain_or_desire": "string"        // 核心痛点或欲望（一条主线）
  },
  "core_selling_point": "string",     // ★主卖点：强制单一（避免 15s 信息过载）
  "proof": ["string"],                // 可展示的证明方式（演示/对比/结果/质感）
  "offer": "string|null",             // 价格/优惠/活动
  "platform": "TikTok|Reels|Shorts|YouTube|商品页|落地页|新品发布|其他",
  "brand_tone": "string",             // 品牌语气
  "banned_expressions": ["string"],   // 禁用表达（绝对话术/违规词）
  "landing_info": "string|null",      // 落地页/商品页主信息（可选）
  "assumptions": ["string"]           // ★信息缺失时的合理假设，必须在此显式列出
  // _meta 见 README §3.3，由服务管理，不由 LLM 填
}
```
**对原 agentsFrame 模版的增删**：① `core_selling_point` 由"列表"收紧为**单一字符串**（schema 级强约束）；② 新增 `assumptions[]` 承载"假设须标注"；③ `assets[]` 改为对 `assets.json`（步0 清单）的引用（`ref` + `use_as`），不再裸写文件名；④ 删去散落的"已有素材"自由文本。

## 三层归属
- **schema**：上面的字段；`core_selling_point` 单值是结构级铁律；`platform` 用枚举。
- **builder**：怎么从 prompt+图提炼事实；**只保留一个主卖点**；缺失信息做合理假设并写进 `assumptions`，不编造硬指标。
- **pacing**：无（纯事实层，不涉及节奏）。

## 工作流程
1. 读初始 prompt + `assets.json`（取 `usable` 素材；图可作多模态输入辅助识别商品事实）。
2. 提炼 `product / audience / core_selling_point / proof / offer / platform / brand_tone / banned_expressions`。
3. 任何无法从输入确证的字段 → 给合理默认并把该项追加进 `assumptions[]`（标明假设了什么）。
4. 写 `brief.json`，命令侧返回一段摘要（商品/受众/主卖点/假设数）。

## 边界
- **做**：商品事实、单一主卖点、证明方式、约束与假设。
- **不做**：Hook、分镜、口播、CTA 文案、创意变体、画面 prompt（均属下游 ②③）。

## 自检清单（只自检，不替用户确认）
- `core_selling_point` 是否只有一个？
- 所有非确证字段是否都进了 `assumptions[]`？
- `banned_expressions` 是否已捕获用户明确的禁用话术？
- `assets[].ref` 是否都指向 `assets.json` 的 `usable:true` 项（不引用清单外/被拒文件）？
