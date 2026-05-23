# 2026-05-23 Grill Note：V0 两命令 API 边界

## 审阅状态

已确认。

## 背景

V0 已确认采用两步式主流程，且创作蓝图只读确认。如果后端仍使用一个 `GenerationJob` 从剧本生成跑到成片生成，中间暂停等待用户确认，会让 job 既表示蓝图生成，又表示成片生成，状态语义变得混乱。

## 已确认决策：拆成两个命令/API

V0 后端拆成两个命令：

```text
1. 生成创作蓝图
   输入：上传素材、商品标题、卖点、目标人群、风格偏好
   输出：Script / StoryboardShot / improvementHints

2. 一键成片
   输入：scriptId
   输出：GenerationJob
   行为：进入 media_generating，调用 Seedance 图生视频，生成 final_video Asset
```

## 命名口径

`GenerationJob` 在 V0 中优先指成片任务，而不是蓝图生成任务。

推荐 API 形态：

```text
POST /api/creative-blueprints
GET  /api/creative-blueprints/:scriptId

POST /api/creation/jobs
GET  /api/jobs/:jobId
```

其中 `POST /api/creation/jobs` 接收 `scriptId`，不再直接从商品字段开始跑完整链路。

## 对状态机的影响

P0 成片任务状态机：

```text
queued
  -> media_generating
  -> completed

任意阶段 -> failed
```

`script_generating` 不再属于成片任务状态；创作蓝图生成的同步/异步形态另行确认。

## 已确认决策：创作蓝图生成同步返回

已确认：

```text
创作蓝图生成是同步返回，
还是也做异步任务进度？
```

```text
V0 创作蓝图生成同步返回，UI 显示普通 loading；
只有一键成片进入异步成片任务和进度轮询。
```

原因：

- Ark 文本生成比视频生成短，没必要引入第二套任务状态机。
- V0 的“任务进度”主要服务视频生成长任务。
- 同步蓝图命令能显著降低 API、状态管理和恢复逻辑复杂度。

## 已确认决策：创作蓝图立即持久化

已确认：

```text
同步返回的创作蓝图是否立即持久化为 Script / StoryboardShot，
还是只在前端临时保存，到点击一键成片时再落库？
```

```text
立即持久化。
POST /api/creative-blueprints 同步返回时，server 已经创建 Product / Script / StoryboardShot，
并返回 scriptId；POST /api/creation/jobs 只接收 scriptId。
```

原因：

- 第二步“一键成片”需要稳定的 `scriptId`。
- 用户刷新页面或回到蓝图页时不丢失结果。
- trace/debug 可以关联 Ark 输出、repair retry 和最终成片任务。

V0 中 `improvementHints` 可先保存在 `Script.rawJson`，作为 CreativeBlueprint 的一部分；不为它单独建表。

## 下一轮需要继续确认的问题

下一个问题建议讨论：

```text
用户修改结构化字段并重新生成创作蓝图时，
是每次创建新的 Script version，还是覆盖当前 Script？
```

推荐答案：

```text
每次重新生成都创建新的 Script version。
前端默认展示最新版本；一键成片只接收当前确认的 scriptId。
```

原因：

- 保留用户多次尝试的蓝图结果，便于回看和 debug。
- 避免覆盖后成片任务引用的 scriptId 语义变化。
- 版本化可以支撑后续 P1 的对比、trace 和质量诊断。
