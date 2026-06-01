# Video Script Agent

## 1. 业务目标

为单个 shot 组装视频 prompt **并直接调用 Seedance 视频生成接口产出 `number` 个候选视频任务一并返回**。Seedance 以本 shot 的 `image_select_artifact` 作为 `first_frame`、下一 shot 的 `image_select_artifact` 作为 `last_frame`（最后一个 shot 无 last_frame），首尾帧确定 → 4-8 秒视频片段不会出现场景 / 商品漂移。用户在前端看到的是 N 段视频候选，而不是 prompt 文本。

> 通俗解释：每个镜头要把「这一帧静态画面」变成「这一段动起来的视频」。本 agent 把分镜信息 + 首尾帧 + userDirection 翻译成 Seedance prompt，**并直接下任务、等结果、把 M 段候选视频交付给用户挑**。
>
> **关键设计**：每个 shot 的视频生成 **互相独立**——本 shot 的首帧 = `image_select_artifacts[shot]`、末帧 = `image_select_artifacts[shot+1]`，两端都来自已经确认的分镜图，无需等前一个 shot 的视频跑完。所有 shot 可以并行调用 Seedance。

## 2. 在工作流中的位置

```
所有 shot 都 image-selected →（视频生成链路解锁）
                            ┌─→ shot 0 video-script propose ┐
                            ├─→ shot 1 video-script propose ├─→ 每个 shot 用户从 M 段候选挑 1 段
                            ├─→ shot 2 video-script propose │   (video-select)
                            └─→ shot N video-script propose ┘
                                          ↓
                                所有 shot 都 video-selected
                                          ↓
                                     final compose
```

- **上一步**：workspace 内所有 shot 都已完成 image-select，即 `image_select_artifacts` 表覆盖了每一个 shot（由 [image-select.md](image-select.md) `allShotsImageSelected=true` 标记解锁）。
- **本步**：用户点「生成视频」（或前端 auto-trigger，可批量并行触发所有 shot），本 agent 对每个 shot 在一次调用里完成：
  1. 读取 shot 上下文 + first_frame + last_frame + userDirection → 组装 Seedance prompt（写入 `VideoScriptArtifact`，status=ACTIVE）。
  2. 用该 prompt 调 Seedance 视频生成接口 → 拿到 `number` 个 async **task ID**。
  3. 轮询 Seedance task 状态直至 succeeded / failed → 把候选视频 URL 写入 `video_candidates`，在响应里一并返回前端。
- **下一步**：用户在前端 video candidate 网格挑 1 段 → [video-select.md](video-select.md) 写入 `video_select_artifacts`。所有 shot 都 video-selected 后，final compose 解锁。

## 3. 触发接口

- 提议新一轮：`POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose`
- 列出历史轮次：`GET /api/workspaces/:workspaceId/shots/:shotId/video-rounds`

每次 propose 创建新的 `VideoScriptArtifact` + 一组 `video_candidates`；旧轮次标 `STALE`。

## 4. 输入字段

> **设计原则**：用户只需输入 `userDirection`（可选）；其它由后端 / 环境变量补齐。
>
> - `first_frame_url`、`last_frame_url`、`number`、`durationSec` 都由后端基于 shotId + 全局 storyboard 自动注入。
> - 用户不需要勾选首尾帧、不需要选时长、不需要选生成张数。

| 字段              | 含义（白话）                                                                                                                                                                          | 类型                 | 必须 | 来源                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---- | ------------------------------------------ |
| `workspaceId`     | 工作区 ID                                                                                                                                                                             | 字符串 (uuid)        | 是   | 路径参数                                   |
| `shotId`          | 镜头 ID                                                                                                                                                                               | 字符串 (uuid)        | 是   | 路径参数                                   |
| `userDirection`   | 用户对运动 / 节奏的自由文本指示。例：「镜头慢推」「最后定格在胶囊」                                                                                                                   | 字符串               | 否   | 请求                                       |
| `number`          | 要求生成的候选视频数量。默认从 `.env`（如 `DEFAULT_VIDEO_CANDIDATES=2`）提取                                                                                                          | 整数                 | 是   | 环境变量                                   |
| `first_frame_url` | 本 shot 的关键帧 URL，作为 Seedance `role=first_frame` 的输入。**必填，由后端基于 shotId 自动注入**（来自 `image_select_artifacts[shot]`）                                            | 字符串 (URL)         | 是   | 后端注入                                   |
| `last_frame_url`  | 下一 shot 的关键帧 URL，作为 Seedance `role=last_frame` 的输入。**若本 shot 是最后一个，传 null**（Seedance 仅取 first_frame）。后端自动注入（来自 `image_select_artifacts[shot+1]`） | 字符串 (URL) \| null | 是   | 后端注入                                   |
| `durationSec`     | 本 shot 视频时长（秒），1-8。直接来自 storyboard                                                                                                                                      | 整数                 | 是   | 后端注入（storyboard.shots[].durationSec） |

### 模型实际看到的上下文（由后端拼装注入）

| 字段                                | 含义（白话）                                 | 来源                           |
| ----------------------------------- | -------------------------------------------- | ------------------------------ |
| `shot.orderIndex`                   | 镜头序号                                     | `storyboard_shots`             |
| `shot.objective`                    | 镜头作用（hook / benefit / proof / cta）     | shotprompt + storyboard        |
| `shot.voiceover`                    | 该镜头预设的口播台词                         | storyboard                     |
| `shot.providerPromptFromShotPrompt` | shotprompt 编译出的镜头级 prompt（语境锚点） | shotprompt                     |
| `firstFrame.imageUrl`               | 首帧图 URL，对应 `first_frame_url`           | image_select_artifacts[shot]   |
| `firstFrame.basedOnImagePromptText` | 当初生成首帧用的 prompt（保留语境）          | image_prompt_artifacts         |
| `lastFrame.imageUrl`                | 末帧图 URL（若为最后一个 shot 则为 null）    | image_select_artifacts[shot+1] |
| `brief.brandTone`                   | 品牌语气                                     | productBrief                   |
| `previousVideoScript`               | 该 shot 上一版脚本（若存在），用于增量修改   | video_script_artifacts         |

### 输入示例

> 前端发起的请求体里只有 `userDirection`；`number` / `first_frame_url` / `last_frame_url` / `durationSec` 由后端补齐后再交给 agent。下面是 **agent 实际看到** 的完整输入。

**中间 shot（有 last_frame）：**

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "shotId": "1f2e3d4c-5b6a-7890-abcd-ef0123456789",
  "userDirection": "镜头慢推，最后定格在胶囊",
  "number": 3,
  "first_frame_url": "https://storage.daireel.local/workspaces/8c7a.../selected/shot-1.jpg",
  "last_frame_url": "https://storage.daireel.local/workspaces/8c7a.../selected/shot-2.jpg",
  "durationSec": 5
}
```

**最后一个 shot（无 last_frame）：**

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "shotId": "3c4d5e6f-7890-1234-abcd-ef0123456789",
  "userDirection": "结尾固定镜头，留出 CTA 空间",
  "number": 3,
  "first_frame_url": "https://storage.daireel.local/workspaces/8c7a.../selected/shot-3.jpg",
  "last_frame_url": null,
  "durationSec": 4
}
```

## 5. 输出字段

本模块在同一次调用里完成「组装 prompt → 调 Seedance → 轮询 → 返回候选视频」。输出分两类：

1. **候选视频相关**（用户在前端看到的）：`candidates[]`——结构对齐 Seedance API 返回（参考 [docs/reference/video/POST.md](../../reference/video/POST.md) 和 [GET.md](../../reference/video/GET.md)）。
2. **Prompt 元数据**（trace / 复用用）：`providerPrompt` 等——写入 `VideoScriptArtifact`，前端默认不展示。

| 字段                | 含义（白话）                                                                   | 类型           | 必须 |
| ------------------- | ------------------------------------------------------------------------------ | -------------- | ---- |
| `candidates[]`      | 候选视频列表，结构对齐 Seedance task `content` + 后端补的 `candidateId` / 状态 | 对象数组       | 是   |
| `providerPrompt`    | 实际喂给 Seedance 的 prompt 文本（trace 用）                                   | 字符串         | 是   |
| `negativePrompt`    | 负向 prompt（trace 用）                                                        | 字符串 \| null | 否   |
| `cameraMotion`      | 镜头运动描述（trace 用）                                                       | 字符串         | 是   |
| `subjectMotion`     | 主体动作描述（trace 用）                                                       | 字符串         | 是   |
| `productVisibility` | 商品可见性约束（trace 用）                                                     | 字符串         | 是   |
| `voiceover`         | 该镜头口播文本。沿用 storyboard 同 index voiceover，不做改写                   | 字符串 \| null | 否   |

### `candidates[]` 子结构

| 字段            | 含义（白话）                                                                                         | 类型                          | 必须                          |
| --------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------- |
| `candidateId`   | 后端为该候选生成的 UUID。用户选视频 / 持久化 / final compose 引用都用它                              | 字符串 (uuid)                 | 是                            |
| `taskId`        | Seedance 返回的 task ID（如 `cgt-20260529230027-skhsc`），用于轮询 / 重试 / 调试                     | 字符串                        | 是                            |
| `status`        | 任务终态                                                                                             | 枚举: `succeeded` \| `failed` | 是                            |
| `videoUrl`      | 视频可访问 URL，对应 Seedance `content.video_url`（**24 小时有效**，后端通常下载并替换为持久化 URL） | 字符串 \| null                | 否（status=succeeded 时必填） |
| `usage`         | Seedance 返回的 tokens 用量                                                                          | 对象 \| null                  | 否                            |
| `createdAt`     | task 创建时的 unix 时间戳                                                                            | 整数                          | 是                            |
| `failureReason` | 失败原因（status=failed 时必填，前端展示给用户）                                                     | 字符串 \| null                | 否                            |

> `candidates.length` 应等于输入 `number`。若部分 task 失败（内容审核 / 超时），用 status=failed 行补齐。

### `usage` 子结构（对齐 Seedance）

| 字段                | 含义          | 类型 |
| ------------------- | ------------- | ---- |
| `completion_tokens` | 输出 token 数 | 整数 |
| `total_tokens`      | 总 token 数   | 整数 |

### 输出示例

```json
{
  "candidates": [
    {
      "candidateId": "a1b2c3d4-e5f6-7890-abcd-ef0123456789",
      "taskId": "cgt-20260529230027-skhsc",
      "status": "succeeded",
      "videoUrl": "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-1-0-pro-fast/02178006669768500000000000000000000ffffac181ca399c102.mp4?X-Tos-Algorithm=...",
      "usage": {
        "completion_tokens": 246840,
        "total_tokens": 246840
      },
      "createdAt": 1780066697,
      "failureReason": null
    },
    {
      "candidateId": "a1b2c3d4-e5f6-7890-abcd-ef0123456790",
      "taskId": "cgt-20260529230028-x7y8z",
      "status": "succeeded",
      "videoUrl": "https://.../candidate-2.mp4?...",
      "usage": { "completion_tokens": 246840, "total_tokens": 246840 },
      "createdAt": 1780066698,
      "failureReason": null
    },
    {
      "candidateId": "a1b2c3d4-e5f6-7890-abcd-ef0123456791",
      "taskId": "cgt-20260529230029-q9w0e",
      "status": "failed",
      "videoUrl": null,
      "usage": null,
      "createdAt": 1780066699,
      "failureReason": "Seedance: content moderation rejected (motion contained unstable physics simulation)"
    }
  ],
  "providerPrompt": "5 秒竖屏 9:16 视频。首帧：玻璃杯居中盛冷水，杯口悬浮一颗深咖啡色胶囊，柔和侧光。前 1 秒胶囊垂直落入水中，2-4 秒胶囊旋转并迅速溶解、咖啡色由中心向外扩散填充整杯，第 5 秒水面平静、色泽均匀。镜头从 45 度俯拍缓慢推近至入水点。商品外观与首帧参考图保持一致，杯型与位置全程稳定。末帧画面应自然过渡到下一镜头的桌面包装盒视角。",
  "negativePrompt": "商品变形、塑料感、相机抖动、文字模糊、人物入画、不自然运动",
  "cameraMotion": "镜头从俯拍 45 度缓慢推近至胶囊入水处，最后 1 秒固定不动",
  "subjectMotion": "胶囊在前 1 秒下落入水，2-4 秒迅速旋转溶解、咖啡色扩散，最后 1 秒水面恢复平静",
  "productVisibility": "胶囊在 0-2 秒占画面中心 ≥ 20%；溶解后咖啡液体填充整个杯子，可清晰看到色泽",
  "voiceover": "三顿半冷萃，3 秒冷水即溶",
  "riskNotes": [
    "Seedance 对液体溶解过程可能出现非物理形变，建议生成多条候选挑选最合理者",
    "首末帧色调差异较大时，过渡帧可能闪烁；首帧来自 shot 1 的玻璃杯特写，末帧来自 shot 2 的包装盒中景，跨度较大"
  ]
}
```

## 6. 下游消费者

- **本模块自调度**：本 agent **直接**调 Seedance（不再依赖独立 worker 触发）。Worker 剩余职责：（a）把 `candidates[]` 持久化到 `video_candidates`；（b）下载 24h `videoUrl` 到本地存储，对外暴露持久化 URL。
- **前端 video candidates 选择页**：渲染 `candidates[]` 的视频网格让用户挑 1 段。Prompt 元数据默认不展示。
- **video-select**：用户从 candidates 里挑 1 段 → 写入 `video_select_artifacts`（详见 [video-select.md](video-select.md)）。
- **Final Compose Worker**：当所有 shot 都 video-selected → 按 `order_index` 拼接所有 `video_select_artifacts` → ffmpeg concat 输出最终 MP4（参见 arc_v6 §3 `final-compose.worker.ts`）。
- **Trace Viewer**：记录每次 propose、每个 task 的 createdAt / status / tokens，方便追溯失败和成本。Seedance 自带元信息（duration / resolution / seed 等）可通过 `taskId` 现查现用，不入 trace 数据库。

## 7. 验收标准

**前置条件**

- 本接口被调用前，workspace 内所有 shots 必须已 image-selected（即 `image_select_artifacts` 覆盖所有 `storyboard_shots`）；否则 400 `IMAGE_SELECTION_INCOMPLETE`。
- `first_frame_url` 必须等于 `image_select_artifacts[shotId].url`；不允许由前端 / 用户直接传任意 URL。
- 若本 shot 非最后一个：`last_frame_url` 必须等于 `image_select_artifacts[next shot].url`；为最后一个：`last_frame_url` 必须为 `null`。

**候选视频相关（用户可见）**

- `candidates.length` 必须等于输入 `number`。Seedance 短缺时（task 全部失败）用 status=failed 行补齐。
- `candidates[i].videoUrl`（status=succeeded 时）必须是可访问的视频 URL。
- `candidates[i].taskId` 必须是 Seedance 返回的真实 task ID，便于后续重试 / 调试。
- `candidates[i].createdAt` / `usage` 必须直接透传自 Seedance 响应，不允许伪造。
- 视频实际属性（`duration` / `ratio` / `resolution` / `framespersecond` / `seed` 等）不在 artifact 输出里——它们是 Seedance 自带的元信息，可由前端按需通过 `taskId` 查 [GET.md](../../reference/video/GET.md) 获取，不污染候选列表给前端。

**Seedance 调用约束**

- 调用时 `content[]` 必须包含：
  - `{type: "text", text: providerPrompt}`
  - `{type: "image_url", image_url: {url: first_frame_url}, role: "first_frame"}`
  - 若 `last_frame_url` 非空：`{type: "image_url", image_url: {url: last_frame_url}, role: "last_frame"}`
- 调 Seedance 时传入的 `duration` 字段必须等于输入 `durationSec`（1-8）。
- 调 Seedance 时 `ratio` 默认 `adaptive`（让 Seedance 跟随首帧比例）；若 userDirection 显式指定（如「9:16」「16:9」），覆盖。
- 调用模式：异步 task → 轮询 GET `/api/v3/contents/generations/tasks/:id`（参考 [GET.md](../../reference/video/GET.md)）直至 status ∈ {`succeeded`, `failed`}。

**Prompt 元数据**

- `providerPrompt` ≥ 30 字符；推荐 100-400 字符；硬上限 ≤ 600 字符。
- `providerPrompt` 中必须明确描述首帧画面（与 `first_frame_url` 视觉一致）；若有 last_frame，必须描述末帧画面（与 `last_frame_url` 视觉一致）。
- `voiceover` 必须等于 storyboard 同 index 的 voiceover，不允许模型改写。
- `negativePrompt` 应至少包含：`商品变形`、`相机抖动`、`不自然运动`。

**Schema 合法性**

- 输出 JSON 必须能被 `videoScriptArtifactSchema.parse()` 解析。

## 8. 常见失败模式

| 失败现象                                   | 修复方向                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 还没所有 shot 都 image-selected 就调本接口 | 后端在 propose 前用一句 SQL 统一校验 `image_select_artifacts` 覆盖度；缺一个就 400 `IMAGE_SELECTION_INCOMPLETE`，前端 UI 把视频生成 CTA 默认置灰 |
| 生成的视频与首帧不一致（商品突变）         | `providerPrompt` 必须显式复述 first_frame 的视觉关键点；Seedance 通常会以 first_frame 为强约束，但 prompt 仍要明确「保持首帧外观一致」           |
| 中间过渡帧 1-2 秒突然变形                  | 首末帧色调 / 构图差异过大时容易发生。`riskNotes` 显式提示；用户可调整 image-select 让相邻 shot 视觉更近                                          |
| Seedance task 长时间 running（> 5 分钟）   | 后端轮询设上限（如 600 秒），超时则记 failed + reason="provider_timeout"，写入 `usage` 为 null                                                   |
| Seedance 部分 task 失败                    | 用 status=failed 行补齐到 `number`；前端在网格上对 failed 候选灰显，显示 `failureReason`                                                         |
| 24h URL 在用户审视频前过期                 | 后端在写 `video_candidates` 前立即下载视频文件到本地 / MinIO，对外暴露持久化 URL                                                                 |
| Seedance 调用时 `duration` 被模型擅自调整  | 调用层强约束：传入 Seedance 的 `duration` 必须等于注入的 `durationSec`，不允许模型路径自行更改                                                   |
| `providerPrompt` 太长 Seedance 截断        | system prompt 限定 ≤ 600 字符；超出时优先保留首末帧描述 + 镜头运动                                                                               |
| 模型自作主张改写 voiceover                 | system prompt 锁死 voiceover 必须 byte-equal 于 storyboard 同 index voiceover                                                                    |
| 用户在视频生成后回去换 image-select        | 后端策略（按当前设计）：select 不触发 stale，旧视频保留。如果用户希望视频跟着新图重生成，必须手动重新 propose video-script。UI 文案应明确这一点  |
