# 2026-05-23 单轮讨论：AI SDK Core 与官方 OpenAI SDK 的取舍

## 用户疑问

`report_zh.md` 中有一句分阶段建议：

> AI 侧，如果 Node 22 可用，就用 AI SDK Core 做 schema-validated structured outputs；否则，用一层轻量 Ark client 加 Zod validation 和一次 repair retry。

这个表述容易引起误解。用户认为：既然项目使用的是 OpenAI-compatible 接口，为什么不优先使用官方 OpenAI SDK？为什么 Node 22 可用就默认引入 Vercel AI SDK Core？

## 术语澄清

这里的 “AI SDK Core” 不是 “AI SDE Core”，而是 **Vercel AI SDK Core**。

它通常通过 `ai` 包使用，核心能力包括：

- `generateText`
- `streamText`
- `generateObject`
- `streamObject`
- `embed`
- provider abstraction

它的价值不是“比 OpenAI 官方 SDK 更官方”，而是提供一个统一抽象，让同一套 TypeScript API 可以调用 OpenAI、Anthropic、Google、Azure、OpenAI-compatible provider 等不同模型供应商。

## 为什么原句需要修改

原句的问题在于把 “Node 22 可用” 当成是否引入 Vercel AI SDK Core 的主要判断条件。

这不是最合适的判断维度。

对当前项目来说，真正的问题应该是：

1. 我们是否需要多 provider 抽象？
2. 我们是否需要 AI SDK UI / streaming object 的前端生态？
3. 我们是否需要 provider registry / middleware / unified tool calling？
4. 官方 OpenAI SDK 能否直接满足 Ark/OpenAI-compatible 调用、结构化输出和错误处理？
5. 如果需要 trace，是用官方 OpenAI Agents SDK，还是自建 trace？

在当前 P0/P1，项目的 AI 链路并不复杂：

```text
商品信息 / 素材信息
  -> 生成营销脚本 JSON
  -> 生成 Seedance prompt / video task payload
  -> 校验结构
  -> 入库
```

这更像一个受控的 workflow，而不是一个多 provider、多 agent、多 UI streaming 的通用 AI 应用框架。

因此不应该因为 Node 22 可用就默认选择 Vercel AI SDK Core。

## 官方 OpenAI SDK 的优势

如果我们主要使用 OpenAI-compatible endpoint，官方 `openai` SDK 是更自然的第一选择：

- 与 OpenAI API surface 最接近，概念更少。
- 可以配置 `baseURL`、`apiKey`、`model`，适配 Ark 这类 OpenAI-compatible 服务。
- OpenAI 官方结构化输出支持已经包含 Zod helper，例如 Responses API 的 `responses.parse` 和 `zodTextFormat`。
- 对团队来说，排查网络请求、模型参数、错误响应会更直接。
- 不需要引入额外 provider abstraction。

但要注意：**OpenAI-compatible 不等于完整支持 OpenAI 的所有高级行为**。

如果 Ark 只兼容 Chat Completions，而不完整支持 Responses API、strict structured outputs 或某些 schema 参数，那么官方 SDK 的 Zod helper 不一定能原样生效。这个时候仍然需要：

```text
raw model response
  -> JSON parse
  -> Zod validation
  -> one repair retry
  -> normalized domain object
```

也就是说，Zod validation 和 repair loop 仍然应该保留在 `packages/ai`，不能完全交给 SDK。

## Vercel AI SDK Core 什么时候值得引入

Vercel AI SDK Core 不是不能用，而是不应该作为 P0 默认项。

它更适合这些情况：

- 明确需要在 OpenAI、Ark、Anthropic、Gemini、DeepSeek 等多个 provider 之间切换。
- 前端要使用 AI SDK UI 的 streaming hooks。
- 后端要统一 `generateObject` / `streamObject` / tools / middleware。
- 需要 provider registry 或 middleware 包装模型行为。
- 团队希望把模型调用统一在 AI SDK 的 provider abstraction 下。

如果只是 Ark/OpenAI-compatible + 结构化剧本生成，Vercel AI SDK Core 的抽象收益不明显，反而会让调试路径多一层。

## OpenAI Agents SDK 的位置

官方 `openai` SDK 和 `@openai/agents` 也要分清：

- `openai` SDK：普通 API client，适合直接调用模型、结构化输出、embedding、文件等 API。
- `@openai/agents`：Agent/workflow SDK，重点是 agent primitives、tool calls、handoff、guardrails、tracing。

如果我们关心 trace，优先做的是一个小 spike：

```text
packages/ai 内部尝试 @openai/agents
  -> 用 Ark/OpenAI-compatible provider 跑一次 script generation
  -> 验证 trace 能否记录 model call / custom span
  -> 验证结构化输出是否仍能回到 shared Zod schema
```

如果 Agents SDK 对 Ark 接入顺滑，并且 trace 确实可见，那么可以把它作为 `packages/ai` 内部 runtime。

如果不顺滑，就不要为了 trace 改造主流程，而是用官方 `openai` SDK + 自有 `GenerationJob.trace` + Pino structured logs，后续再接 Langfuse/OpenTelemetry。

## 建议修改原句

原句建议改成：

```text
AI 侧，不应以 Node 22 可用作为默认引入 Vercel AI SDK Core 的条件。
P0/P1 先在 packages/ai 中封装窄接口 runtime：
优先使用官方 openai SDK 调用 Ark/OpenAI-compatible endpoint，
输出统一经过 packages/shared 的 Zod schema 校验，并保留一次 repair retry。
同时做一个最小 OpenAI Agents SDK spike，验证 trace 对 Ark 调用是否可用。
只有当项目明确需要多 provider 抽象、streamObject、AI SDK UI 或 provider registry 时，再引入 Vercel AI SDK Core。
```

## 推荐架构落点

```text
packages/ai/src/
├── clients/
│   └── openai-compatible.client.ts       # 官方 openai SDK，配置 Ark baseURL/apiKey/model
├── runtimes/
│   ├── openai-sdk.runtime.ts             # 默认 P0 runtime
│   ├── openai-agents.runtime.ts          # trace spike 通过后启用
│   └── vercel-ai-sdk.runtime.ts          # 仅在确有多 provider / streaming object 需求时增加
├── validation/
│   ├── parse-json.ts
│   ├── zod-validate.ts
│   └── repair-retry.ts
├── tracing/
│   └── generation-trace.ts
└── workflows/
    ├── generate-script.workflow.ts
    └── generate-video-prompt.workflow.ts
```

`apps/server` 不直接依赖任何 SDK，只调用 `packages/ai` 暴露的 workflow。

```text
apps/server job processor
  -> packages/ai generateScript()
  -> packages/ai generateVideoPrompt()
  -> packages/shared schemas
```

## 一句话

Vercel AI SDK Core 是 provider abstraction，不是当前项目的必选 AI runtime；在我们主要使用 Ark/OpenAI-compatible 的前提下，P0 更合理的默认路径是官方 `openai` SDK + Zod validation + repair retry，并用 OpenAI Agents SDK 做 trace spike。

