# Architecture

This is the current architecture entrypoint.

Read:

- [`docs/arc_codex_r4.md`](./arc_codex_r4.md) for the current implemented architecture.
- [`docs/erd.md`](./erd.md) for the current Postgres-backed V0 data model.
- [`docs/plan_0523/current-support/demo-readiness.md`](./plan_0523/current-support/demo-readiness.md) for demo setup and evaluator handoff.
- [`docs/plan_0523/current-support/model-smoke.md`](./plan_0523/current-support/model-smoke.md) for real Ark text and OpenAI fallback dependency smoke checks.
- [`docs/plan_0523/current-support/provider-contract-correction.md`](./plan_0523/current-support/provider-contract-correction.md) for the provider-contract correction history.

Current V0 summary:

```text
apps/web          React + TypeScript merchant workspace
apps/server       Fastify modular monolith with embedded processors
packages/shared   shared DTOs, schemas, job payloads, constants
packages/ai       server-only model providers, prompts, workflows, validation
packages/config   shared tooling config
Postgres          required business fact source
Redis/BullMQ      optional queue transport
```

V0 generates a durable 创作蓝图, freezes it when 一键成片 creates a 成片任务, and uses one Ark-backed Seedance image-to-video call for the final <=12s 成片. Storyboard shots are script structure, not render segments.

The current paid-provider contract is Ark-first:

```text
Primary text model: ARK_API_KEY + ARK_TEXT_ENDPOINT_ID
Primary video model: ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID
Fallback LLM: OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL
```

The fallback LLM is only for 创作蓝图 recovery when the Ark text entry point is unavailable. It is not a video-generation fallback.

Historical planning documents, including Codex r3 and `proposed_architecture.md`, are archived under `docs/archived/`.
