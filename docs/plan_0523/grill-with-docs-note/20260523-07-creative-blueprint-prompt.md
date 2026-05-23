# 2026-05-23 Grill Note：V0 创作蓝图 Prompt 设计

## 审阅状态

已确认。

## 背景

V0 已确认用户不直接编辑图生视频 prompt，但用户需要理解生成方案，并在视频质量不理想时知道应该修改哪些结构化字段。因此，第一步的 Ark 文本模型不应只生成“剧本文案”，而应生成一个用户可读的创作蓝图。

## 推荐决策：创作蓝图采用结构化 JSON 输出

V0 的创作蓝图 prompt 应要求 Ark 输出严格 JSON，而不是自由文本。推荐输出结构：

```json
{
  "narrative": "12 秒视频的叙事主线",
  "visualStyle": "视觉风格",
  "targetAudience": "目标人群复述",
  "coreSellingPoint": "本次视频只主打的一个核心卖点",
  "shots": [
    {
      "index": 1,
      "durationSec": 3,
      "purpose": "hook | benefit | cta",
      "visualPrompt": "用户可读画面描述",
      "cameraMotion": "镜头运动",
      "voiceover": "口播文案",
      "subtitle": "字幕文案"
    }
  ],
  "renderBrief": {
    "productConsistencyRules": ["保持商品颜色/形状/包装一致"],
    "avoid": ["不要生成不存在的品牌文字", "不要改变商品结构"],
    "videoPromptSummary": "给系统内部渲染 prompt 使用的简短摘要"
  },
  "improvementHints": [
    {
      "ifVideoLooksBad": "商品不像原图",
      "suggestedUserAction": "上传更清晰的正面商品图，或减少风格偏好中的场景词",
      "fieldsToChange": ["productImage", "stylePreference"]
    }
  ]
}
```

## Prompt 结构

推荐使用三段式 text prompt：

```text
Role:
You are an ecommerce short-video creative planner. You create a merchant-readable creative blueprint, not a final video-rendering prompt.

Inputs:
Product title: {title}
Selling points: {sellingPoints}
Target audience: {audience}
Style preference: {stylePreference}
Uploaded image context: The product image is the visual source of truth for final image-to-video generation.

Task:
Create a 12-second ecommerce video creative blueprint with 2-4 storyboard shots.
Pick exactly one core selling point for V0 to keep the video stable.
Use simple scenes and stable camera motion.
Do not promise exact subtitles, exact TTS, complex transitions, or per-shot rendering.
Include improvement hints that tell the merchant which structured UI field to change if the video result is poor.

Output:
Return strict JSON matching the schema. Do not include markdown.
```

## 用户可见与系统内部的边界

用户可见：

- narrative
- visualStyle
- coreSellingPoint
- shots
- improvementHints

系统内部可用但默认不突出展示：

- renderBrief
- videoPromptSummary
- productConsistencyRules
- avoid

不展示：

- 最终 Seedance image-to-video prompt。
- raw model prompt。
- repair retry prompt。

## 已确认决策：improvementHints 驱动结构化字段引导

创作蓝图包含 `improvementHints`，但只用于引导用户修改结构化字段，不自动修改用户输入，也不暴露 raw prompt。

推荐字段形态：

```json
{
  "ifVideoLooksBad": "商品不像原图",
  "suggestedUserAction": "上传更清晰的正面商品图，或减少风格偏好中的场景词",
  "fieldsToChange": ["productImage", "stylePreference"]
}
```

`fieldsToChange` 使用前端可执行枚举，而不是自然语言字段名。V0 可用枚举：

```text
productImage
title
sellingPoints
audience
stylePreference
```

UI 行为：

```text
用户点击“商品不像原图”等问题按钮；
UI 展示 suggestedUserAction；
UI 滚动、展开或高亮 fieldsToChange 指向的输入框；
用户手动修改字段；
用户重新生成创作蓝图或重新成片。
```

V0 不做：

- 自动修改字段。
- 展示 Seedance prompt。
- 展示 raw model prompt。
- 让用户直接编辑 prompt。

## 已确认决策：后端拆成两个命令/API

已确认：

```text
两步式流程在后端是否拆成两个命令/API，
还是保留单个 GenerationJob，但在剧本生成后中途暂停等待用户确认？
```

```text
拆成两个命令：
1. 生成创作蓝图：返回 Script / StoryboardShot / improvementHints。
2. 一键成片：接收 scriptId，进入 media_generating 并生成 final video。
```

原因：

- 这和用户看到的两步式流程一致。
- 避免一个 job 同时表示“蓝图生成中”和“成片生成中”。
- `improvementHints` 可以自然绑定在创作蓝图阶段，而不是成片任务阶段。

下一轮需要继续确认：

```text
创作蓝图生成是同步返回，
还是也做异步任务进度？
```

推荐答案：

```text
V0 创作蓝图生成同步返回，UI 显示普通 loading；
只有一键成片进入异步成片任务和进度轮询。
```

原因：

- Ark 文本生成比视频生成短，没必要引入第二套任务状态机。
- V0 的“任务进度”主要服务视频生成长任务。
- 同步蓝图命令能显著降低 API、状态管理和恢复逻辑复杂度。
