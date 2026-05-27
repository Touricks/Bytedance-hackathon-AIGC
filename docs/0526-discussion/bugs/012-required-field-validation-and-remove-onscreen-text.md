# Bug 012: 必填字段错误展示与 V1 画面文字字段移除

## Summary

当前前端会把后端 Zod 原始错误直接展示给用户。例如 storyboard 提交时如果 `shots[].onScreenText` 为空，页面会显示整段 JSON 错误：

```text
[{"code":"too_small", ... "path":["data","shots",0,"onScreenText"]}]
```

这不是用户可理解的表单反馈。同时，V1 视频生成不应继续暴露“画面文字建议 / onScreenText”：AIGC 视频模型目前无法稳定生成可读画面文字，容易产出乱码，继续保留该字段会让用户误以为系统承诺可读字幕或贴字。

当前状态：**已修复**。

- Storyboard / ShotPrompt runtime schema 不再要求或传播 `shots[].onScreenText`。
- Storyboard prompt、response_format、deterministic builder、form contract 不再包含 `onScreenText`。
- 前端动态表单基于 `required` 做提交前字段级校验，并在对应字段显示 `此项为必填项`。
- API client 遇到后端 Zod issue JSON 时返回可读错误，不再把原始 issue JSON 原样展示给用户。

## Current Behavior

- 已修复前，前端动态表单可以渲染 `form.fields[].required`，但提交时缺少字段级必填提示。
- 已修复前，后端 schema 仍要求 storyboard `shots[].onScreenText` 非空。
- 已修复前，前端仍在 UGC 分镜表单中渲染 `shots[].onScreenText`，label 为“画面文字建议”。
- 已修复前，后端校验失败时，前端显示全局原始错误，而不是定位到对应字段。

## Bug

- 用户不知道哪个表单项需要补充，只看到开发者向 JSON/Zod 错误。
- `onScreenText` 是不应该交给视频生成模型的字段，V1 保留它会制造产品承诺错位。
- 用户为了通过校验可能输入无意义内容，例如“无”，但该内容仍会污染上游 storyboard / shotprompt prompt。

## Target Solution

- [x] 前端表单：
  - 对 `required: true` 的字段在 label 或 placeholder 中给出必填提示。
  - 提交时执行字段级校验。
  - 用户忽略必填字段时，在对应表单项旁展示 `此项为必填项`。
  - 不再把 Zod issue JSON 原样渲染到全局错误区。

- [x] 后端/API 错误：
  - 保留 schema 校验作为最后防线。
  - 前端先按 form contract 做字段级校验，避免常见必填错误打到后端。
  - 无法映射的错误再作为简短全局错误展示。

- [x] 移除 `onScreenText`：
  - 从 `StoryboardArtifact` schema 中移除 `shots[].onScreenText`。
  - 从 `ShotPromptArtifact` schema 中移除 `shots[].onScreenText`。
  - 从 storyboard prompt、response_format、deterministic builder、form contract、React 表单中移除。
  - ShotPrompt / Seedance 输入中继续明确“不生成画面文字，不要求 readable text”。
  - 历史 artifact 中如果存在 `onScreenText`，读取时兼容忽略，不再向前端或模型传递。

## Test Plan

- [x] 前端：
  - 必填字段为空时，对应字段展示 `此项为必填项`。
  - 全局错误区不显示 Zod issue JSON。
  - UGC 分镜表单不再出现“画面文字建议”。

- [x] 后端 / shared schema：
  - storyboard artifact 不要求 `shots[].onScreenText`。
  - shotprompt artifact 不接受或不传播 `shots[].onScreenText`。
  - response_format 中不存在 `onScreenText`。

验证命令：

```bash
pnpm --filter @aigc-video/server test -- src/modules/workspace/workspace.api.test.ts
pnpm --filter @aigc-video/web test -- src/routes/App.render.test.ts src/lib/api/client.test.ts
pnpm --filter @aigc-video/ai test
```

## Assumptions

- V1 不做画面字幕/贴字。
- 未来如果要字幕，应作为视频后处理字幕层，而不是让 Seedance 直接生成画面文字。
