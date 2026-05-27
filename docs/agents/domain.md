# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root for the project glossary and resolved ambiguities.
- **`README.md`** at the repo root for the current V1 entrypoint and required reading order.
- **`docs/architecture.md`** for the current architecture entrypoint.
- **`docs/arc_v5.md`** for the current implemented V1 workspace architecture.
- **`docs/export/sdd.md`** for the current prompt flow, team responsibilities, and response-format contracts.
- **`docs/plan_0523/current-support/`** for historical demo readiness and real-provider smoke checks.
- **`docs/plan_0523/grill-with-docs-note/`** for confirmed architectural decisions.
- **`docs/adr/`** if it is added later; read ADRs that touch the area you're about to work in.

If any optional file does not exist, proceed silently. Do not suggest creating missing ADR files upfront.

## Layout

This is a single-context repo:

```text
/
├── CONTEXT.md
├── README.md
├── docs/
│   └── plan_0523/
├── apps/
└── packages/
```

## Use the glossary's vocabulary

When output names a domain concept in an issue title, implementation plan, test name, or refactor proposal, use the term as defined in `CONTEXT.md`.

Preferred current V1 terms include:

- 商品素材
- 上传素材
- 素材清点
- 商品 brief
- UGC 分镜
- 视频剧本
- ShotPromptArtifact
- feedbackRoute
- 成片
- 一键成片
- 成片任务
- 兜底样例

Avoid glossary drift such as raw prompt, URL mock, render segment, generated clip, or black-box full pipeline when the domain term is available. V0 terms such as 创作蓝图、草稿蓝图、冻结蓝图 remain valid only when explicitly discussing archived or legacy package code.

## Flag decision conflicts

If output contradicts the README, current architecture docs, or a grill-note decision, surface it explicitly rather than silently overriding it.
