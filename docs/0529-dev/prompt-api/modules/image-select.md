# Image Candidate Select

## 1. 业务目标

让用户在前端从某 shot 的 N 张候选图里挑 1 张作为该 shot 的「关键帧」（`selected_shot_image`）。这一步是 **下游链路解锁的同步点**——shot N 没确认前，shot N+1 的 image-prompt 跑不起来（缺 `image_ref`）。

> 通俗解释：image-prompt 把 N 张候选图交到用户面前，用户必须挑 1 张，整条剧本才能往后走。**换图（重新 select 到不同 candidate）不会让下游已经跑出来的内容失效**——视频链路要等所有 shot 都 image-selected 之后才统一开启，所以 select 阶段没有任何下游 artifact 需要 stale。Stale 只在用户触发 image-prompt **重新 propose**（即重新生成 N 张候选图）时才会发生。

## 2. 在工作流中的位置

```
image prompt propose → 用户审图 → ★ image candidate select ★ → 解锁 shot N+1 image-prompt
                                                              （视频链路要等所有 shot 都 image-selected）
```

- **上一步**：本 shot 已有 ACTIVE `ImagePromptArtifact` + N 张 `image_candidates`（来自 image-prompt 模块）。
- **本步**：用户点 candidate 网格里的 1 张 → 调本接口 → 后端 UPSERT `selected_shot_images`（每 shot 一行）。**不触发任何 stale 副作用**——换图只是更新本 shot 的「关键帧」，不影响其它 shot 或下游链路。
- **下一步**：
  - 若本 shot 不是最后一个 → shot N+1 的 `image_ref` 解锁，前端可触发 shot N+1 image-prompt propose。
  - 当 **所有 shots 都 image-selected** 后 → 全局视频生成链路解锁，前端 / 后端可以并行触发各 shot 的 video-script propose（每个 shot 的首帧 = 本 shot selected_shot_image，末帧 = 下一 shot selected_shot_image）。详见 [video-script.md](video-script.md) §2。

## 3. 触发接口

`POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select`

## 4. 输入字段

> **设计原则**：本模块不是 LLM agent，是一个纯状态变更接口。只需要 `candidateId`——用户在前端确认了哪张图作为分镜图，就把那张的 ID 传过来。

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 工作区 ID | 字符串 (uuid) | 是 | 路径参数 |
| `shotId` | 镜头 ID | 字符串 (uuid) | 是 | 路径参数 |
| `candidateId` | 用户挑中的候选图 ID（来自 `candidates[].candidateId`） | 字符串 (uuid) | 是 | 请求 |

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "shotId": "1f2e3d4c-5b6a-7890-abcd-ef0123456789",
  "candidateId": "9f1d3a52-7e60-4f9a-9c10-1ab2cd3ef401"
}
```

## 5. 输出字段

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `shotId` | 本次确认的 shotId | 字符串 (uuid) | 是 |
| `selectedCandidateId` | 最终被确认的 candidate | 字符串 (uuid) | 是 |
| `selectedImageUrl` | 该候选的**持久化**图片 URL（不是 Ark 24h 临时 URL）。下游 image-prompt（shot N+1）取这个作为 `image_ref`；后续视频生成阶段取它作为 `first_frame` / `last_frame` | 字符串 (URL) | 是 |
| `nextShotId` | 若存在 shot N+1，返回其 shotId 让前端跳转继续；若本 shot 已是最后一个，返回 null | 字符串 (uuid) \| null | 是 |
| `allShotsImageSelected` | 是否所有 shots 都已 image-selected。`true` 时前端可启动视频生成链路 | 布尔 | 是 |

### 输出示例（中间 shot）

```json
{
  "shotId": "1f2e3d4c-5b6a-7890-abcd-ef0123456789",
  "selectedCandidateId": "9f1d3a52-7e60-4f9a-9c10-1ab2cd3ef401",
  "selectedImageUrl": "https://storage.daireel.local/workspaces/8c7a.../selected/shot-0.jpg",
  "nextShotId": "2a3b4c5d-6e7f-8901-bcde-f01234567890",
  "allShotsImageSelected": false
}
```

### 输出示例（最后一个 shot 完成，解锁视频链路）

```json
{
  "shotId": "3c4d5e6f-7890-1234-abcd-ef0123456789",
  "selectedCandidateId": "9f1d3a52-7e60-4f9a-9c10-1ab2cd3ef405",
  "selectedImageUrl": "https://storage.daireel.local/workspaces/8c7a.../selected/shot-3.jpg",
  "nextShotId": null,
  "allShotsImageSelected": true
}
```

## 6. 下游消费者

- **Shot N+1 image-prompt agent**：读 `selected_shot_images[shot N].url` 作为本 shot 的 `image_ref`。这是场景一致性的来源。
- **视频生成链路**：当 `allShotsImageSelected === true`，每个 shot 的 video-script propose 解锁，读 `selected_shot_images[shot]` 作为 `first_frame`、`selected_shot_images[shot+1]` 作为 `last_frame`（参见 [video-script.md](video-script.md) §4 上下文）。
- **前端 focus mode**：根据 `nextShotId` 自动把 URL 切到下一 shot 的 image_prompt 步骤；`allShotsImageSelected=true` 时解锁视频生成 CTA。
- **Trace Viewer**：记录每次 select 操作。

## 7. 验收标准

**幂等 / 一致性**
- `candidateId` 必须存在于 `image_candidates` 表，且 `candidate.shotId === shotId`、属于该 shot 当前 ACTIVE 的 `ImagePromptArtifact`；否则 400 `INVALID_CANDIDATE`。
- 一个 shot 在任意时刻**至多 1 个** selected_shot_image：使用 UPSERT（`ON CONFLICT (shot_id) DO UPDATE`）。
- 同一 `{shotId, candidateId}` 重复调用幂等：返回相同 `selectedCandidateId` + `selectedImageUrl`。

**Stale 规则（本接口不触发）**
- **select 不触发任何 stale**——换图只更新本 shot 的关键帧，不影响其它对象。
- Stale 只发生在 **image-prompt 重新 propose 一轮新候选** 时（旧 ImagePromptArtifact + 候选 → STALE）。详见 [image-prompt.md](image-prompt.md) §6 / §8。
- 视频链路尚未启动（要等 `allShotsImageSelected=true` 才允许 propose），所以本接口运行期间不存在下游视频 artifact 可被 stale。

**URL 持久化**
- `selectedImageUrl` 必须是后端已持久化（下载到 MinIO / 本地存储）的稳定 URL，**不允许返回 Ark 的 24 小时临时 URL**。原候选 URL 若已过期，select 时必须刷新转存。

**业务约束**
- candidate 的 `status === failed`（生成失败行）→ 400 `CANNOT_SELECT_FAILED_CANDIDATE`。
- shot 是最后一个（`shot.orderIndex === totalShots - 1`）→ `nextShotId` 返回 null。
- `allShotsImageSelected` 计算：扫描该 workspace 所有 shots，全部都有 `selected_shot_images` 行 → `true`。

## 8. 常见失败模式

| 失败现象 | 修复方向 |
|---|---|
| 跳过 select 就跑 shot N+1 image-prompt | shot N+1 的 image-prompt propose 在 N≥1 时强校验 `selected_shot_images[shot N-1]` 存在；否则 400 `NO_SCENE_ANCHOR` |
| 用户预期换图后视频自动更新，但实际没有 | 这是当前设计：select 不触发 stale。如果用户在视频生成后换图，需手动重新 propose video-script。UI 文案应明确提示 |
| 视频链路在还未全部 image-select 时就被触发 | video-script propose 强校验 `allShotsImageSelected === true`，否则 400 `IMAGE_SELECTION_INCOMPLETE` |
| candidate 24h URL 已过期，select 不到图 | 后端在写 selected_shot_images 之前再次下载 / 校验持久化 URL，过期就刷新；持久化失败抛 500 让用户重试 |
| 误传 candidateId（不属于本 shot 或属于 STALE 轮次） | 强校验 `candidate.shotId === shotId` 且 `candidate.artifact.status === ACTIVE`；否则 400 |
| 并发 select（双 tab 同时点不同候选） | UPSERT 天然按最后一次为准；前端 UI 用 optimistic + 后端权威响应纠正 |
| `allShotsImageSelected` 误判（漏算 shot） | 统一用 `SELECT COUNT FROM storyboard_shots WHERE workspace_id = ... AND id NOT IN (SELECT shot_id FROM selected_shot_images)` ；该 query 返回 0 即所有 shots 已 select |
