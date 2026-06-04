# Product Brief Prompt

## 1. 业务目标

基于素材理解结果 + 用户的人工补充信息，生成一份「商品 brief」：包含商品事实、目标人群、核心卖点、内容角度策略、情绪触点、转化风格、品牌语气、合规约束等。这份 brief 是后续 storyboard / shotprompt 模型的主要输入。

> 通俗解释：素材识别（material intake）只是「我们有哪些料」；product brief 是「这条广告要讲什么、卖给谁、用什么口吻讲、用哪个角度切入最容易转化」。

## 2. 在工作流中的位置

```
material intake → ★ product brief ★ → storyboard → shot prompt → 逐 shot 生成
```

- **上一步**：用户上传素材，`materialIntake` 已经产出，主商品和可用素材已确认。
- **本步**：模型读取 material intake + 用户的 `userDirection`，吐出 brief 草稿。用户在前端审阅、编辑、approve。
- **下一步**：approved brief → storyboard agent 生成分镜。

## 3. 触发接口

`POST /api/workspaces/brief/propose`

## 4. 输入字段

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 工作区 ID | 字符串 (uuid) | 是 | 请求 |
| `userDirection` | 用户对 brief 的自由文本指示。可写商品名、卖点、人群、风格、平台等任意信息；模型会从中抽取结构化字段 | 字符串 | 否 | 请求 |
| `materialIntake` | 上一步产出的素材清单 | 对象 (`MaterialIntakeArtifact`) | 是 | workspace artifact |

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "userDirection": "三顿半冷萃咖啡 7 颗装，主打 3 秒冷水即溶和埃塞俄比亚水洗豆。投放抖音，目标人群是 20-30 岁通勤白领。风格要年轻、有质感、不浮夸，避免和普通速溶咖啡画等号。",
  "materialIntake": {
    "scannedAt": "2026-05-29T08:00:00Z",
    "primaryProductRef": "materials/product-main.jpg",
    "assets": [
      {
        "ref": "materials/product-main.jpg",
        "role": "product_main",
        "description": "白底产品正面照，7 颗咖啡胶囊整齐排列"
      }
    ],
    "rejected": []
  }
}
```

## 5. 输出字段

模型输出会被持久化为 `ProductBriefArtifact`（见 `packages/shared/src/schemas/artifacts.ts`）。

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `product` | 商品基本信息 | 对象 | 是 |
| `audience` | 目标人群 | 对象 | 是 |
| `coreSellingPoint` | 这条短视频要传达的最重要的一个卖点（一句话，≤30 字） | 字符串 | 是 |
| `proof` | 支撑卖点的证据列表，每条一句话 | 字符串数组 | 是 |
| `offer` | 促销 / 优惠信息。无则填 `null` | 字符串 \| null | 是 |
| `platform` | 目标投放平台（抖音 / TikTok / 小红书 等） | 字符串 | 是 |
| `brandTone` | 品牌语气。例：「年轻、有质感、不浮夸」 | 字符串 | 是 |
| `bannedExpressions` | 下游所有 prompt 都不允许出现的词/短语（合规风险词、品牌禁用词） | 字符串数组 | 是 |
| `landingInfo` | 落地页链接或 CTA 目标。无则填 `null` | 字符串 \| null | 是 |
| `assumptions` | 模型因信息不足做的所有推断，逐条列出 | 字符串数组 | 是 |
| `angleType` | 内容切入角度（见下方角度选择指南） | 枚举 | 否 |
| `emotionalTrigger` | 目标人群会产生的核心情绪，一句话（具体到情绪类型，不允许写「有共鸣」这种泛化描述） | 字符串 | 否 |
| `conversionStyle` | CTA 风格（见下方枚举） | 枚举 | 否 |

### `product` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `name` | 商品名 | 字符串 | 是 |
| `category` | 商品类目。例：「精品速溶咖啡」 | 字符串 | 是 |
| `keyFacts` | 3-5 条商品事实（成分、产地、规格、价格、认证等），每条一句话 | 字符串数组 | 是 |
| `assets[]` | 商品在视频中要用的素材引用列表 | 对象数组 | 是 |

### `product.assets[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `ref` | 素材 ref。必须来自 `materialIntake.assets[].ref` | 字符串 | 是 |
| `useAs` | 用途 | 枚举: `primary` \| `support` | 是 |

### `audience` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `who` | 目标人群描述（一句话，含至少 2 个维度：年龄 + 场景/城市/兴趣） | 字符串 | 是 |
| `painOrDesire` | 目标人群的核心痛点或渴望 | 字符串 | 是 |

### `angleType` 枚举取值说明

| 取值 | 适用场景 |
|---|---|
| `problem_solution` | 商品解决明显痛点（护肤过敏、睡眠差、腰痛等） |
| `before_after` | 转变效果可视且戏剧化（减重、皮肤变好、家居改造） |
| `lifestyle_upgrade` | 商品提升日常生活品质（精品咖啡、人体工学椅） |
| `trust_proof` | 信任是购买障碍（保健品、母婴、医疗器械） |
| `budget_value` | 价格敏感型买家，性价比是核心卖点（日用品、基础款） |

### `conversionStyle` 枚举取值说明

| 取值 | 含义 |
|---|---|
| `soft_cta` | 软性引导，不直接催促购买（种草类内容） |
| `direct_cta` | 直接催单（点击链接、限时优惠） |
| `personal_recommendation` | 个人推荐口吻（「我用了 XX，真的很好用」） |
| `problem_triggered_cta` | 痛点触发式（「有这个问题的一定要看」） |

### 输出示例

```json
{
  "product": {
    "name": "三顿半冷萃咖啡 7 颗装",
    "category": "精品速溶咖啡",
    "keyFacts": [
      "7 颗 × 3g 独立胶囊",
      "原料：埃塞俄比亚水洗豆",
      "3 秒冷水即溶，无需热水",
      "0 蔗糖配方",
      "建议零售价 49 元"
    ],
    "assets": [
      { "ref": "materials/product-main.jpg", "useAs": "primary" },
      { "ref": "materials/packaging-shot.jpg", "useAs": "support" }
    ]
  },
  "audience": {
    "who": "20-30 岁一二线城市通勤白领，关注生活品质",
    "painOrDesire": "想在忙碌通勤中快速喝到不踩雷的精品咖啡，而不是普通速溶味"
  },
  "coreSellingPoint": "3 秒冷水即溶，比手冲更方便、比速溶更精品",
  "proof": [
    "原料来自埃塞俄比亚水洗豆",
    "0 蔗糖配方",
    "已售 1000 万颗（公开宣传数据）"
  ],
  "offer": "首单 9.9 元尝鲜价",
  "platform": "抖音",
  "brandTone": "年轻、有质感、自信但不浮夸，少用感叹号",
  "bannedExpressions": ["最好喝", "第一", "国家级", "普通速溶"],
  "landingInfo": null,
  "assumptions": [
    "userDirection 未提及认证信息，proof 仅引用素材中已有数据",
    "平台默认抖音信息流，9:16 竖屏"
  ],
  "angleType": "lifestyle_upgrade",
  "emotionalTrigger": "通勤白领对「早上要花时间排队买咖啡」感到时间浪费和无奈",
  "conversionStyle": "soft_cta"
}
```

## 6. 下游消费者

- **前端 brief 审阅页**：用户逐字段审阅，可编辑后 approve。
- **Storyboard Agent**：approved brief 是其主要输入（决定卖点叙事、镜头取向）；`angleType` 直接决定 hook 策略。
- **爆款仿写 Agent（viral-imitation）**：用 `product.category` + `audience` 自动匹配爆款模板。
- **Image Prompt Agent / Video Script Agent**：会读 `brandTone` 和 `bannedExpressions` 做风格和合规约束。
- **Feedback Route**：用户反馈涉及商品事实 / 卖点时，路由到 brief 并把 `revisionInstruction` 注入这里。

## 7. 验收标准

- `product.keyFacts` 中每条事实**不允许编造**——只能来自 material intake 素材内容或 `userDirection`。
- `product.assets[].ref` 必须命中 `materialIntake.assets[].ref`。
- 至少一条 `product.assets[]` 的 `useAs=primary`，且 ref 必须等于 `materialIntake.primaryProductRef`。
- `coreSellingPoint` 必须是**一句话**（≤ 30 字），不得列举多个卖点。
- `audience.who` 必须包含至少 2 个描述维度（年龄 + 场景/城市/兴趣），不允许「所有人」「年轻人」这类泛化。
- `angleType` 必须显式选择，不允许默认 `problem_solution` 而不加理由；需要在 `assumptions` 里说明选择依据。
- `emotionalTrigger` 必须具体到情绪类型（「焦虑感」「向往感」），不允许写「有共鸣」「感兴趣」。
- `bannedExpressions` 必须包含该品类的法律高风险词（「最」字头、「第一」、「根治」等绝对化用语）。
- 不允许输出与 `userDirection` 中显式提及的事实冲突的内容。
- 输出 JSON 必须能被 `productBriefArtifactSchema.parse()` 解析。

## 8. 常见失败模式

| 失败现象 | 修复方向 |
|---|---|
| 模型编造商品事实（自己加上「有机认证」） | system prompt 强约束：`keyFacts` 每条必须能在 material intake 的某个 asset description 中找到来源 |
| `coreSellingPoint` 写成一段话或多个卖点 | system prompt 限制 ≤ 30 字；并给反例 |
| `angleType` 每次都输出 `problem_solution`，不加判断 | system prompt 提供 5 种角度的适用场景对照表，要求模型在 `assumptions` 里说明理由 |
| `emotionalTrigger` 写成「用户会感兴趣」 | system prompt 要求必须命名具体情绪，并给正例：「通勤白领因早高峰排队买咖啡感到时间浪费和无奈」 |
| `audience` 过于宽泛（「年轻人」） | system prompt 要求 `audience.who` 含至少 2 个维度 |
| `bannedExpressions` 为空数组 | system prompt 内置默认合规词表（「最」字头等），要求模型至少填入品类相关的合规词 |
| 多个 asset 都标 `useAs=primary` | system prompt 规定 primary 只能有 1 个 |
