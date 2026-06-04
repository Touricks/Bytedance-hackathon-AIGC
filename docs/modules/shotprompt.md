# Shot Prompt Agent

## 1. 业务目标

把审核过的 storyboard 扩写成下游 shot workflow 的「种子」结构（`ShotPromptArtifact`）：为每个镜头编排「拍摄任务卡」，同时**跨 shot 锚定环境 / 背景一致性**，让后续 image-prompt → image-batch → video-batch 在完整视频里保持场景稳定。

本 agent 同时负责三件事：
1. **整片级 master prompt**：描述整条视频的情绪旅程，格式：`[目标人群] 从 [负面情绪] 转变为 [正面情绪]`
2. **逐镜头 providerPrompt**：Seedance 可直接执行的画面描述，遵循五要素公式
3. **场景一致性策略**：shot 0 建立基准场景；shot 1+ 在 providerPrompt 里显式继承 shot 0 的背景/光线/布景，防止「下一个镜头突然换了一个陌生房间」这种场景漂移

> 通俗解释：storyboard 是给人看的「分镜剧本」；shotPrompt 是给模型/下游 agent 看的「拍摄任务卡」，每个镜头一张。**核心责任**：让 4-8 秒视频里每个镜头的环境保持连贯，不出现场景跳切感。

## 2. 在工作流中的位置

```
storyboard (approved) → ★ shot prompt compile ★ → storyboard_shots seeded
                                                  → image-prompt / video-script per shot
```

- **上一步**：用户在前端 approve 了 `StoryboardArtifact`（6 个镜头，13 秒）。
- **本步**：本 LLM agent 读取 storyboard + brief + 素材，跨 shot 一致地生成每条「任务卡」（providerPrompt、起止秒、参考素材列表、口播等）。
- **下一步**：用户进入 focus mode，对每个 shot 触发 image-prompt → image-batch → video-script → video-batch → final compose。

## 3. 触发接口

`POST /api/workspaces/shotprompt/propose`

approve 接口（触发 shot seeding）：`POST /api/workspaces/shotprompt/approve`

## 4. 输入字段

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 当前工作区 ID | 字符串 (uuid) | 是 | 请求 |
| `userDirection` | 用户对画幅/负向 prompt/场景基调等的自由文本指示 | 字符串 | 否 | 请求 |
| `approvedStoryboard` | 上一步产出的分镜（6 个镜头） | 对象 (`StoryboardArtifact`) | 是 | workspace artifact |
| `approvedBrief` | 商品 brief（用于品牌语气、合规约束、情绪触点） | 对象 (`ProductBriefArtifact`) | 是 | workspace artifact |
| `materialIntake` | 素材清单（用于枚举 `referenceAssetRefs` 合法取值） | 对象 (`MaterialIntakeArtifact`) | 是 | workspace artifact |

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "userDirection": "竖屏 9:16，negativePrompt 加上「品牌色偏移」",
  "approvedStoryboard": { "...": "见 storyboard.md 输出示例" },
  "approvedBrief": { "...": "见 product-brief.md 输出示例" },
  "materialIntake": { "...": "见 material-intake.md 输出示例" }
}
```

## 5. 输出字段

输出会被持久化为 `ShotPromptArtifact`，同时数据库里会 seed 出 N 行 `storyboard_shots`（status=`DRAFT`）。

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `targetProvider` | 视频生成提供商，固定为 `seedance` | 字面量 | 是 |
| `durationSec` | 全片总时长（秒），从 storyboard.totalDurationSec 复述，**固定 13** | 整数 | 是 |
| `aspectRatio` | 视频画幅 | 枚举: `9:16` \| `16:9` \| `1:1` | 是 |
| `prompt` | 整片层级的 master prompt（描述情绪旅程，供下游全局 context） | 字符串 | 是 |
| `negativePrompt` | 整片 negative prompt（合规默认 + 用户追加） | 字符串 | 是（允许空字符串） |
| `shots[]` | 逐镜头任务卡列表，**与 storyboard.shots 一一对应** | 对象数组 | 是 |
| `tts` | 整片 TTS 配置 | 对象 | 是 |
| `assumptions` | 模型对画幅/场景策略/默认 negativePrompt 等所做的推断 | 字符串数组 | 是 |

### `shots[]` 子结构

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `index` | 镜头序号，与 storyboard.shots[].index 一致 | 整数 | 是 |
| `startSec` | 本镜头在全片中的起始秒（前序 shots 时长累加得出） | 整数 | 是 |
| `endSec` | 本镜头在全片中的结束秒 | 整数 | 是 |
| `providerPrompt` | 给 Seedance 的镜头级画面描述，遵循五要素公式（详见下方） | 字符串 | 是 |
| `referenceAssetRefs[]` | 本镜头首帧会引用的素材 ref 列表，每项必须来自 `materialIntake.assets[].ref` | 字符串数组 | 是 |
| `voiceover` | 本镜头口播台词，沿用 storyboard 同 index 的 voiceover，**不做改写** | 字符串 | 是 |

### `tts` 子结构

| 字段 | 含义 | 类型 | 必须 |
|---|---|---|---|
| `enabled` | 是否启用 TTS | 布尔 | 是 |
| `source` | TTS 文本来源，固定为 `shots.voiceover` | 字面量 | 是 |
| `voiceover` | 全片拼接后的口播文本（各 shot.voiceover 用「。」连接） | 字符串 | 是 |
| `audioAssetRef` | 若用户上传了自己的口播音频，引用 ref | 字符串 | 否 |

---

## 关键规则：providerPrompt 五要素公式

每个 shot 的 `providerPrompt` 必须按以下 5 个要素顺序描述，缺一不可：

```
主体 + 动作/状态 + 镜头运动 + 光线风格 + 情绪氛围
```

| 要素 | 含义 | 示例 |
|---|---|---|
| 主体 | 画面主角（人物/商品/场景） | 年轻女性 / 深棕色咖啡胶囊 |
| 动作/状态 | 主体正在做什么或处于什么状态 | 轻触面部 / 落入冷水溶解 |
| 镜头运动 | 摄像机如何移动 | 镜头缓慢推进 / 俯拍特写 |
| 光线风格 | 光线来源和色调 | 清晨柔和自然光 / 暖黄打光 |
| 情绪氛围 | 画面传达的情绪感受 | 温暖期待感 / 精品质感 |

**正确示例（≥20 字，五要素完整）：**
> 年轻女性轻触面部，镜头缓慢推进，清晨柔光，温暖期待感

**错误示例（过于模糊，不可接受）：**
> ~~女生用护肤品，很好看~~

**注意事项：**
- providerPrompt 必须是**单个连续镜头**描述，不允许出现「剪辑到」「切换到」「下一幕」等字眼
- 最短 20 字，推荐 40-80 字
- 必须用中文

---

## 关键规则：各镜头情绪氛围映射

每个 shot 的 `purpose` 决定 providerPrompt 中「情绪氛围」要素的方向：

| `purpose` | 目标情绪氛围 | 画面质感建议 |
|---|---|---|
| `hook` | 张力感、悬念、强烈视觉冲击 | 快节奏、鲜明对比、高饱和度 |
| `benefit` | UGC 真实感、生活化、自然流畅 | 暖色调、手持质感、日常场景 |
| `proof` | 细节可信度、清晰专业、权威感 | 高清特写、稳定构图、中性色调 |
| `cta` | 向往感、轻松愉悦、行动冲动 | 明亮柔和、产品居中、简洁背景 |

---

## 关键规则：跨 shot 场景一致性

**Shot 0（hook 镜头）** 是全片场景基准。它的 providerPrompt 必须完整建立：
- 地点（厨房 / 户外 / 办公室等）
- 光线方向和色调（左侧晨光 / 顶光 / 暖黄灯光等）
- 背景细节（台面材质、墙色等）

**Shot 1+ 镜头** 必须在 providerPrompt 中显式写入继承语句，格式：
> 【场景延续要求】保持与 shot 0 一致的 [地点]+[光线]+[背景细节]

这句话告诉下游 image-prompt agent：生成本镜头首帧时，必须把 shot 0 的选定图像作为场景参考注入，不允许出现新场景。

---

## 关键规则：negativePrompt 默认必含项

无论用户是否填写 `userDirection`，以下词必须出现在 `negativePrompt` 中：

```
文字水印、字幕叠加、变形扭曲、额外品牌标志
```

可根据商品品类追加：
- 护肤/美妆类：模糊皮肤细节
- 食品类：不自然食物颜色、食物变形
- 服装类：布料褶皱失真

---

### 整片 master prompt 格式

`prompt` 字段（整片 master prompt）：

```
格式：[目标人群] 从 [负面情绪] 转变为 [正面情绪]
```

示例：
> 忙碌上班族从疲惫焦虑转变为轻松自信
> 通勤白领从「每天排队等咖啡的无奈」转变为「3 秒自由的精品早晨」

---

### 输出示例

```json
{
  "targetProvider": "seedance",
  "durationSec": 13,
  "aspectRatio": "9:16",
  "prompt": "通勤白领从「每天早高峰排队买咖啡的无奈与焦虑」转变为「3 秒即溶的精品咖啡自由感」",
  "negativePrompt": "文字水印、字幕叠加、变形扭曲、额外品牌标志",
  "shots": [
    {
      "index": 0,
      "startSec": 0,
      "endSec": 2,
      "providerPrompt": "0-2 秒 开场吸引：早高峰咖啡店门口，一排长队蜿蜒延伸，主体是一位拎着公文包的年轻女性站在队伍末端，面露无奈，镜头缓慢推进至她皱眉的面部，早晨冷白光从玻璃门透入，张力感强、情绪紧绷。场景基准：咖啡店室外环境，冷调晨光，玻璃门反光。",
      "referenceAssetRefs": ["materials/product-main.jpg"],
      "voiceover": "每天排队买咖啡，烦不烦？"
    },
    {
      "index": 1,
      "startSec": 2,
      "endSec": 5,
      "providerPrompt": "2-5 秒 卖点展示：一只手拿起一颗深棕色咖啡胶囊，轻轻投入盛有冷水的透明玻璃杯，胶囊迅速溶解散开，俯拍特写，清晨柔和自然光从侧面打入，画面 UGC 真实感，温暖期待。【场景延续要求】保持与 shot 0 相同的室内厨房场景基调，木质台面，侧面晨光方向不变，不引入新背景元素。",
      "referenceAssetRefs": ["materials/product-main.jpg"],
      "voiceover": "三顿半，3 秒冷水即溶"
    },
    {
      "index": 2,
      "startSec": 5,
      "endSec": 8,
      "providerPrompt": "5-8 秒 第二卖点：同一位年轻女性坐在通勤地铁车厢靠窗位置，一手捧着刚冲好的咖啡杯，面带轻松微笑，镜头从侧面中景轻缓横移，窗外城市风景虚化，暖色自然光，UGC 生活化质感，自信轻松。【场景延续要求】人物状态与 shot 0 同一主角，服装一致；光线保持暖色调。",
      "referenceAssetRefs": ["materials/product-main.jpg"],
      "voiceover": "比速溶精品，比手冲方便"
    },
    {
      "index": 3,
      "startSec": 8,
      "endSec": 10,
      "providerPrompt": "8-10 秒 产品背书：桌面上摆放三顿半咖啡包装盒，侧面对准镜头，光线精准打在「埃塞俄比亚·水洗·0蔗糖」标识上，特写，稳定构图，中性暖色调打光，画面清晰专业，权威感。【场景延续要求】保持与 shot 0 相同的木质台面，不引入新背景。",
      "referenceAssetRefs": ["materials/packaging-shot.jpg"],
      "voiceover": "埃塞俄比亚水洗豆，已售千万颗"
    },
    {
      "index": 4,
      "startSec": 10,
      "endSec": 11,
      "providerPrompt": "10-11 秒 细节强化：极近景特写包装盒正面，「0蔗糖」字样占据画面，清晰锐利，稳定无抖动，白色/浅色背景，专业质感，细节可信度高。【场景延续要求】背景保持与 shot 3 相同台面色调。",
      "referenceAssetRefs": ["materials/packaging-shot.jpg"],
      "voiceover": "0 蔗糖，真喝得放心"
    },
    {
      "index": 5,
      "startSec": 11,
      "endSec": 13,
      "providerPrompt": "11-13 秒 行动召唤：产品正面在纯净浅色背景居中展示，价格标签自然浮现，镜头缓缓拉出，明亮柔和的暖色打光，画面简洁轻快，向往感与行动冲动兼备。【场景延续要求】背景轻柔，与全片暖色调一致。",
      "referenceAssetRefs": ["materials/product-main.jpg"],
      "voiceover": "首单 9.9，点击尝鲜"
    }
  ],
  "tts": {
    "enabled": true,
    "source": "shots.voiceover",
    "voiceover": "每天排队买咖啡，烦不烦？。三顿半，3 秒冷水即溶。比速溶精品，比手冲方便。埃塞俄比亚水洗豆，已售千万颗。0 蔗糖，真喝得放心。首单 9.9，点击尝鲜"
  },
  "assumptions": [
    "画幅默认 9:16，适配抖音信息流",
    "shot 0 建立室外咖啡店+早高峰场景基准，shot 1-5 延续或衔接",
    "negativePrompt 使用合规默认词表，未追加品类特定词"
  ]
}
```

## 6. 下游消费者

- **Image Prompt Agent**：读取每个 shot 的 `providerPrompt` 生成关键帧；shot N（N≥1）会自动把 shot 0 的选定图像作为 `scene_reference` 注入，由 `providerPrompt` 里的「场景延续要求」文字指引该过程。
- **Video Script Agent（Seedance）**：读取 `providerPrompt` + `referenceAssetRefs` 生成视频。
- **TTS 服务**：读取 `tts.voiceover` 生成全片配音。
- **Feedback Route**：用户对镜头画面/口播不满时，路由到这里，注入 `revisionInstruction`。

## 7. 验收标准

- `targetProvider` 必须为 `"seedance"`，不允许其他值。
- `shots` 数组长度与 `approvedStoryboard.shots` 完全一致（固定 6 个）。
- `startSec` 和 `endSec` 连续不重叠：`shots[N].endSec == shots[N+1].startSec`；`shots[0].startSec == 0`；`shots[5].endSec == 13`。
- 每个 `providerPrompt` 至少 20 字，包含五要素（主体、动作/状态、镜头运动、光线风格、情绪氛围）。
- `providerPrompt` 必须是单个连续镜头描述，不出现「剪辑到」「切换到」「下一幕」等字眼。
- shot index 1+ 的 `providerPrompt` 必须包含「场景延续要求」字样，显式锚定 shot 0 基准场景。
- `negativePrompt` 必须包含：文字水印、字幕叠加、变形扭曲、额外品牌标志。
- `voiceover` 沿用 storyboard 同 index 值，**不允许改写**。
- `referenceAssetRefs` 中每个 ref 必须来自 `materialIntake.assets[].ref`。
- `tts.voiceover` 等于所有 shot.voiceover 用「。」连接的结果。
- `prompt`（master prompt）格式：`[目标人群] 从 [负面情绪] 转变为 [正面情绪]`。
- 输出 JSON 必须能被 `shotPromptArtifactSchema.parse()` 解析。

## 8. 常见失败模式

| 失败现象 | 修复方向 |
|---|---|
| `providerPrompt` 过于模糊（「女生用护肤品，很好看」） | system prompt 强制五要素公式 + 给反例对照 |
| shot 1+ 没有场景延续语句，导致视频场景漂移 | system prompt 明确：shot index ≥1 的 providerPrompt 必须包含「场景延续要求」段落 |
| `providerPrompt` 里提到「剪辑」「下一幕」等 | system prompt 规定：单镜头描述，禁止出现剪辑相关词汇 |
| `startSec` / `endSec` 与 storyboard 时长不匹配 | system prompt 要求模型先计算累加秒数再填写，并给公式 |
| `voiceover` 被模型改写 | system prompt 明确：`voiceover` 字段直接复制 storyboard 的值，不修改不优化 |
| `negativePrompt` 为空或遗漏合规词 | system prompt 内置默认 negativePrompt 词表，并说明这是合规要求 |
| `tts.voiceover` 拼错（遗漏某 shot 或顺序错乱） | system prompt 给拼接公式：shots.map(s => s.voiceover).join("。") |
| hook 镜头情绪氛围写成「温馨」（应该是张力感） | system prompt 给出 purpose → 情绪氛围对照表 |
