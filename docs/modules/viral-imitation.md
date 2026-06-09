# 爆款仿写 Prompt（Viral Imitation）

## 1. 业务目标

基于内置的「爆款模板库」，**自动**为商品匹配最合适的爆款内容模板，并直接生成符合该模板叙事结构的 6 镜分镜脚本。无需用户选模板、无需用户提供参考视频链接——模型根据商品类目和目标人群自主判断、自主套用。

这是 storyboard 生成的**替代路径**，适用于商家想要「对标行业爆款」的场景。产出的数据结构与标准 `StoryboardArtifact` 完全相同，后续 shot prompt → 图片生成 → 视频生成链路复用，无需改动。

> 通俗解释：标准 storyboard 是「从商品 brief 推导出原创分镜」；爆款仿写是「先看行业里什么视频最火，然后套这个结构来做我们商品的视频」。模板库嵌入在 prompt 里，不依赖外部检索（伪 RAG 方案）。

## 2. 在工作流中的位置

```
material intake → product brief → ★ viral imitation ★ → shot prompt → 逐 shot 生成
                                ↘（替代 storyboard）↗
```

- **上一步**：用户在前端审核并 approve 了 `ProductBriefArtifact`（与标准路径完全相同）。
- **本步**：模型读取 approved brief，从内置 7 类爆款模板中匹配最优者，生成 6 镜分镜脚本。输出结构与 `StoryboardArtifact` 相同，附加 `viralTemplateUsed` 和 `matchReason` 两个字段。
- **下一步**：用户审阅分镜；approve 后进入 shot prompt → 图片 → 视频生成，与标准路径完全一致。

## 3. 触发接口

`POST /api/workspaces/viral-imitation/propose`

## 4. 输入字段

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 当前工作区 ID | 字符串 (uuid) | 是 | 请求 |
| `approvedBrief` | 上一步产出的商品 brief | 对象 (`ProductBriefArtifact`) | 是 | workspace artifact |
| `materialIntake` | 素材清单（用于 productAssetRef 合法取值） | 对象 (`MaterialIntakeArtifact`) | 是 | workspace artifact |

> **设计原则**：模板完全由模型自动选择，用户不参与模板挑选。`approvedBrief.product.category` 和 `audience` 是模板匹配的主要依据。

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "approvedBrief": {
    "product": {
      "name": "兰蔻小黑瓶精华",
      "category": "护肤品",
      "keyFacts": ["主打抗老修护", "含 HA 玻尿酸复合物", "已售 500 万瓶"]
    },
    "audience": {
      "who": "25-35 岁都市女性，关注皮肤状态",
      "painOrDesire": "熬夜加班后担心皮肤老化变差"
    },
    "angleType": "problem_solution"
  }
}
```

## 5. 输出字段

模型输出除标准 `StoryboardArtifact` 字段外，额外包含两个爆款仿写专属字段。

### 爆款仿写专属字段

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `viralTemplateUsed` | 本次使用的模板名称（完整名称，如：美妆/护肤 · 痛点蜕变型） | 字符串 | 是 |
| `matchReason` | 一句话说明为什么这个商品匹配这个模板 | 字符串 | 是 |

### 继承的 StoryboardArtifact 字段

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `narrative` | 整条短视频的一句话叙事主轴（20-50 字） | 字符串 | 是 |
| `totalDurationSec` | 全片总时长，**固定 12 秒** | 整数 | 是 |
| `shots[]` | 分镜列表，**固定 6 个** | 对象数组 | 是 |
| `assumptions` | 模型推断列表 | 字符串数组 | 是 |

`shots[]` 子结构与 storyboard.md 完全相同（见 storyboard.md §5），此处不重复。

---

## 内置爆款模板库（7 大类）

模型必须从以下 7 个模板中选择**唯一最优匹配**，不允许混合多个模板的技巧。

---

### 模板 A · 美妆/护肤 · 痛点蜕变型

**适用品类**：护肤品、彩妆、美容仪器

**Hook 技巧**：年龄/皮肤焦虑——用观看者的「恐惧」开场，不出产品，只出场景

**叙事结构**：
> 痛点场景 → 使用过程 → 使用前后对比 → 成分/功效证明 → 真实用户数字 → 紧迫感 CTA

**情绪弧线**：
> 焦虑 → 好奇 → 惊喜 → 信任 → 行动冲动

**镜头策略提示**：
- shot 0（hook）：熬夜后的皮肤特写，或镜子前发现皱纹/暗沉的焦虑表情
- shot 1-2（benefit）：使用产品的手部特写或涂抹过程，质地/肤感细节
- shot 3（proof）：Before/After 对比，或成分瓶身标注特写
- shot 4（proof）：用户好评数/销量数字

---

### 模板 B · 3C/数码 · 场景痛点型

**适用品类**：耳机、手机配件、小家电、智能设备

**Hook 技巧**：不出产品，直接展示令人崩溃的「没有这个商品」的痛苦场景（嘈杂通勤、电量告急）

**叙事结构**：
> 痛苦场景 → 产品出现+问题解决瞬间 → 功能演示+数据 → 对比竞品 → 真实用户评价 → 价格锚定 CTA

**情绪弧线**：
> 共鸣痛点 → 解脱感 → 理性认可 → 价值确认 → 下单

**镜头策略提示**：
- shot 0（hook）：嘈杂地铁/耳机失联/电量 1% 的焦虑场景
- shot 1（benefit）：产品第一次解决问题的「解脱感」瞬间
- shot 2（benefit）：关键功能数据上屏展示（续航 X 小时/降噪分贝）
- shot 3-4（proof）：与旧产品/竞品的直观对比

---

### 模板 C · 食品/零食 · 食欲冲击型

**适用品类**：零食、饮品、预制食品、特产

**Hook 技巧**：最大食欲诱惑——无台词，只出最诱人的画面，画面即 hook

**叙事结构**：
> 食物英雄镜（最美画面） → 产地/原料来源 → 进食体验/口感描述 → 销量数据 → 稀缺信号 → CTA

**情绪弧线**：
> 食欲激发 → 好奇产地 → 品质信任 → 稀缺焦虑 → 下单

**镜头策略提示**：
- shot 0（hook）：极致食欲画面——切面/拉丝/蒸汽/色泽，无台词
- shot 1（benefit）：原料产地或自然环境镜头，建立「好食材」信任
- shot 2（benefit）：真实进食口感，嚼劲/汁水/层次感，UGC 质感
- shot 3-4（proof）：销量数字或限量/限时稀缺信号

---

### 模板 D · 服装/穿搭 · 生活升级型

**适用品类**：服装、鞋包、饰品

**Hook 技巧**：「你变了」式对比——穿搭前后的自我对比，身份感转变

**叙事结构**：
> 穿搭困境/无感 → 全套 look 亮相 → 面料/做工近景 → 多场景搭配展示 → 设计故事 → 尺码/颜色库存稀缺 CTA

**情绪弧线**：
> 认同痛点 → 向往效果 → 品质信任 → 认同价值 → 行动

**镜头策略提示**：
- shot 0（hook）：开箱打开包装，或翻看「没有合适衣服」的衣柜，焦虑感
- shot 1（benefit）：全套 look 亮相，转身/走动，质感感受
- shot 2（benefit）：面料特写，材质触感描述
- shot 3-4（proof）：多场景穿搭（通勤/约会/居家），展示百搭性

---

### 模板 E · 家居/生活 · 懒人刚需型

**适用品类**：收纳、清洁、厨房用品、家装

**Hook 技巧**：真实混乱/脏乱/不便的「共情现实」——让观看者看了直喊「这就是我家！」

**叙事结构**：
> 乱/脏/不便的真实场景 → 产品轻松解决问题 → 使用前后对比 → 省时/省力数据 → 家人反应 → 套装/捆绑优惠 CTA

**情绪弧线**：
> 共鸣麻烦 → 解脱轻松 → 效果惊喜 → 实用认可 → 下单

**镜头策略提示**：
- shot 0（hook）：杂乱抽屉/油腻锅台/凌乱床铺的真实特写，认同感强
- shot 1（benefit）：产品使用 1 步解决问题，对比「之前的麻烦操作」
- shot 2（benefit）：快速前后对比，时间节省的直觉感受
- shot 3-4（proof）：省时数据（「30 秒搞定」）或家庭成员的惊喜反应

---

### 模板 F · 运动/健康 · 自律激励型

**适用品类**：运动器材、保健品、健身装备

**Hook 技巧**：「你是不是也……」直接点名观看者的懒惰/不健康行为，让他们秒感被说中

**叙事结构**：
> 自我反思触发（懒/不健康被点名） → 低门槛使用产品展示 → 真实变化结果 → 科学/专家背书 → 社群案例 → 行动 CTA

**情绪弧线**：
> 自我审视 → 希望燃起 → 信任建立 → 决心激发 → 下单

**镜头策略提示**：
- shot 0（hook）：「你是不是也每天说要运动但……」躺平/刷手机的自嘲画面
- shot 1（benefit）：产品极低使用门槛，「5 分钟就够了」的轻松感
- shot 2（benefit）：30 天/3 个月的真实身形/指标变化数据
- shot 3-4（proof）：医生/营养师推荐，或用户社群打卡截图

---

### 模板 G · 母婴 · 安心守护型

**适用品类**：婴儿用品、儿童食品、母婴护肤

**Hook 技巧**：宝宝萌态或妈妈担忧——情感牌，观看者的保护欲立刻被激活

**叙事结构**：
> 宝宝需求/妈妈担忧出发 → 安全认证近景 → 宝宝真实使用画面 → 医生/实验室背书 → 妈妈社群口碑 → 为宝宝购买 CTA

**情绪弧线**：
> 共情担忧 → 安心感 → 信任建立 → 母爱认同 → 下单

**镜头策略提示**：
- shot 0（hook）：宝宝哭闹/红屁股/挑食的担忧场景，或妈妈夜间担心表情
- shot 1（benefit）：权威认证 logo 或原材料安全证明特写，建立第一层信任
- shot 2（benefit）：宝宝真实使用/吃/玩的可爱画面，情绪轻松
- shot 3-4（proof）：实验室检测画面 + 妈妈评论聚合（「宝宝一直要」）

---

## 模板自动匹配规则

模型必须按以下优先级匹配模板：

1. **主匹配**：`product.category` 命中哪个模板的「适用品类」
2. **辅助判断**：`audience.painOrDesire` 中的情绪关键词——焦虑/健康/安全/省钱等辅助确认模板方向
3. **angleType 参考**：brief 中已有 `angleType` 时，与模板情绪弧线对比，选情绪弧线最相符的

> 品类跨越两个模板时（如「美容仪器」既可用 A 也可用 B），优先选用与 `audience.painOrDesire` 情绪最匹配的，并在 `matchReason` 里说明理由。

---

### 固定 6 镜结构（与标准 storyboard 相同）

爆款仿写同样**固定输出 6 个镜头、总时长 12 秒**，但每个镜头的内容须严格遵循所选模板的叙事结构，不允许偏离。

| 镜头序号 | 作用 | 时长（秒） |
|----------|------|-----------|
| 0 | `hook` | 2 |
| 1 | `benefit` | 3 |
| 2 | `benefit` | 3 |
| 3 | `proof` | 2 |
| 4 | `proof` | 1 |
| 5 | `cta` | 1 |

---

### 输出示例

```json
{
  "viralTemplateUsed": "美妆/护肤 · 痛点蜕变型",
  "matchReason": "商品为护肤精华，核心受众痛点是「熬夜后皮肤老化担忧」，与痛点蜕变型的「用恐惧开场→产品解决→效果证明」叙事结构高度吻合",
  "narrative": "熬夜白领从「每天照镜子的皮肤焦虑」到「用兰蔻小黑瓶找回光感自信」",
  "totalDurationSec": 12,
  "shots": [
    {
      "index": 0,
      "purpose": "hook",
      "durationSec": 2,
      "scene": "浴室镜前，冷白晨光",
      "visualDirection": "近景，手指轻触眼角细纹，表情微蹙",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "熬夜后照镜子，你怕看到什么？",
      "transition": "快切"
    },
    {
      "index": 1,
      "purpose": "benefit",
      "durationSec": 3,
      "scene": "梳妆台，暖色灯光",
      "visualDirection": "特写，指尖取出精华液，涂抹于脸颊，镜头缓慢推进",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "兰蔻小黑瓶，一滴修护熬夜肌",
      "transition": "直切"
    },
    {
      "index": 2,
      "purpose": "benefit",
      "durationSec": 3,
      "scene": "浴室镜前，自然光",
      "visualDirection": "近景对比，左右分屏，7 天使用前后皮肤状态",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "7 天光感对比，肉眼可见",
      "transition": "直切"
    },
    {
      "index": 3,
      "purpose": "proof",
      "durationSec": 2,
      "scene": "产品包装特写，白背景",
      "visualDirection": "特写，HA 玻尿酸成分标注清晰可读",
      "productAssetRef": "materials/packaging-shot.jpg",
      "voiceover": "HA 玻尿酸复合物，皮肤科验证",
      "transition": "直切"
    },
    {
      "index": 4,
      "purpose": "proof",
      "durationSec": 1,
      "scene": "白背景，简洁",
      "visualDirection": "数字特写：500 万瓶，3 秒定格",
      "productAssetRef": "materials/packaging-shot.jpg",
      "voiceover": "已售 500 万瓶",
      "transition": "直切"
    },
    {
      "index": 5,
      "purpose": "cta",
      "durationSec": 1,
      "scene": "纯色背景",
      "visualDirection": "产品居中，限时价浮出",
      "productAssetRef": "materials/product-main.jpg",
      "voiceover": "点击链接，限时优惠",
      "transition": "淡入"
    }
  ],
  "assumptions": [
    "品类为护肤品，匹配模板 A（美妆/护肤·痛点蜕变型）",
    "无 before/after 素材，以文字对比镜头代替分屏实拍"
  ]
}
```

## 6. 下游消费者

- **前端分镜审阅页**：展示 `viralTemplateUsed` + `matchReason`，让用户理解为什么用这个模板，允许编辑后 approve。
- **Shot Prompt Agent**：approved 后进入与标准路径完全相同的 shot prompt 链路。
- **Feedback Route**：用户反馈「不喜欢这个模板风格」时，路由到这里，重新匹配或切换到标准 storyboard 路径。

## 7. 验收标准

- `viralTemplateUsed` 必须完整写出模板名称（如「美妆/护肤 · 痛点蜕变型」），不允许只写字母代号（「模板 A」）。
- `matchReason` 必须具体说明「商品+受众」与「模板叙事结构」的对应关系，不允许「该模板适合此类商品」这类空泛表述。
- 6 个镜头的叙事内容**必须遵循所选模板的叙事结构**——镜头 0 的 hook 方式、镜头 1-4 的顺序、情绪弧线走向都不允许偏离模板定义。
- 不允许混合多个模板的技巧（如把模板 A 的成分证明放到模板 C 的食欲冲击结构里）。
- `totalDurationSec` 固定为 12，shots 固定 6 个，其余验收标准与 storyboard.md §7 完全一致。
- 输出 JSON 中 `viralTemplateUsed`、`matchReason`、`narrative`、`totalDurationSec`、`shots[]`、`assumptions` 六个字段全部必填。

## 8. 常见失败模式

| 失败现象 | 修复方向 |
|---|---|
| 模板匹配不准（护肤品用了食品模板） | system prompt 给出明确的「品类→模板」对照表，并要求在 `matchReason` 里写明理由 |
| `matchReason` 写成泛化描述（「该模板适合此商品」） | system prompt 要求：必须提到「商品哪个特征」对应「模板的哪个结构元素」 |
| 叙事结构偏离模板（hook 出了产品本体） | system prompt 明确每个模板 hook 策略，并给反例 |
| 混用多个模板技巧 | system prompt 明确：一次只能用一个模板，6 个镜头全部遵循同一模板 |
| 模板名写「模板 A」而非完整名称 | system prompt 指定：`viralTemplateUsed` 写完整中文名称 |
| 输出镜头数不是 6 个 | system prompt 明确固定 6 镜结构，给镜头序号对照表 |
