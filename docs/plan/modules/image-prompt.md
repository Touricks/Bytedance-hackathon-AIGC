# Image Prompt Agent

## 1. 业务目标

为单个镜头（shot）组装图像 prompt **并直接调用 Ark 图像生成接口产出 `number` 张候选图（image candidates）一并返回**。用户在前端看到的是 N 张图片，而不是 prompt 文本——因为用户在意的是图像效果，不在意 prompt 长什么样。

> 通俗解释：每个镜头都要先定下「这一帧画面长什么样」再去做视频。本 agent 把分镜的 `visualDirection`、商品素材、**前序 shot 的已选首帧 `image_ref`**（场景一致性锚点）翻译成图像 prompt，**并在同一次调用里跑完生成、直接交付 N 张候选图**。Prompt 文本仍写入 artifact 用作 trace / 复用，但不是给用户看的。

## 2. 在工作流中的位置

```
shot prompt approved → storyboard_shots seeded
                       → ★ image prompt propose ★（内部：组装 prompt + 调 Ark + 返回 N 张候选）
                                                  → 用户从 N 张里挑 1 张 (image_select_artifact)
                                                  → video script → video batch → ...
```

- **上一步**：shot 已 seed 到 `storyboard_shots` 表。shot N（N≥1）的前一 shot 必须已经有 `image_select_artifact`，作为本 shot 的场景锚点 `image_ref`；shot 0 的 `image_ref` 由后端用 `materialIntake.primaryProductRef` 替代以建立基准。
- **本步**：用户点「生成图片」（或前端 auto-trigger），本 agent 在一次调用内完成：
  1. 读取 shot 上下文 + `image_ref` + `userDirection` → 组装结构化图像 prompt（写入 `ImagePromptArtifact`，status=ACTIVE）。
  2. 用该 prompt 调 Ark Seedream → 拿到 `number` 张候选图。
  3. 把候选写入 `image_candidates` 表，并在响应里一并返回前端。
- **下一步**：用户在前端 candidate 选择页挑 1 张 → 写入 `image_select_artifacts` → 进入 video-script。

## 3. 触发接口

- 提议新一轮：`POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose`
- 列出历史轮次：`GET /api/workspaces/:workspaceId/shots/:shotId/image-rounds`

> 配套同步点 `POST .../image-candidates/select`（用户从 N 张候选里挑 1 张并解锁下游）独立成模块，见 [image-select.md](image-select.md)。
>
> **去掉** `POST .../image-prompts/edit`：用户不再直接编辑 prompt 文本，所有意图通过 `userDirection` 走 propose，与「用户不在意 prompt」的设计原则一致。

每次 propose 都会生成新的 `ImagePromptArtifact` + 一组 `image_candidates`；旧轮次被标记为 `STALE`，新轮次是 `ACTIVE`。`GET .../image-rounds` 返回结构按「一轮 propose = 一组候选图」组织，前端用来查看 / 回看历史轮次（如果该接口不暴露给前端用户，MVP 可只保留为内部 debug 端点）。

## 4. 输入字段

> **设计原则**：用户只需输入 `userDirection`（可选）；其它都由后端自动注入或从环境变量取值。
>
> - `image_ref`（场景锚点）和 `number`（生成张数）虽然是必填，但都由后端 / 环境变量提供，不暴露给前端 / 用户。
> - 参考素材直接来自 shot 自带的 `referenceAssetRefs`，风格从 brief / userDirection 推断——用户不需要勾选素材、不需要选风格预设。

| 字段            | 含义（白话）                                                                                                                                                                                                                                 | 类型          | 必须 | 来源     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- | -------- |
| `workspaceId`   | 工作区 ID                                                                                                                                                                                                                                    | 字符串 (uuid) | 是   | 路径参数 |
| `shotId`        | 镜头 ID                                                                                                                                                                                                                                      | 字符串 (uuid) | 是   | 路径参数 |
| `userDirection` | 用户对画面的自由文本指示。例：「光线柔和一些」「再加点复古色调」「换个角度」                                                                                                                                                                 | 字符串        | 否   | 请求     |
| `number`        | 要求生成的候选图数量。默认从 `.env`（如 `DEFAULT_IMAGE_CANDIDATES=3`）提取                                                                                                                                                                   | 整数          | 是   | 环境变量 |
| `image_ref`     | 场景一致性锚点图 URL。**shot N（N≥1）**：必须是前一 shot 的已选首帧 URL（来自 `image_select_artifacts[shot N-1]`）；**shot 0**：后端用 `materialIntake.primaryProductRef` 的 URL 替代。**必填，由后端基于 shotId 自动注入**，前端 / 用户不传 | 字符串 (URL)  | 是   | 后端注入 |

### 模型实际看到的上下文（由后端拼装注入）

> 后端会基于 `shotId` 自动注入以下 artifact / 派生字段；prompt 需要知道模型能看到什么，但用户和前端不需要传任何额外字段。

| 字段                                | 含义（白话）                                                           | 来源                         |
| ----------------------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `shot.orderIndex`                   | 镜头在全片中的序号（从 0 开始）                                        | `storyboard_shots` 表        |
| `shot.objective`                    | 本镜头要达成什么（purpose / scene 展开）                               | shotprompt + storyboard      |
| `shot.visualDirection`              | 画面方向、构图、镜头运动                                               | storyboard                   |
| `shot.productAssetRef`              | 本镜头主商品素材 ref                                                   | storyboard                   |
| `shot.referenceAssetRefs`           | shot 任务卡里登记的参考 ref（含 `shot_asset_refs` 中用户在素材栏挂的） | shotprompt + shot_asset_refs |
| `shot.providerPromptFromShotPrompt` | shotprompt 编译出的镜头级 prompt（语境锚点）                           | shotprompt                   |
| `brief.brandTone`                   | 品牌语气（影响视觉调性）                                               | productBrief                 |
| `materialIntake.assets[]`           | 完整可用素材清单（用来枚举 referenceImageUsage）                       | materialIntake               |
| `previousImagePromptText`           | 该 shot 上一版本的 promptText（若存在），用于增量修改                  | image_prompt_artifacts       |

### 输入示例

> 前端发起的请求体里只有 `userDirection`；`number` 和 `image_ref` 由后端 / 环境变量补齐后再交给 agent。下面是 **agent 实际看到** 的完整输入。

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "shotId": "1f2e3d4c-5b6a-7890-abcd-ef0123456789",
  "userDirection": "光线再柔和一些，避免硬阴影",
  "number": 3,
  "image_ref": "https://storage.daireel.local/workspaces/8c7a.../selected/shot-0.jpg"
}
```

## 5. 输出字段

本模块在同一次调用里完成「组装 prompt → 调 Ark Seedream → 返回候选图」。输出分两类：

1. **候选图相关**（用户在前端看到的）：`candidates[]` / `created` / `usage`——结构对齐 Ark API 返回（参考 [docs/reference/image/POST.md](../../reference/image/POST.md)）。
2. **Prompt 元数据**（trace / 复用用）：`promptText` 等——写入 `ImagePromptArtifact`，前端默认不展示给用户。

| 字段                    | 含义（白话）                                                         | 类型           | 必须 |
| ----------------------- | -------------------------------------------------------------------- | -------------- | ---- |
| `candidates[]`          | 候选图列表。结构对齐 Ark 返回的 `data[]` + 后端补的 `candidateId`    | 对象数组       | 是   |
| `created`               | Ark 返回的生成 unix 时间戳（直接透传）                               | 整数           | 是   |
| `usage`                 | Ark 返回的用量统计（直接透传）                                       | 对象           | 是   |
| `promptText`            | 实际喂给 Ark 的 prompt 文本（trace 用）                              | 字符串         | 是   |
| `negativePrompt`        | 负向 prompt（trace 用）                                              | 字符串 \| null | 否   |
| `productVisibilityRule` | 商品如何呈现的硬性规则（trace 用）                                   | 字符串         | 是   |
| `referenceImageUsage[]` | 参考图使用说明（trace 用，含 `image_ref` 的 `scene_reference` 条目） | 对象数组       | 是   |

### `candidates[]` 子结构

| 字段          | 含义（白话）                                                                           | 类型          | 必须 |
| ------------- | -------------------------------------------------------------------------------------- | ------------- | ---- |
| `candidateId` | 后端为该候选生成的 UUID。用户选图 / 持久化 / video-script 引用都用它                   | 字符串 (uuid) | 是   |
| `url`         | 图片访问 URL，对齐 Ark `data[].url`。**24 小时有效**，后端通常会下载并替换为持久化 URL | 字符串        | 是   |
| `size`        | 实际像素尺寸，对齐 Ark `data[].size`，格式 `"WIDTHxHEIGHT"`                            | 字符串        | 是   |

> `candidates.length` 应等于输入 `number`。若 Ark 返回少于 `number` 张（部分内容审核拦截、模型限额等），后端用 `usage.generated_images` 检测短缺并发起补刀，最终对齐到 `number`。

### `usage` 子结构

| 字段               | 含义                   | 类型 | 必须 |
| ------------------ | ---------------------- | ---- | ---- |
| `generated_images` | 实际成功生成的图片张数 | 整数 | 是   |
| `output_tokens`    | 输出 token 数          | 整数 | 是   |
| `total_tokens`     | 总 token 数            | 整数 | 是   |

### `referenceImageUsage[]` 子结构

| 字段          | 含义（白话）                                                              | 类型                                                                                          | 必须 |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---- |
| `assetId`     | 引用的素材 ref（来自 `materialIntake.assets[].ref`）或 `image_ref` 的 URL | 字符串                                                                                        | 是   |
| `usage`       | 这张参考图的用途                                                          | 枚举: `product_identity` \| `style_reference` \| `scene_reference` \| `composition_reference` | 是   |
| `instruction` | 给模型的具体指令。例：「保持包装上 logo 的字形不变」                      | 字符串                                                                                        | 是   |

> `usage` 取值含义：
>
> - `product_identity`：保持商品外观一致（必给 `shot.productAssetRef`）
> - `style_reference`：仅借鉴风格 / 色调
> - `scene_reference`：锚定整体场景 / 环境。**shot N≥1 必须用此 usage 引用 `image_ref`**，保证背景延续
> - `composition_reference`：仅借鉴构图

### 输出示例

```json
{
  "candidates": [
    {
      "candidateId": "9f1d3a52-7e60-4f9a-9c10-1ab2cd3ef401",
      "url": "https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/0217800670540611e898ad59ee92efe47f7a884c6f332569aeb89_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Expires=86400&X-Tos-Signature=...",
      "size": "1600x2848"
    },
    {
      "candidateId": "9f1d3a52-7e60-4f9a-9c10-1ab2cd3ef402",
      "url": "https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/.../_1.jpeg?X-Tos-Algorithm=...",
      "size": "1600x2848"
    },
    {
      "candidateId": "9f1d3a52-7e60-4f9a-9c10-1ab2cd3ef403",
      "url": "https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/.../_2.jpeg?X-Tos-Algorithm=...",
      "size": "1600x2848"
    }
  ],
  "created": 1780067086,
  "usage": {
    "generated_images": 3,
    "output_tokens": 16072,
    "total_tokens": 16072
  },
  "promptText": "竖屏 9:16 电商产品场景图。清晨厨房台面，柔和窗光从画面左侧斜射进来。近景特写：一只手从画面下方伸入，拿起一颗深咖啡色小型咖啡胶囊（参考主图保持外观一致）。严格继承 image_ref 的厨房环境、台面材质、光线方向。背景轻微虚化，可见散落的笔记本和马克杯。整体色调温暖、有质感、UGC 风格。",
  "negativePrompt": "塑料感、过曝、商品变形、文字模糊、多余手指、低分辨率、场景突变、新背景元素",
  "productVisibilityRule": "咖啡胶囊必须完整可见，无遮挡，占画面面积 ≥ 25%；包装色与 product_identity 参考一致",
  "referenceImageUsage": [
    {
      "assetId": "materials/product-main.jpg",
      "usage": "product_identity",
      "instruction": "保持胶囊正面包装色与文字布局，颜色不可偏移"
    },
    {
      "assetId": "https://storage.daireel.local/workspaces/8c7a.../selected/shot-0.jpg",
      "usage": "scene_reference",
      "instruction": "严格继承场景：木质台面、左侧晨光方向、暖色调、背景虚化程度；不要引入新的家具或道具"
    }
  ]
}
```

## 6. 下游消费者

- **Image Worker** (`apps/server/src/modules/generation/image.worker.ts`)：本模块**直接**调 Ark Seedream（不再依赖独立的 worker 触发），返回 `candidates[]`；worker 的剩余职责是把 `candidates[]` 持久化到 `image_candidates` 表 + 下载 24 小时 URL 到本地存储。
- **前端 image candidates 选择页**：渲染 `candidates[]` 的图片网格让用户挑 1 张。**Prompt 元数据（`promptText` 等）默认不展示**——用户只看图。
- **Video Script Agent**：当用户选定一张图后，video-script 会读 `ImagePromptArtifact.promptText`、`negativePrompt`、`productVisibilityRule` 当 context（作为生成视频的「上文」）。
- **Trace Viewer**：记录每次 prompt 版本变更 + Ark `usage` token 消耗，方便追溯失败原因和成本。

## 7. 验收标准

**候选图相关（用户可见）**

- `candidates.length` 必须等于输入 `number`。Ark 短缺时，后端做补刀对齐。
- 每个 `candidates[i].url` 必须是可访问的图片 URL；`size` 必须符合 Ark 文档允许的尺寸范围（参见 [imageGenerate.pdf](../../reference/image/imageGenerate.pdf)）。
- `candidateId` 必须是新生成、未冲突的 UUID。
- `created` 与 `usage.generated_images` / `usage.total_tokens` 必须直接透传自 Ark 响应，不允许伪造。

**Prompt 元数据（trace）**

- `promptText` ≥ 20 字符；推荐 80-300 字符；硬上限 ≤ 600 字符（Ark Seedream 5.0 建议不超过 300 个汉字或 600 个英文单词）。
- `promptText` 中**不允许编造**商品事实（产地、成分、价格等）；只能引用 brief / shot 中已存在的事实。
- `promptText` 中**不允许出现**合规高风险词汇（「最」「第一」「国家级」等绝对化用语）——由本 agent 的 system prompt 内置默认词表保证。
- `referenceImageUsage[]` 中每个 `assetId` 必须命中 `materialIntake.assets[].ref` 或等于 `image_ref` URL。
- 必须至少有一条 `usage=product_identity` 的 entry，并且 `assetId` 等于 `shot.productAssetRef`。
- **shot N≥1 必须至少有一条 `usage=scene_reference` 的 entry，且 `assetId` 等于 `image_ref`**——这是场景一致性的硬约束。
- `productVisibilityRule` 必须显式说明商品可见性约束（不能为空、不能含糊）。
- `negativePrompt` 中应包含基础质量项：`商品变形`、`文字模糊`、`多余手指` / `多余手部`（人物镜头）、`场景突变`。

**Ark 调用约束**

- 调用 Ark 时 `image` 字段必须包含 `image_ref`（首位）+ `shot.productAssetRef`（次位）等参考图，最多 14 张（参见 imageGenerate.pdf 单图要求）。
- `response_format` 固定取 `url`（24 小时有效，后端负责持久化）。
- `watermark` 固定取 `false`（电商素材不能带 AI 水印）。
