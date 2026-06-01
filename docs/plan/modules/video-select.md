# Video Candidate Select

## 1. 业务目标

让用户在前端从某 shot 的 N 段候选视频里挑 1 段作为该 shot 的「最终视频片段」（`video_select_artifact`）。这一步是 **final compose 解锁的同步点**——所有 shot 都 video-selected 后，后端才能按 `order_index` 拼接所有片段，输出最终 MP4。

> 通俗解释：每个镜头跑出来 M 段候选视频，用户挑 1 段。所有镜头都挑完后，最终视频才能合成。换视频（重新 select 到不同 candidate）**不会触发任何 stale**——final compose 是按当下的 `video_select_artifacts` 拉数据，换了就用新的，旧的也不需要重新生成。

## 2. 在工作流中的位置

```
所有 shot video-script propose 完成 → 用户对每个 shot 审视频
                                    ↓
                                    ★ video candidate select ★ × N（每个 shot 选一段）
                                    ↓
                            allShotsVideoSelected = true → final compose 解锁
```

- **上一步**：本 shot 已有 ACTIVE `VideoScriptArtifact` + N 段 `video_candidates`（来自 video-script 模块）。
- **本步**：用户点候选视频网格里的 1 段 → 调本接口 → 后端 UPSERT `video_select_artifacts`（每 shot 一行）。**不触发任何 stale**——换视频只更新本 shot 的选择，不影响其它 shot 或下游 final compose（compose 是按当下选择拉取，没有「下游 artifact」需要作废）。
- **下一步**：
  - 若还有 shot 没 video-select → 前端跳转到下一个未选的 shot。
  - 当所有 shot 都 video-selected 后 → final compose CTA 解锁（详见 arc_v6 §3 `final-compose.worker.ts`）。

## 3. 触发接口

`POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select`

## 4. 输入字段

> **设计原则**：纯状态变更接口，不是 LLM agent。用户点了哪段视频就把 `candidateId` 传过来。

| 字段 | 含义（白话） | 类型 | 必须 | 来源 |
|---|---|---|---|---|
| `workspaceId` | 工作区 ID | 字符串 (uuid) | 是 | 路径参数 |
| `shotId` | 镜头 ID | 字符串 (uuid) | 是 | 路径参数 |
| `candidateId` | 用户挑中的视频候选 ID（来自 `candidates[].candidateId`） | 字符串 (uuid) | 是 | 请求 |

### 输入示例

```json
{
  "workspaceId": "8c7a6e4d-1b2c-4f5d-9e3a-7b8c9d0e1f2a",
  "shotId": "1f2e3d4c-5b6a-7890-abcd-ef0123456789",
  "candidateId": "a1b2c3d4-e5f6-7890-abcd-ef0123456789"
}
```

## 5. 输出字段

| 字段 | 含义（白话） | 类型 | 必须 |
|---|---|---|---|
| `shotId` | 本次确认的 shotId | 字符串 (uuid) | 是 |
| `selectedCandidateId` | 最终被确认的 video candidate | 字符串 (uuid) | 是 |
| `selectedVideoUrl` | 该候选的**持久化**视频 URL（不是 Seedance 24h 临时 URL）。final compose 会用它 | 字符串 (URL) | 是 |
| `duration` | 视频时长（秒），final compose 据此排时间轴 | 整数 | 是 |
| `allShotsVideoSelected` | 是否所有 shot 都已 video-selected。`true` 时前端可触发 final compose | 布尔 | 是 |

### 输出示例（中间 shot）

```json
{
  "shotId": "1f2e3d4c-5b6a-7890-abcd-ef0123456789",
  "selectedCandidateId": "a1b2c3d4-e5f6-7890-abcd-ef0123456789",
  "selectedVideoUrl": "https://storage.daireel.local/workspaces/8c7a.../selected-videos/shot-1.mp4",
  "duration": 5,
  "allShotsVideoSelected": false
}
```

### 输出示例（最后一个 shot 完成，解锁 final compose）

```json
{
  "shotId": "3c4d5e6f-7890-1234-abcd-ef0123456789",
  "selectedCandidateId": "a1b2c3d4-e5f6-7890-abcd-ef0123456793",
  "selectedVideoUrl": "https://storage.daireel.local/workspaces/8c7a.../selected-videos/shot-3.mp4",
  "duration": 4,
  "allShotsVideoSelected": true
}
```

> `duration` 直接读自 storyboard 同 index 的 `durationSec`（不再走 video candidate 字段），final compose 据此排时间轴。

## 6. 下游消费者

- **Final Compose Worker** (`apps/server/src/modules/generation/final-compose.worker.ts`)：当 `allShotsVideoSelected === true` 后，按 `order_index` 顺序读取所有 `video_select_artifacts` → 下载视频到 `.daireel/final/<jobId>/in/` → 写 `concat.txt` → 跑 ffmpeg concat → 输出最终 MP4 + sha256 哈希。
- **前端 focus mode**：`allShotsVideoSelected=true` 时显示 final compose CTA；未完成时引导用户跳到下一个未 select 的 shot（前端根据 storyboard 自行计算下一目标，不依赖响应字段）。注意：与图片任务不同，由于首尾帧已确定，视频任务中不同视频片段的生成可以并行启动。
- **Trace Viewer**：记录每次 video select 操作。

## 7. 验收标准

**幂等 / 一致性**
- `candidateId` 必须存在于 `video_candidates`，且 `candidate.shotId === shotId`、属于当前 ACTIVE 的 `VideoScriptArtifact`；否则 400 `INVALID_CANDIDATE`。
- 一个 shot 在任意时刻**至多 1 个** video_select_artifact：UPSERT（`ON CONFLICT (shot_id) DO UPDATE`）。
- 同一 `{shotId, candidateId}` 重复调用幂等。

**Stale 规则（本接口不触发）**
- **select 不触发任何 stale**——换视频只更新当前 shot 选择，不影响其它 shot 或下游。
- 唯一可能让 video_select_artifact 失效的场景：用户重新 propose 视频（生成新一轮候选）；此时由 video-script 模块负责清理。详见 [video-script.md](video-script.md) §3。
- final compose 是「拉模式」——每次跑都按当下 `video_select_artifacts` 数据拼接，不依赖任何 artifact 缓存。所以换视频后再 compose 自动用新选的。

**URL 持久化**
- `selectedVideoUrl` 必须是后端已持久化（下载到本地 / MinIO）的稳定 URL，**不允许返回 Seedance 的 24 小时临时 URL**。原候选 URL 若已过期，select 时必须刷新转存。

**业务约束**
- candidate 的 `status === failed` → 400 `CANNOT_SELECT_FAILED_CANDIDATE`。
- `duration` 直接来自 storyboard 同 index 的 `durationSec`（不来自 video candidate，因为 candidate 输出里不再透传 Seedance duration 字段）。
- `allShotsVideoSelected` 计算：`SELECT COUNT FROM storyboard_shots WHERE workspace_id = ... AND id NOT IN (SELECT shot_id FROM video_select_artifacts)`；该 query 返回 0 即全部已 select。
- 视频链路必须已被解锁（即 `image-select.md` 的 `allShotsImageSelected === true`）；否则 video_candidates 根本不存在，candidate 校验自然失败。

## 8. 常见失败模式

| 失败现象 | 修复方向 |
|---|---|
| 用户预期换视频后 final 自动重新合成 | final compose 是「拉模式」每次按当下数据拼。前端在用户换视频后，若已有 final video 任务，需要提示「最终视频需要重新合成」并提供按钮触发 |
| 跳过某个 shot 的 video-select 直接 final compose | final compose 强校验 `allShotsVideoSelected === true`；否则 400 `VIDEO_SELECTION_INCOMPLETE` |
| candidate 24h URL 已过期 | 后端在写 video_select_artifacts 前下载持久化；视频文件较大（1080p 5 秒可能 5-15MB），建议异步预下载 |
| 误传 candidateId（不属于本 shot 或属于 STALE 轮次） | 强校验 `candidate.shotId === shotId` 且 `candidate.artifact.status === ACTIVE` |
| 并发 select | UPSERT 天然按最后一次为准；前端 optimistic + 后端权威响应纠正 |
| 同一 shot 多次 select 不同候选 | 业务上允许（用户改主意），UPSERT 覆盖即可，无 stale 副作用 |
| Seedance 实际 duration 与 storyboard 不符（异常 task） | candidate 已不再透传 duration，本检查移到 video-script 模块入库时做：对比 Seedance task `GET .../tasks/:id` 返回的 `duration` 与注入的 `durationSec`，不匹配则把该 candidate 标 failed |
