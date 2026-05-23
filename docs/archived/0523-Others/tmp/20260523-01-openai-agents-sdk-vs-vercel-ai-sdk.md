# 2026-05-23 单轮讨论：OpenAI Agents SDK vs Vercel AI SDK Core

## 用户观点

我们使用的模型接口都是 OpenAI-compatible。相比 Vercel AI SDK Core，是否使用 OpenAI Agents SDK 会更适合做 trace？

参考链接：https://developers.openai.com/api/docs/libraries?language=javascript

## 结论

如果优先目标是 **trace / observability / 后续 Agent 编排**，OpenAI Agents SDK 的确比 Vercel AI SDK Core 更值得考虑；但不建议把它直接变成全系统架构核心。更稳的做法是：

```text
packages/ai 对外仍暴露当前窄接口
内部增加可替换 runtime:
  - openai-agents runtime：用于需要 trace 的脚本/分镜 workflow
  - lightweight ark runtime：作为 OpenAI-compatible fallback
```

也就是说，采用 Agents SDK 应该是 `packages/ai` 内部实现选择，而不是改变 `apps/server`、job processors、业务模块边界。

## 判断依据

OpenAI 官方 SDK 页面把官方 SDK 定位为普通应用调用 OpenAI API，把 Agents SDK 定位为 orchestration 场景。Agents SDK quickstart 展示的核心抽象是 `Agent` 和 `run`，并强调后续可以逐步增加 tools 和 specialist agents。

Agents SDK 官方 observability 文档明确说明 tracing 是内建能力，正常 server-side SDK 路径默认启用，并能记录 model calls、tool calls、handoffs、guardrails 和 custom spans，还能用 `withTrace` 把多次 run 包到同一个 trace 中。这一点确实比 Vercel AI SDK Core 更贴合“生成链路可解释”和“答辩展示 trace”的诉求。

但 OpenAI 官方 models/providers 文档也强调，多数应用应保持模型和 transport 简单：默认使用标准 OpenAI provider path；非 OpenAI 或 mixed-provider stack 才需要 provider/adapter surface。我们当前使用的是火山 Ark 的 OpenAI-compatible 接口，不等于天然就是 OpenAI 官方 provider path，因此需要先验证 Agents SDK 对 Ark baseURL/API key/model id 的 provider 配置是否稳定。

## 对当前项目的建议

推荐把 `report_zh.md` 中“AI SDK Core 是结构化输出捷径”的建议修正为：

```text
P0/P1: 优先评估 OpenAI Agents SDK
原因: trace 能力更直接服务 demo、debug、答辩和后续 Agent 编排
约束: 只能封装在 packages/ai 内部，不能侵入业务模块
兜底: 若 Ark provider/adapter 接入不顺，退回 lightweight Ark client + Zod validation + 自有 trace
```

具体架构落点：

```text
packages/ai/src/
├── runtimes/
│   ├── openai-agents.runtime.ts
│   └── ark-compatible.runtime.ts
├── tracing/
│   ├── trace-context.ts
│   └── generation-trace.ts
├── workflows/
│   ├── generate-script.workflow.ts
│   └── generate-video-prompt.workflow.ts
└── providers/
    └── seedance-video.provider.ts
```

`apps/server/src/jobs/processors/*` 不应该知道用的是 Vercel AI SDK、OpenAI Agents SDK 还是自写 Ark client，只调用 `packages/ai` 的稳定 workflow 函数。

## 推荐取舍

采用 OpenAI Agents SDK 的条件：

- Ark 的 OpenAI-compatible provider 能在 Agents SDK 中稳定配置。
- tracing dashboard 能看到关键模型调用或至少能用 custom spans 包住 workflow。
- 结构化输出仍能走 `packages/shared` 的 Zod schema 校验。
- 不引入多 Agent、handoff、工具调用等 P0 不需要的复杂度。

不采用或暂缓的条件：

- Ark provider 接入需要大量 hack。
- tracing 只对 OpenAI 官方模型有效，对 Ark 调用不可见。
- 为了 Agents SDK 改动 `apps/server` 业务模块或 job state machine。
- 结构化输出体验比现有轻量 adapter 更差。

## 当前轮建议

先做一个很小的 spike，而不是直接迁移：

```text
目标: 在 packages/ai 内用 @openai/agents 跑通一次 script generation
输入: Product title + selling points + audience
输出: 符合 generatedScriptSchema 的 JSON
验证:
  1. Ark OpenAI-compatible 配置能否跑通
  2. OpenAI trace dashboard 或 SDK trace 能否看到 run/model call/custom span
  3. zod validation + repair retry 是否容易实现
  4. 与现有 runOneClickVideoWorkflow 的接口是否保持一致
```

如果 spike 通过，OpenAI Agents SDK 成为 `packages/ai` 的首选文本/脚本生成 runtime；Vercel AI SDK Core 暂不引入。  
如果 spike 不通过，保留现有 lightweight Ark adapter，并把 trace 做在我们自己的 `GenerationJob.trace` + Pino structured logs + 后续 Langfuse/OpenTelemetry 上。

## 一句话

OpenAI Agents SDK 更适合做 trace，但只能作为 `packages/ai` 的内部 runtime 引入；当前项目不能为了 trace 把线性的 P0 生成链路改造成重 Agent 架构。
