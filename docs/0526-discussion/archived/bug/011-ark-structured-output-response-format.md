# Bug 011: Ark 结构化输出 response_format 未接入

## Summary

当前 V1 real builder 调用 Ark text provider 时没有使用火山方舟 Chat API 的 `response_format` 结构化输出能力，仍主要依赖 prompt 文案要求模型 “Return strict JSON”。这会让模型返回 JSON 但不严格满足 runtime schema，例如 Bug 010 中 UGC 分镜的 `purpose` 枚举漂移与 `productAssetRef` 为空。

该问题先进入 bugs backlog，等待下一批次与 real provider 输出稳定性问题一起处理。

## Current Behavior

- `generateTextWithArk` 目前只传：
  - `model`
  - `messages`
  - `temperature`
  - `top_p`
- 四个 Ark text builder 仍依赖 prompt 文案要求模型返回 JSON：
  - material intake
  - product brief
  - storyboard
  - shotprompt
- 当前 provider 请求体没有 `response_format`。
- 当前 schema 稳定性主要依赖后置 Zod parse，以及个别 workflow 的 repair。

## Bug

- 缺少 provider-native structured output，导致 real provider 输出容易发生 schema 漂移。
- prompt 中的 “Return strict JSON” 只能提高概率，不能约束字段 enum、必填字段、数组元素结构。
- 当前错误会在后端 parse 阶段才暴露，并可能把完整 Zod issue JSON 直接显示给前端用户。

## Target Solution

- Provider 层新增 `responseFormat` option。
- Ark Chat Completions 请求体透传：

```ts
response_format: {
  type: "json_schema",
  json_schema: {
    name,
    description,
    schema,
    strict: true
  }
}
```

- 四个 V1 Ark text builder 默认传入 strict JSON Schema：
  - material intake
  - product brief
  - storyboard
  - shotprompt
- 保留 Zod parse 和必要 repair 作为第二道防线。
- Trace 记录 response format 摘要：
  - `responseFormat.type`
  - `responseFormat.name`
  - `responseFormat.strict`
  - schema / contract version
- Trace 不记录完整 JSON Schema，避免日志膨胀。
- 如果 provider 或 endpoint 不支持 `response_format` / `json_schema`，real mode 必须 fail loudly。
- 不静默降级到 mock，也不静默降级到普通 prompt JSON。

## Implementation Notes

- 优先在 provider boundary 实现，不要让每个 workflow 手写 Ark 请求体。
- Contract 层可以先手写四个小而明确的 pipeline output schema，不必引入 `zod-to-json-schema`。
- Storyboard schema 必须明确：
  - `shots[].purpose` enum 为 `hook | benefit | proof | cta`。
  - `shots[].productAssetRef` enum 来自 included material refs。
- Prompt 中仍可保留 JSON shape 说明，但真实结构约束应由 `response_format` 承担。

## Test Plan

### Provider

- `generateTextWithArk` 传入 `responseFormat` 时，请求体包含 `response_format`。
- `response_format.type` 为 `json_schema`。
- `json_schema.strict` 为 `true`。
- trace 中包含 response format 摘要，不包含完整大 schema。
- provider 400 / 不支持 response format 时，错误透传并记录 `provider.failed`。

### Contract / Workflow

- material intake real builder 请求体包含 `response_format`。
- product brief real builder 请求体包含 `response_format`。
- storyboard real builder 请求体包含 `response_format`，且 schema 限定 `purpose` enum。
- shotprompt real builder 请求体包含 `response_format`。
- provider 不支持时 API 返回可读错误，不进入 proposed artifact 状态。

## Assumptions

- V1 默认使用 `json_schema strict`，不是只保证 JSON 可解析的 `json_object`。
- 当前 Ark endpoint 应支持 Chat Completions 的 `response_format`；如实际 endpoint 不支持，系统应 fail loudly。
- `response_format` 只接入 Ark text builders；Seedance 视频生成暂不使用该机制。
- 该文档只记录 backlog 问题与方案，不修改 runtime 代码。
