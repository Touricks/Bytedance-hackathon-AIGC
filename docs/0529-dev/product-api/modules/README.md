# Prompt 模块草稿（claude 版）

按统一格式整理的模块设计文档，交给 prompt 设计同学接手。格式规范见 [_format-suggestions.md](_format-suggestions.md)。

## 模块分类

| 类型 | 模块 | 说明 |
|---|---|---|
| **LLM agent** | material-intake / product-brief / storyboard / shotprompt / image-prompt / video-script / feedback-route | 跑大模型，输出 artifact |
| **同步点（非 LLM）** | image-select / video-select | 纯状态变更，用户挑候选 → 解锁下游 |

## 组装 prompt 的推荐顺序

按上游 → 下游一条龙推进，每一步 approved / selected 后再开下一步：

1. [material-intake.md](material-intake.md) — 识别素材，定 `assets[]` 与 `primaryProductRef`。
2. [product-brief.md](product-brief.md) — 卖点 + 品牌语气，下游所有 prompt 的事实根基。
3. [storyboard.md](storyboard.md) — 分镜，决定 shot 数量与节奏。
4. [shotprompt.md](shotprompt.md) — LLM agent，跨 shot 编排「拍摄任务卡」，重点是 shot 0 建立基准、shot 1+ 继承场景。
5. [image-prompt.md](image-prompt.md) — Per-shot 关键帧：组 prompt + 调 Ark 直接产出 N 张候选；shot N≥1 强制注入前一 shot selected_shot_image 作为 `image_ref` 保场景。
6. [image-select.md](image-select.md) — 同步点：用户挑 1 张关键帧。**所有 shot 都 image-selected 后** 才解锁视频链路。且后一张分镜图的生成工作必须在当前分镜图确认后才能开始。`select 不触发 stale`。
7. [video-script.md](video-script.md) — Per-shot 视频生成：所有 shot 并行（无 inter-shot 依赖，首尾帧来自相邻 shot 的 selected_shot_image）。组 prompt + 调 Seedance 异步 task + 轮询 + 直接产出 M 段候选。
8. [video-select.md](video-select.md) — 同步点：用户挑 1 段视频。所有 shot 都 video-selected 后解锁 final compose。`select 不触发 stale`。

## 关键设计原则速查

- **每个模块的输入只能有**：`workspaceId` + `userDirection` + 路径参数 + 上游 artifact + 后端注入。用户不传 prompt 文本、不勾选素材。
- **LLM agent 都自带「生成 + 产出物」**：image-prompt 直接吐图、video-script 直接吐视频，prompt 文本是 trace。
- **场景一致性**：shot 0 建立基准，shot 1+ 强制继承（image_ref / scene_reference / first_frame+last_frame 三层锚定）。
- **Stale 规则**：select 不触发 stale；只有 re-propose（重新跑生成）才让旧轮次 STALE。视频链路是「拉模式」，final compose 每次按当下选择拼接。
- **合规约束**：「最 / 第一 / 国家级」等绝对化用语由每个 agent 的 system prompt 内置词表保证，不通过 brief 字段携带。
