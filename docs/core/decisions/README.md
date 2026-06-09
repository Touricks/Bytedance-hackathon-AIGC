# Architecture Decisions

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: V3 architecture decisions
Depends On: `docs/core/product/product_scope.md`
Blocks: Implementation that contradicts accepted decisions
Decision State: Accepted

## 1. Accepted Decisions

| Decision | State | Rationale | Acceptance evidence |
|---|---|---|---|
| PostgreSQL is the business fact source; Redis is BullMQ only | Accepted | Avoid split-brain artifact state | `apps/server/src/db/schema/schema.sql`, queue job mirrors |
| Workspace modules use module-owned artifact tables | Accepted | Avoid generic `workspace_artifact` ambiguity | `prompt_requirements_artifacts`, `material_intake_artifacts`, `product_brief_artifacts`, `storyboard_artifacts`, `shot_prompt_artifacts` |
| `propose -> approve` gates downstream reads | Accepted | Merchant review is a product requirement | Workspace module services and endpoints |
| `shotprompt approve` does not rebuild shots | Accepted | Prevent hidden deletion of candidates and selections | `shotSetService.apply` owns shot set creation |
| Upstream drift is warning-only | Accepted | Preserve downstream work after upstream edits | `compareSourceFingerprint` and `upstreamChanged` response fields |
| Per-shot image/video prompts are deterministic server assembly | Accepted | Keep raw provider prompts system-owned and predictable | `apps/server/src/modules/shot/prompt-assembler.ts` |
| Four-factor 创作要求 schema is canonical | Accepted | Current code migrated from old `productType/visualStyle` model | `creativeFactorRequirementsDataSchema` |
| Final compose snapshots 成片创作归因 | Accepted | Dashboard and publication attribution must not depend on mutable current requirements | `final-compose.worker.ts`, dashboard service |

## 2. ADR Policy

Use `ADR-template.md` when changing storage identity, module lifecycle, API shape, provider boundary, security boundary, or data attribution semantics.

