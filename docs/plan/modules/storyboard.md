# Storyboard Prompt

## 1. 业务目标

把已经审核过的「商品 brief」转成一段可读的短视频分镜（storyboard）。产出会在前端逐条审阅，然后才会进入 shot 工作流去真的生成图片和视频。


## 2. 在工作流中的位置

```
material intake → product brief → ★ storyboard ★ → shot prompt → 逐 shot 生成
```

- **上一步**：用户在前端审核并 approve 了 `ProductBriefArtifact`。
- **本步**：模型读取 approved brief + material intake 结果，吐出一段分镜方案。
- **下一步**：用户审阅 storyboard；approve 后会被编译成 `ShotPromptArtifact`，每个 shot 进入图片/视频生成。

## 3. 触发接口

`POST /api/workspaces/:workspaceId/storyboard/propose`

## 4. 输入字段

> **设计原则**：除 `workspaceId` 和 `userDirection` 外，本模块只依赖上游 artifact（`approvedBrief` + `materialIntake`）。用户不需要填镜头数、时长、镜头作用等任何结构化字段——全部由模型从 brief + 素材推断。

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 当前工作区 ID | 字符串 (uuid) | 是 | 请求 |
| `userDirection` | 用户对分镜的自由文本指示。例：「温馨家庭风」「节奏快一点」「3-4 个镜头就够了」 | 字符串 | 否 | 请求 |
| `approvedBrief` | 上一步产出的商品 brief。模型主要的输入。 | 对象 (`ProductBriefArtifact`) | 是 | workspace artifact |
| `materialIntake` | 参考文件 | 对象 (`MaterialIntakeArtifact`) | 是 | workspace artifact |

### `approvedBrief` 关键字段

| 字段 | 含义 |
|---|---|
| `product.name` | 商品名 |
| `product.category` | 商品类目 |
| `product.description` | 商品事实拼接的整段描述（成分、产地、价格等） |
| `audience.who` | 目标人群 |
| `audience.painOrDesire` | 人群痛点或欲望 |
| `coreSellingPoint` | 一句话核心卖点 |
| `proof` | 支撑卖点的证据（一段字符串） |
| `offer` | 促销信息，可能为 null |
| `brandTone` | 品牌语气 |

### `materialIntake` 关键字段

| 字段 | 含义 |
|---|---|
| `primaryProductRef` | 主商品图的 ref（必出现在至少一个 shot 里） |
| `assets[].ref` | 可用素材的 ref |
| `assets[].kind` | 文件大类（image / video / text） |
| `assets[].role` | 素材角色（product_main / product_detail / logo / spec_text / other） |

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "userDirection": "希望节奏快一点，9:16 竖屏",
  "approvedBrief": {
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
      "who": "20-30 岁通勤白领",
      "painOrDesire": "想早上快速喝到不踩雷的咖啡"
    },
    "coreSellingPoint": "3 秒冷水即溶，比手冲还方便",
    "proof": "原料来自埃塞俄比亚水洗豆，已售 1000 万颗",
    "offer": "首单 9.9 元尝鲜",
    "brandTone": "年轻、有质感、不浮夸"
  },
  "materialIntake": {
    "scannedAt": "2026-05-29T08:00:00Z",
    "primaryProductRef": "materials/product-main.jpg",
    "assets": [
      {
        "ref": "materials/product-main.jpg",
        "kind": "image",
        "mime": "image/jpeg",
        "role": "product_main",
        "description": "白底产品正面照，7 颗咖啡胶囊整齐排列"
      },
      {
        "ref": "materials/packaging-shot.jpg",
        "kind": "image",
        "mime": "image/jpeg",
        "role": "product_detail",
        "description": "盒装外包装侧面"
      }
    ],
    "rejected": []
  }
}
```

## 5. 输出字段

模型输出会被持久化为 `StoryboardArtifact`。

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `narrative` | 整条短视频的一句话叙事主轴 | 字符串 | 是 |
| `totalDurationSec` | 全片预计总时长（秒）。等于所有 shots 时长之和 | 整数 | 是 |
| `shots[]` | 分镜列表，至少 1 个 | 对象数组 | 是 |
| `assumptions` | 模型做的推断 | 字符串 | 是 |

### `shots[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `index` | 镜头序号。从 0 开始，连续递增 | 整数 | 是 |
| `purpose` | 镜头作用 | 枚举: `hook` \| `benefit` \| `proof` \| `cta` | 是 |
| `durationSec` | 本镜头时长（秒） | 整数 | 是 |
| `scene` | 场景描述（在哪、什么环境） | 字符串 | 是 |
| `visualDirection` | 画面方向（构图、镜头运动、主体动作） | 字符串 | 是 |
| `productAssetRef` | 本镜头主推的商品素材 ref。必须来自 `materialIntake.assets[].ref` | 引用 | 是 |
| `voiceover` | 口播台词（不需要口播时写空字符串） | 字符串 | 是 |

> 关于 `purpose` 的取值约定：
> - `hook`：开头抓眼球
> - `benefit`：讲卖点 / 使用场景
> - `proof`：背书、对比、效果证明
> - `cta`：行动召唤（下单、点链接等）
> 一般建议 hook 1 个、benefit 1-2 个、proof 0-1 个、cta 1 个。

### 输出示例

```json
{
  "narrative": "白领早晨忙碌中，用三顿半 3 秒冲出一杯精品咖啡，开启高效一天",
  "totalDurationSec": 18,
  "shots": [
    {
      "index": 0,
      "purpose": "hook",
      "durationSec": 3,
      "scene": "清晨厨房，台面散落着杯子和文件",
      "visualDirection": "近景，手快速拿起一颗咖啡胶囊，背景虚化",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "通勤前的 3 秒，能做什么？"
    },
    {
      "index": 1,
      "purpose": "benefit",
      "durationSec": 5,
      "scene": "玻璃杯中冷水",
      "visualDirection": "俯拍特写，胶囊落入冷水瞬间溶解",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "三顿半冷萃，3 秒冷水即溶"
    },
    {
      "index": 2,
      "purpose": "proof",
      "durationSec": 6,
      "scene": "桌面摆放包装盒和咖啡杯",
      "visualDirection": "中景，包装盒侧面对镜头，光打在埃塞俄比亚标识上",
      "productAssetRef": "materials/packaging-shot.jpg",
      "voiceover": "埃塞俄比亚水洗豆，已售 1000 万颗"
    },
    {
      "index": 3,
      "purpose": "cta",
      "durationSec": 4,
      "scene": "纯色背景 + 商品",
      "visualDirection": "正面产品图居中，下方浮出价格标签",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "首单 9.9 元，点击下方链接尝鲜"
    }
  ],
  "assumptions": [
    "假设投放 9:16 抖音信息流，节奏偏快",
    "假设用户对冷萃咖啡概念有基础认知"
  ]
}
```
