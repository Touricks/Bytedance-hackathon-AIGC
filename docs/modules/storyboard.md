# Storyboard Prompt

## 1. 业务目标

把已经审核过的「商品 brief」转成一段可读的短视频分镜（storyboard）。**固定 6 个镜头、总时长 12 秒**，每个镜头有明确的作用（hook / benefit / proof / cta），并依据 brief 中的 `angleType` 自动选择 hook 策略。产出会在前端逐条审阅，然后才会进入 shot 工作流去真的生成图片和视频。

> 通俗解释：把「卖什么、卖给谁」变成「第 1 秒拍什么、第 2-4 秒拍什么……」的具体镜头计划。6 镜、12 秒是固定结构，不允许自由发挥镜头数量。

## 2. 在工作流中的位置

```
material intake → product brief → ★ storyboard ★ → shot prompt → 逐 shot 生成
```

- **上一步**：用户在前端审核并 approve 了 `ProductBriefArtifact`。
- **本步**：模型读取 approved brief + material intake 结果，吐出 6 镜分镜方案。
- **下一步**：用户审阅 storyboard；approve 后会被编译成 `ShotPromptArtifact`，每个 shot 进入图片/视频生成。

## 3. 触发接口

`POST /api/workspaces/storyboard/propose`

## 4. 输入字段

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 当前工作区 ID | 字符串 (uuid) | 是 | 请求 |
| `userDirection` | 用户对分镜的自由文本指示。例：「温馨家庭风」「节奏快一点」 | 字符串 | 否 | 请求 |
| `approvedBrief` | 上一步产出的商品 brief | 对象 (`ProductBriefArtifact`) | 是 | workspace artifact |
| `materialIntake` | 参考文件 | 对象 (`MaterialIntakeArtifact`) | 是 | workspace artifact |
| `templateStyle` | 内容风格模板。影响口播语气和场景取向 | 枚举: `种草` \| `开箱` \| `lifestyle` \| `卖点` | 否 | 请求 |
| `variantCount` | 一次生成几套分镜方案供用户选择（多方案模式） | 整数: `2` \| `3` | 否 | 请求 |

### `approvedBrief` 关键字段（storyboard 会用到的部分）

| 字段 | 含义 |
|---|---|
| `product.category` | 商品类目（影响 hook 风格） |
| `audience.painOrDesire` | 人群痛点（hook 内容依据） |
| `coreSellingPoint` | 核心卖点（benefit 镜头内容依据） |
| `proof` | 背书依据（proof 镜头内容依据） |
| `offer` | 促销信息（cta 镜头内容依据） |
| `brandTone` | 品牌语气（口播风格依据） |
| `angleType` | 内容角度（决定 hook 策略，见下方） |

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "userDirection": "节奏快一点，9:16 竖屏",
  "templateStyle": "种草",
  "approvedBrief": {
    "product": { "name": "三顿半冷萃咖啡 7 颗装", "category": "精品速溶咖啡" },
    "audience": { "who": "20-30 岁通勤白领", "painOrDesire": "想早上快速喝到不踩雷的咖啡" },
    "coreSellingPoint": "3 秒冷水即溶，比手冲还方便",
    "proof": ["原料来自埃塞俄比亚水洗豆", "已售 1000 万颗"],
    "offer": "首单 9.9 元尝鲜",
    "brandTone": "年轻、有质感、不浮夸",
    "angleType": "lifestyle_upgrade"
  }
}
```

## 5. 输出字段

模型输出会被持久化为 `StoryboardArtifact`。

### 固定 6 镜结构（不可更改）

| 镜头序号 | 作用 | 时长（秒） | 说明 |
|----------|------|-----------|------|
| 0 | `hook` | 2 | 前 2 秒抓住注意力，不出产品，只出痛点/欲望 |
| 1 | `benefit` | 3 | 第一个卖点——情感或功能 |
| 2 | `benefit` | 3 | 第二个卖点——加深购买欲望 |
| 3 | `proof` | 2 | 背书——数据、认证、真实用户反馈 |
| 4 | `proof` | 1 | 强化信任——快速视觉佐证 |
| 5 | `cta` | 1 | 行动召唤——促进下单 |

`totalDurationSec` 必须等于 **12**。

### 输出字段表

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `narrative` | 整条短视频的一句话叙事主轴（20-50 字） | 字符串 | 是 |
| `totalDurationSec` | 全片预计总时长（秒），**固定为 12** | 整数 | 是 |
| `shots[]` | 分镜列表，**固定 6 个** | 对象数组 | 是 |
| `assumptions` | 模型做的推断列表 | 字符串数组 | 是 |

### `shots[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `index` | 镜头序号，从 0 开始，连续递增 | 整数 | 是 |
| `purpose` | 镜头作用 | 枚举: `hook` \| `benefit` \| `proof` \| `cta` | 是 |
| `durationSec` | 本镜头时长（秒） | 整数 | 是 |
| `scene` | 场景描述（≤ 20 字，格式：`[地点] + [光线]`，例：浴室镜前，清晨自然光） | 字符串 | 是 |
| `visualDirection` | 画面方向（构图类型 + 镜头运动，例：特写，缓慢推进） | 字符串 | 是 |
| `productAssetRef` | 本镜头主推的商品素材 ref。必须来自 `materialIntake.assets[].ref` | 引用 | 是 |
| `voiceover` | 口播台词（≤ 15 字，口语化，不用广告腔；不需要口播填空字符串） | 字符串 | 是 |
| `transition` | 转场方式 | 枚举: `直切` \| `淡入` \| `快切` \| `叠化` | 是 |

### `transition` 选取规则

| 场景 | 推荐取值 |
|---|---|
| hook 镜头结尾 | `快切`（强调节奏感） |
| benefit / proof 镜头结尾 | `直切`（保持自然真实感） |
| cta 镜头结尾 | `淡入`（给人思考空间） |

### `templateStyle` 对分镜的影响

| 取值 | 影响 |
|---|---|
| `种草` | 温暖亲切，第一人称分享口吻，场景取日常生活瞬间 |
| `开箱` | 好奇驱动，含开箱仪式感，特写包装细节和质感 |
| `lifestyle` | 向往感环境，产品融入精致生活场景 |
| `卖点` | 直接功能导向，按功能逐一展示，数据前置 |

`templateStyle` 优先级高于 `angleType` 的默认风格。

### `angleType` 对 hook 镜头的影响

| `angleType` | hook 镜头策略 |
|---|---|
| `problem_solution` | 直接出现痛苦场景，不出产品，只呈现挫败感 |
| `before_after` | 对比帧——分屏或快切"之前"状态 |
| `lifestyle_upgrade` | 向往型场景——目标用户渴望的生活画面 |
| `trust_proof` | 权威信号——数字、认证机构、专家面孔 |
| `budget_value` | 价格锚定——先展示问题 + 替代方案的高价格 |

### 输出示例

```json
{
  "narrative": "忙碌通勤白领从「排队焦虑」到「3 秒自由」，用三顿半开启有质感的早晨",
  "totalDurationSec": 12,
  "shots": [
    {
      "index": 0,
      "purpose": "hook",
      "durationSec": 2,
      "scene": "早高峰咖啡店，长队",
      "visualDirection": "中景，快速推进，焦躁情绪",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "每天排队买咖啡，烦不烦？",
      "transition": "快切"
    },
    {
      "index": 1,
      "purpose": "benefit",
      "durationSec": 3,
      "scene": "家中台面，清晨柔光",
      "visualDirection": "俯拍特写，胶囊落入冷水瞬间溶解",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "三顿半，3 秒冷水即溶",
      "transition": "直切"
    },
    {
      "index": 2,
      "purpose": "benefit",
      "durationSec": 3,
      "scene": "通勤地铁，自然光",
      "visualDirection": "中景，捧着咖啡杯，轻松微笑",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "比速溶精品，比手冲方便",
      "transition": "直切"
    },
    {
      "index": 3,
      "purpose": "proof",
      "durationSec": 2,
      "scene": "桌面，暖色调打光",
      "visualDirection": "特写，包装侧面埃塞俄比亚标识",
      "productAssetRef": "materials/packaging-shot.jpg",
      "voiceover": "埃塞俄比亚水洗豆，已售千万颗",
      "transition": "直切"
    },
    {
      "index": 4,
      "purpose": "proof",
      "durationSec": 1,
      "scene": "桌面特写",
      "visualDirection": "极近景，0 蔗糖标注清晰",
      "productAssetRef": "materials/packaging-shot.jpg",
      "voiceover": "0 蔗糖，真喝得放心",
      "transition": "直切"
    },
    {
      "index": 5,
      "purpose": "cta",
      "durationSec": 1,
      "scene": "纯色背景",
      "visualDirection": "产品居中，价格标签浮出",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "首单 9.9，点击尝鲜",
      "transition": "淡入"
    }
  ],
  "assumptions": [
    "依据 angleType=lifestyle_upgrade 选择向往型 hook",
    "templateStyle=种草，口播采用第一人称分享口吻"
  ]
}
```

## 6. 下游消费者

- **前端分镜审阅页**：用户逐镜头审阅，可编辑后 approve。
- **Shot Prompt Agent**：approved storyboard 是其主要输入；`transition` 字段供 shot prompt 做转场指引。
- **爆款仿写 Agent（viral-imitation）**：输出同样符合本 schema，可直接复用下游链路。
- **Feedback Route**：用户对分镜节奏、卖点顺序反馈时路由到这里，注入 `revisionInstruction`。

## 7. 验收标准

- `shots` 数组**必须恰好 6 个**，不多不少。
- `totalDurationSec` **必须等于 12**（shots[].durationSec 之和）。
- 镜头作用顺序必须是 hook → benefit → benefit → proof → proof → cta（即 purpose 序列固定）。
- `voiceover` ≤ 15 字，口语化，不允许出现广告腔（「心动」「绝了」「真的太好用了」除外）。
- `scene` ≤ 20 字，格式为「[地点] + [光线]」。
- `productAssetRef` 必须命中 `materialIntake.assets[].ref`。
- 不允许引入 `productBrief.keyFacts` 或 `proof` 中没有的商品事实。
- `transition` 必须是允许枚举值之一，并遵循转场规则（cta 结尾用淡入，hook 快切）。
- 输出 JSON 必须能被 `storyboardArtifactSchema.parse()` 解析。

## 8. 常见失败模式

| 失败现象 | 修复方向 |
|---|---|
| 镜头数量不是 6 个（模型自由发挥） | system prompt 明确：shots 数组长度必须等于 6，给出 index 0-5 的作用对照表 |
| hook 镜头一开始就出产品 | system prompt 强调：hook 只出痛点/欲望/对比，不出产品本体 |
| `voiceover` 超过 15 字或出现广告腔 | system prompt 给反例：「真的超级无敌好用！」→ 应改为「3 秒冷水即溶」 |
| `totalDurationSec` 与 shots 时长之和不等 | system prompt 要求模型在输出前自行校验：sum(shots[].durationSec) == totalDurationSec |
| 编造未在 brief 中出现的卖点 | system prompt 约束：voiceover / scene 中的事实主张必须来自 brief.keyFacts 或 brief.proof |
| `transition` 不符合规则（cta 用快切） | system prompt 给出 transition 规则速查表 |
