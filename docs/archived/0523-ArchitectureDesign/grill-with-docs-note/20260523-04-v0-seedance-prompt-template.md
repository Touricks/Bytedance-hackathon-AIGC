# 2026-05-23 Grill Note：V0 Seedance 图生视频 Prompt 模板

## 审阅状态

已确认。

## 背景

P0 已确认使用真实素材上传，并固定 Seedance 主路径为图生视频。下一个风险是 prompt 过度复杂：如果把 2-4 个 `StoryboardShot` 原样要求模型逐镜头执行，容易造成商品外观漂移、场景跳变或生成不可控。

## 已确认决策：P0 v0 使用保守三段式 prompt 模板

推荐把 `StoryboardShot` 作为叙事灵感，而不是逐镜头渲染指令。v0 Seedance prompt 固定为：

```text
Create a vertical ecommerce product showcase video within 12 seconds,
based on the provided product image as the source of truth.

Keep the product's shape, color, material, logo, packaging, and key details consistent.
Do not invent new product parts, extra brands, or readable text.

0-3s: clean hero shot of the product, centered and well lit, slow push-in.
3-8s: simple use-context or detail close-up showing the key selling point: {sellingPoints}.
8-12s: return to a polished product hero shot with a clear call-to-action feeling.

Visual style: {visualStyle or "clean premium ecommerce, realistic lighting, high trust"}.
Target audience: {audience}.
Camera: smooth, stable, no fast cuts, no crowded background.
```

中文口径：

```text
使用上传商品图作为唯一外观事实源，生成 12 秒以内竖版电商商品展示视频。
保持商品形状、颜色、材质、Logo、包装和关键细节一致，不新增不存在的结构、品牌或可读文字。
0-3 秒：干净明亮的商品 hero 镜头，居中展示，缓慢推进。
3-8 秒：围绕核心卖点展示简单使用场景或细节特写。
8-12 秒：回到商品 hero 镜头，形成明确购买/行动暗示。
整体风格干净、高信任、真实光照、稳定镜头、背景不拥挤。
```

## 不进入 v0 prompt 的内容

- 不要求模型生成准确字幕。
- 不要求模型生成准确口播。
- 不要求复杂多镜头转场。
- 不要求逐个 `StoryboardShot` 一比一还原。
- 不要求 BGM、TTS、字幕烧录。

这些内容仍保留在 `Script` / `StoryboardShot` 结构里，用于前端展示和 P1 合成增强。

## 对代码的影响

`packages/ai/src/prompts/video.prompt.ts` 应从“直接拼接所有 shot”调整为“固定安全模板 + 从 Script 中抽取少量 selling point / visual style / audience”。如果缺少卖点字段，就使用 `Script.narrative` 或第一个 shot 的 `visualPrompt` 作为卖点摘要。

## V0 范围边界

V0 只围绕以下六项交付：

- 商品素材上传。
- 剧本生成。
- 基础分镜。
- 一键成片。
- 任务进度。
- 预览导出。

不把检索、TTS、字幕合成、BGM 合成、数据看板、A/B 对比、复杂分镜编辑、移动端专项优化放进 V0 主路径。

## 已确认流程：两步式主流程

V0 不采用黑盒一键到底，而采用两步式主流程：

```text
上传素材与商品信息
  -> 生成剧本/基础分镜
  -> 用户预览
  -> 点击一键成片
  -> 任务进度
  -> 预览导出
```

Demo 商品可以额外提供快捷路径，但主流程必须让剧本和基础分镜在成片前可见。

## 下一轮需要继续确认的问题

下一个问题建议讨论：

```text
V0 的剧本/基础分镜预览是只读确认，
还是允许用户轻编辑后再成片？
```

推荐答案：

```text
V0 采用只读确认：用户可以返回修改商品信息并重新生成剧本，
但不在 V0 做剧本正文、shot、时长、排序的内联编辑。
```

原因：

- PRD 的“剧本干预”和“分镜级干预”更接近 P1，而不是 V0 必需。
- 只读确认可以证明剧本/分镜生成能力，又不会把状态管理拖复杂。
- 用户想调整方向时，通过修改商品卖点/目标人群/风格偏好重新生成，足够支撑 V0 演示。
