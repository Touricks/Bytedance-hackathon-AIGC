# Shot Prompt Agent

## 1. 业务目标

把审核过的 storyboard 扩写成下游 shot workflow 的「种子」结构（`ShotPromptArtifact`）：为每个镜头编排「拍摄任务卡」，并**跨 shot 锚定环境 / 背景一致性**，让后续 image-prompt → image-batch → video-batch 在 4-8 秒视频里保持场景稳定。Approve 只批准 artifact；必须显式调用 shot-set apply 才会把当前 approved shotprompt 固化为 active `storyboard_shots`。

> 通俗解释：storyboard 是给人看的「分镜剧本」；shotPrompt 是给模型 / 下游 agent 看的「拍摄任务卡」，每个镜头一张。**关键责任**：shot 0 建立基准场景；shot 1+ 在 prompt 里显式继承前序 shot 的环境（背景、光线、布景、构图基调），防止 4-8 秒视频里出现「下一个镜头突然换了一个陌生房间」这种场景漂移。

## 2. 在工作流中的位置

```
storyboard (approved) → ★ shot prompt compile ★ → storyboard_shots seeded
                                                  → image-prompt / video-script per shot
```

- **上一步**：用户在前端 approve 了 `StoryboardArtifact`。
- **本步**：本 **LLM agent** 读取 storyboard + brief + 素材 + 创作要求，跨 shot 一致地生成每条「任务卡」。每个 shot 必须拆出三层职责：`providerPrompt` 是镜头语境锚点，`shotImage` 是静态关键帧要求，`shotVideo` 是动态视频运动要求。
- **下一步**：用户显式 apply shot set 后进入 focus mode，对每个 shot 触发 image-prompt → image-batch → video-script → video-batch → final compose。下游 image-prompt agent 以 `shotImage` 为主，video-script agent 以 `shotVideo` 为主，`providerPrompt` 仅作为背景语境，不直接复制为最终 prompt。

## 3. 触发接口

`POST /api/workspaces/:workspaceId/shotprompt/propose`

紧接着的 approve 接口（不触发 shot seeding）：`POST /api/workspaces/:workspaceId/shotprompt/approve`

显式创建 active shot set：`POST /api/workspaces/:workspaceId/shot-sets`

## 4. 输入字段

> **设计原则**：除 `workspaceId` 和 `userDirection` 外，本模块只依赖上游 artifact。画幅 / negative prompt 等技术参数由模型从 `userDirection` 推断；缺省值由 system prompt 内置（aspectRatio 默认 `9:16`、negativePrompt 默认包含「不要在视频上写文字（容易乱码）」）。

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 当前工作区 ID | 字符串 (uuid) | 是 | 请求 |
| `userDirection` | 用户对画幅 / 负向 prompt / 场景基调等的自由文本指示。例：「16:9 横屏」「不要在画面里出现人」 | 字符串 | 否 | 请求 |
| `approvedStoryboard` | 上一步产出的分镜 | 对象 (`StoryboardArtifact`) | 是 | workspace artifact |
| `approvedBrief` | 商品 brief（用于品牌语气、合规约束） | 对象 (`ProductBriefArtifact`) | 是 | workspace artifact |
| `materialIntake` | 素材清单（用于枚举 `referenceAssetRefs` 合法取值） | 对象 (`MaterialIntakeArtifact`) | 是 | workspace artifact |

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "userDirection": "竖屏 9:16，负向 prompt 加上『品牌色偏移』",
  "approvedStoryboard": { /* 参考 storyboard.md 输出示例 */ },
  "approvedBrief": { /* 参考 product-brief.md 输出示例 */ },
  "materialIntake": { /* 参考 material-intake.md 输出示例 */ }
}
```

## 5. 输出字段

输出会被持久化为 `ShotPromptArtifact`，同时数据库里会 seed 出 N 行 `storyboard_shots`。

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `durationSec` | 全片总时长（秒）。模型从 storyboard.totalDurationSec 复述 | 整数 | 是 |
| `aspectRatio` | 视频画幅 | 枚举: `9:16` \| `16:9` \| `1:1` | 是 |
| `prompt` | 整片层级的 provider prompt（给下游 image-prompt / video-script agent 当全局 context）。应包含整片叙事 + 场景基调 + 跨 shot 一致性总纲 | 字符串 | 是 |
| `negativePrompt` | 整片 negative prompt（合规默认 + 用户追加） | 字符串 | 是（允许空字符串） |
| `shots[]` | 逐镜头任务卡列表 | 对象数组 | 是 |
| `tts` | 整片 TTS 配置 | 对象 | 是 |
| `assumptions` | 模型对画幅 / 场景策略 / 默认负向 prompt 等所做的推断 | 字符串 | 是 |

### `shots[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `index` | 镜头序号，与 storyboard.shots[].index 一致 | 整数 | 是 |
| `startSec` | 本镜头在全片中的起始秒。模型基于前序 shots 累加得出 | 整数 | 是 |
| `endSec` | 本镜头在全片中的结束秒 | 整数 | 是 |
| `providerPrompt` | 镜头级语境锚点。**核心责任**：说明本镜目标、商品、场景和上下文；不是最终 image prompt，也不是最终 video provider prompt。 | 字符串 | 是 |
| `referenceAssetRefs[]` | 本镜头首帧图片会引用的素材 ref 列表。每项必须来自 `materialIntake.assets[].ref`。模型应优先把 `primaryProductRef` 放在首位 | 字符串数组 | 是 |
| `voiceover` | 本镜头口播台词。沿用 storyboard 同 index 的 voiceover，不做改写（可空字符串） | 字符串 | 是 |
| `shotImage` | 静态关键帧要求。必须写 scene、composition、lighting、productVisibility、referenceUsage、negative 等静态画面信息；禁止 camera motion、duration、first/last frame、voiceover、transition。 | 对象 | 是 |
| `shotVideo` | 动态视频运动要求。必须写 cameraMotion、subjectMotion、firstFrameIntent、lastFrameIntent、durationIntent、continuity、negative 等动态信息；不得只是复述 `providerPrompt` 或 `shotImage`。 | 对象 | 是 |

### `tts` 子结构

| 字段 | 含义 | 类型 | 必须 |
|---|---|---|---|
| `enabled` | 是否启用 TTS | 布尔 | 是 |
| `source` | TTS 文本来源。**固定为 `shots.voiceover`** | 字面量 | 是 |
| `voiceover` | 全片拼接后的口播文本 | 字符串 | 是 |
| `audioAssetRef` | 若用户上传了自己的口播音频，引用 ref | 字符串 | 否 |

### 输出示例

```json
{
  "prompt": "18 秒 9:16 电商 UGC 视频。白领早晨忙碌中，用三顿半 3 秒冲出一杯精品咖啡，开启高效一天。\n整片场景基调：清晨厨房，暖色调，木质台面，左侧自然光从窗户斜射，背景轻微虚化。\n跨 shot 一致性总纲：shot 0 建立『清晨厨房』基准场景；shot 1+ 必须保持相同的厨房环境、光线方向、台面材质与色调，避免场景漂移。商品外观全程稳定可信。",
  "shots": [
    {
      "index": 0,
      "startSec": 0,
      "endSec": 3,
      "providerPrompt": "0-3 秒 开场吸引：清晨厨房，木质台面散落着笔记本和马克杯，左侧窗户自然光斜射，背景轻微虚化。近景特写：一只手从画面下方伸入，拿起一颗深咖啡色咖啡胶囊。整体色调温暖、有质感、UGC 抖音电商风。",
      "referenceAssetRefs": ["materials/product-main.jpg"],
      "voiceover": "通勤前的 3 秒，能做什么？"
    },
    {
      "index": 1,
      "startSec": 3,
      "endSec": 8,
      "providerPrompt": "3-8 秒 卖点展示：在同一个清晨厨房台面上，一只玻璃杯居中盛冷水，俯拍特写胶囊落入水中并迅速溶解。【场景延续要求】必须严格保持 shot 0 的厨房环境：相同的木质台面、相同的左侧晨光方向、相同的暖色调；不允许出现新场景或新背景元素。",
      "referenceAssetRefs": ["materials/product-main.jpg"],
      "voiceover": "三顿半冷萃，3 秒冷水即溶"
    },
    {
      "index": 2,
      "startSec": 8,
      "endSec": 14,
      "providerPrompt": " 8-14 秒 可信证明：同一清晨厨房台面，包装盒侧面对镜头，光打在『埃塞俄比亚 · 水洗 · 0 蔗糖』标识上，旁边咖啡杯出镜。【场景延续要求】保持与 shot 0 相同的厨房背景、台面材质、晨光方向；包装盒位置应自然融入既有台面布局。",
      "referenceAssetRefs": ["materials/packaging-shot.jpg", "materials/product-main.jpg"],
      "voiceover": "埃塞俄比亚水洗豆，已售 1000 万颗"
    },
    {
      "index": 3,
      "startSec": 14,
      "endSec": 18,
      "providerPrompt": "14-18 秒 行动召唤：清晨厨房台面上正面摆放产品，下方浮出价格标签。【场景延续要求】保持 shot 0 的厨房环境与暖色调；",
      "referenceAssetRefs": ["materials/product-main.jpg"],
      "voiceover": "首单 9.9 元，点击下方链接尝鲜"
    }
  ],
  "assumptions": "shot 0 作为场景基准；shot 1-3 通过 providerPrompt 显式继承 shot 0 的厨房环境；画幅 / 负向 prompt / TTS 等全局配置由 workspace / video provider 层负责，不在本 artifact 内。"
}
```
