# Product Brief Prompt

## 1. 业务目标

基于素材理解结果 + 用户的人工补充信息，生成一份「商品 brief」：包含商品事实、目标人群、核心卖点、品牌语气、合规约束等。这份 brief 是后续 storyboard / shotprompt 模型的主要输入。

> 通俗解释：素材识别（material intake）只是「我们有哪些料」；product brief 是「这条广告要讲什么、卖给谁、用什么口吻讲」。

## 2. 在工作流中的位置

```
material intake → ★ product brief ★ → storyboard → shot prompt → 逐 shot 生成
```

- **上一步**：用户上传素材，`materialIntake` 已经产出，主商品和可用素材已确认。
- **本步**：模型读取 material intake + 用户的 `userDirection`，吐出 brief 草稿。用户在前端审阅、编辑、approve。
- **下一步**：approved brief → storyboard agent 生成分镜。

## 3. 触发接口

`POST /api/workspaces/:workspaceId/product-brief/propose`

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
      },
      {
        "ref": "materials/packaging-shot.jpg",
        "role": "product_detail",
        "description": "盒装外包装侧面，标注『埃塞俄比亚 · 水洗 · 0 蔗糖』"
      },
      {
        "ref": "materials/spec.txt",
        "role": "spec_text",
        "description": "产品规格文档：7 颗 × 3g、价格 49 元、生产日期 2026-03"
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
| `coreSellingPoint` | 这条短视频要传达的最重要的一个卖点 | 字符串 | 是 |
| `proof` | 支撑卖点的证据例：「已售 1000 万颗」 | 字符串 | 是 |
| `offer` | 促销 / 优惠信息。无则填 `null` | 字符串 \| null | 是 |
| `brandTone` | 品牌语气。例：「年轻、有质感、不浮夸」 | 字符串 | 是 |

### `product` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `name` | 商品名 | 字符串 | 是 |
| `category` | 商品类目。例：「速溶咖啡」 | 字符串 | 是 |
| `description` | 商品事实：例如成分、产地、规格、价格、认证 | 字符串 | 是 |
| `assets[]` | 商品在视频中要用的素材引用 | 对象数组 | 是 |

### `product.assets[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `ref` | 素材 ref。必须来自 `materialIntake.assets[].ref` | 字符串 | 是 |
| `useAs` | 用途 | 枚举: `primary` \| `support` | 是 |

### `audience` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `who` | 目标人群描述（一句话） | 字符串 | 是 |
| `painOrDesire` | 目标人群的痛点或渴望 | 字符串 | 是 |

### 输出示例

```json
{
  "product": {
    "name": "三顿半冷萃咖啡 7 颗装",
    "category": "精品速溶咖啡",
    "description": "7 颗 × 3g 独立胶囊；原料埃塞俄比亚水洗豆；3 秒冷水即溶；0 蔗糖；建议零售价 49 元。",
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
  "proof": "原料来自埃塞俄比亚水洗豆，0 蔗糖配方，已售 1000 万颗（公开宣传数据）",
  "offer": "首单 9.9 元尝鲜价",
  "brandTone": "年轻、有质感、自信但不浮夸，少用感叹号"
}
```

## 6. 下游消费者

- **前端 brief 审阅页**：用户逐字段审阅，可编辑后 approve。
- **Storyboard Agent**：approved brief 是其主要输入（决定卖点叙事、镜头取向）。
- **Image Prompt Agent / Video Script Agent**：会读 `brandTone` 做风格约束。
- **Feedback Route**：用户反馈涉及商品事实 / 卖点时，路由到 brief 并把 `revisionInstruction` 注入这里。

## 7. 验收标准

- 商品事实（`product.description`、`proof`）**不允许编造**——只能来自 material intake 中识别到的素材内容、或 `userDirection`。
- `product.assets[].ref` 必须命中 `materialIntake.assets[].ref`。
- 至少一条 `product.assets[]` 的 `useAs=primary`；且 ref 必须等于 `materialIntake.primaryProductRef`。
- `coreSellingPoint` 必须是**一句话**（≤ 30 字），不能列举多个卖点。多个卖点应拆到 `proof`。
- `audience.who` 和 `audience.painOrDesire` 都不能为空字符串。
- 不允许输出与 `userDirection` 中显式提及的事实冲突的内容（如 userDirection 写了商品名为「A」，模型不能输出 `name="B"`）。
- 合规约束（如「最」「第一」「国家级」等绝对化用语）由本 agent 的 system prompt 内置默认词表保证，无需通过 brief 字段携带。
- 输出 JSON 必须能被 `productBriefArtifactSchema.parse()` 解析。

## 8. 常见失败模式

| 失败现象 | 修复方向 |
|---|---|
| 模型编造商品事实（如自己加上「有机认证」） | system prompt 强约束：「`product.description` / `proof` 中每条事实必须能在 material intake 的某个 asset description 中找到来源」 |
| `coreSellingPoint` 写成一段话或多个卖点 | system prompt 限制 ≤ 30 字；并给反例 |
| 多个 asset 都标 `useAs=primary` | system prompt 规定 primary 只能有 1 个 |
| 引用了不存在的 ref | system prompt 注入完整 ref enum 列表，强制取值 |
| 输出含合规高风险词汇 | system prompt 内置默认词表（「最」字头、「第一」等绝对化用语），命中即重写 |
| `userDirection` 明确写了商品名，模型却改了 `product.name` | system prompt 明确：`userDirection` 中显式提到的事实 > 素材推断 > 模型默认；命名 / 数值等以 userDirection 原文为准 |
| `audience` 写成「所有人」「年轻人」这种过于宽泛 | system prompt 要求 audience.who 必须包含至少 2 个描述维度（年龄 + 场景 / 城市 / 兴趣） |
| `userDirection` 为空时模型瞎猜人群 | system prompt 强制：userDirection 缺失时使用「目标商品的典型消费者」类中性默认 |
