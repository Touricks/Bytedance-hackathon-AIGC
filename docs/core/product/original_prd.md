# Original Product Source Index

Status: Accepted
Owner: Project team
Last Updated: 2026-06-20
Applies To: Product intent and migration traceability
Depends On: `CONTEXT.md`, `docs/self-use/core_v0/`, current code
Blocks: Scope claims that cannot be traced to source material
Decision State: Accepted

## 1. Source Assets

This repository does not currently expose a single active PRD file under `docs/core/`. The migrated source set for this architecture package is:

| Source | Role | Migration decision |
|---|---|---|
| `CONTEXT.md` | Canonical business language | Accepted source for naming and product semantics. |
| `docs/self-use/core_v0/arc_v3.md` | Legacy target architecture | Migrated into architecture, runtime, backend, frontend, agent, testing, and implementation docs. |
| `docs/self-use/core_v0/interface.md` | Legacy HTTP contract | Migrated into `contracts/interface.md` and `contracts/openapi.yaml`, corrected against current server routes. |
| `docs/self-use/core_v0/openapi.yaml` | Legacy machine contract | Migrated into `contracts/openapi.yaml`, corrected for current four-factor schema and active routes. |
| `docs/self-use/core_v0/prompt_artifact.md` | Legacy prompt/data artifact contract | Migrated into `architecture/data_model.md` and `architecture/agent.md`. |
| `docs/self-use/core_v0/prompt_workflow.md` | Legacy prompt assembly workflow | Migrated into `architecture/agent.md` and `architecture/runtime_flow.md`. |
| `docs/self-use/core_v0/factor_artifact.md` | Legacy factor artifact design | Migrated into `architecture/data_model.md`, corrected to current `productCategory/dealType/audience/strategy` schema. |
| `docs/self-use/core_v0/erd.md` | Legacy ERD | Migrated into `architecture/erd.md`, corrected against `apps/server/src/db/schema/schema.sql`. |

## 2. Current Product Statement

The product is a merchant-facing AIGC commerce video generation workspace. Merchants review structured creative artifacts, choose generated per-shot image and video candidates, compose a final video, and carry generation attribution into data dashboard and campaign publication records.

## 3. Source-of-Truth Rule

Use this file only to identify source provenance. The source of truth for future design and implementation is the canonical project-docs root at `docs/`, not this deprecated compatibility package.
