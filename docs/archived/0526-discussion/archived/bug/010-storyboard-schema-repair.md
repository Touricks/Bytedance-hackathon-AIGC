# Bug 010: UGC 分镜 real provider 输出缺少 schema repair

## Summary

当前工作目录 `/Users/carrick/TestWorkspace/project-aigc/0526v1/` 在生成 UGC 分镜时失败。Trace 显示 Ark provider 已返回 JSON，但返回内容不满足 `StoryboardArtifact` runtime schema，后端直接将 Zod parse 错误冒泡到前端。

该问题先进入 bugs backlog，等待下一批次与 real provider 输出修复能力一起处理。

## Evidence

- Trace file: `/Users/carrick/TestWorkspace/project-aigc/0526v1/.daireel/trace/events.jsonl`
- `storyboard.request_prepared` 正常：line 17。
- `provider.response_received` 正常返回 JSON：line 19。
- `storyboard.parse_failed` 失败：line 20。

## Current Behavior

- `generateStoryboardWithArk` 调用 Ark 后直接执行：

```ts
storyboardArtifactSchema.parse(JSON.parse(rawOutput))
```

- 当前 schema 约束：
  - `shots[].purpose` 必须是 `hook | benefit | proof | cta`。
  - `shots[].productAssetRef` 必须是非空字符串。

- 当前 prompt 只给了一个 JSON shape 示例，但没有强约束：
  - 每个 shot 的 `purpose` 必须只能取 schema enum。
  - 每个 shot 的 `productAssetRef` 必须来自 approved material manifest，且不能留空。

## Bug

Ark 返回的 storyboard JSON 不满足 schema：

- `shots[1].purpose` 返回 `pain point reinforcement`，不在 enum 中。
- `shots[2].purpose` 返回 `core selling point display`，不在 enum 中。
- `shots[3].purpose` 返回 `conversion guide`，不在 enum 中。
- `shots[0].productAssetRef` 和 `shots[1].productAssetRef` 为空字符串。

本例可用素材只有 `display_1.png`，但模型在痛点铺垫镜头里选择留空，导致 `z.string().min(1)` 失败。

## Root Cause

问题不在素材清点或产品概述。Trace 中 material intake 和 product brief 都成功 parsed。

真正原因是：storyboard prompt 契约偏松，而 runtime schema 偏硬；中间没有 repair / normalization 层吸收 real provider 的常见偏差。

## Target Solution

- 强化 storyboard prompt：
  - 明确 `shots[].purpose` 只能取 `hook`、`benefit`、`proof`、`cta`。
  - 明确每个 `shots[].productAssetRef` 必须是 approved material manifest 中的非空 ref。
  - 在只有一个可用素材时，明确所有 shots 使用该 ref。

- 增加 storyboard output repair：
  - 将近义 purpose 映射到 schema enum。
    - `pain point reinforcement` -> `benefit`
    - `product_reveal` -> `benefit`
    - `scenario_verification` -> `proof`
    - `core selling point display` -> `proof`
    - `conversion guide` -> `cta`
  - 对空 `productAssetRef` 使用 material primary ref 或第一个 included asset ref 填补。
  - repair 后再次执行 `storyboardArtifactSchema.parse`。

- Trace 改进：
  - parse 失败时保留 raw provider output。
  - repair 成功时记录 `storyboard.repaired`，包含被修复字段路径与原因。
  - repair 失败时返回更可读业务错误，不直接把完整 Zod JSON 暴露给前端。

## Test Plan

### Backend / AI workflow

- 使用本次 trace 中的 raw storyboard output 做 regression fixture。
- 验证 repair 后：
  - 所有 `purpose` 都在 `hook | benefit | proof | cta` 内。
  - 所有 `productAssetRef` 都非空，且来自 material manifest。
  - `storyboardArtifactSchema.parse` 通过。

- 增加 prompt contract test：
  - prompt 文本包含 purpose enum 限制。
  - prompt 文本包含 productAssetRef 非空且必须来自 material manifest 的限制。

### API

- 在 real provider 返回可 repair 输出时，`/api/workspaces/storyboard/propose` 返回 `200` 且 workspace 进入 `storyboard_proposed`。
- 在无法 repair 输出时，API 返回用户可读错误，不暴露完整 Zod issue JSON。

## Assumptions

- V1 继续保留当前 storyboard schema enum，不扩展为任意自然语言 purpose。
- `productAssetRef` 在 V1 中继续必填；即使镜头是痛点铺垫，也使用 primary asset ref 作为素材锚点。
- Repair 层只修复结构性偏差，不创造新的商品事实或新素材 ref。
