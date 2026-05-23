# 2026-05-23 Grill Note：创作蓝图立即持久化

## 审阅状态

已确认。

## 背景

V0 已确认创作蓝图生成同步返回，且一键成片只接收 `scriptId`。因此需要明确同步返回前，蓝图是否已经落库，还是只在前端临时保存。

## 已确认决策：同步返回前立即持久化

`POST /api/creative-blueprints` 的行为：

```text
输入：上传素材、商品标题、卖点、目标人群、风格偏好
  -> 调 Ark 文本模型生成 CreativeBlueprint
  -> Zod 校验，失败 repair retry，仍失败 fallback
  -> 持久化 Product / Script / StoryboardShot / improvementHints
  -> 同步返回 CreativeBlueprint + scriptId
```

`POST /api/creation/jobs` 的行为：

```text
输入：scriptId
  -> 读取 Script / StoryboardShot / Product / Asset
  -> 创建成片任务 GenerationJob
  -> 调 Seedance 图生视频
```

## 数据口径

V0 不为 `improvementHints` 单独建表。它作为 CreativeBlueprint 的一部分保存在 `Script.rawJson` 中。

关系：

```text
Product 1 -> n Script
Script 1 -> n StoryboardShot
Script 1 -> n GenerationJob
```

## 已确认决策：草稿覆盖，成片后版本化

已确认：

```text
用户修改结构化字段并重新生成创作蓝图时，
是每次创建新的 Script version，还是覆盖当前 Script？
```

```text
视频生成前修改的蓝图采取直接覆盖；
生成后原版本视为只读；
对已用于生成的蓝图再修改时，创建新的 Script version。
```

原因：

- 视频生成前的多次调整属于草稿阶段，覆盖能减少无意义版本。
- 一旦蓝图用于成片，成片任务需要引用稳定且不可变的蓝图。
- 生成后的修改创建新版本，可以支持后续重生成、对比和 trace。

## 推荐实现口径

```text
草稿蓝图：
  Script 未被任何 GenerationJob 使用，允许覆盖 Script / StoryboardShot / rawJson。

冻结蓝图：
  用户点击一键成片并创建 GenerationJob 时冻结当前 scriptId。
  冻结后的 Script / StoryboardShot 只读。

修改冻结蓝图：
  创建新的 Script version 和新的 StoryboardShot；
  前端默认展示新草稿版本；
  一键成片只接收当前确认的 scriptId。
```

## 下一轮需要继续确认的问题

下一个问题建议讨论：

```text
草稿蓝图冻结后，是否允许同一个 scriptId 创建多个成片任务，
还是一个 scriptId 只允许一个成片任务？
```

推荐答案：

```text
允许同一个冻结 scriptId 创建多个成片任务。
```

原因：

- Seedance 可能失败，需要基于同一蓝图重试。
- 同一蓝图多次生成可用于挑选更好的结果。
- GenerationJob 记录每次成片尝试，Script 记录稳定创作方案。
