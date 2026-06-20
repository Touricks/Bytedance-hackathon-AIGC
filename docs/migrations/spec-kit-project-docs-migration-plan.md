# Spec Kit Project Docs Migration Plan

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Project documentation migration from legacy core docs to Spec Kit project docs
Depends On: `AGENTS.md`, `CLAUDE.md`, current code
Blocks: Treating the new project-docs package as complete before migration coverage is checked
Decision State: Proposed

## Summary

Migrate project documentation from the legacy core package into an independent Spec Kit style `project-docs` structure. The canonical root is `docs/`; the legacy core package is evidence and temporary compatibility only.

The migration is not a folder rename. It checks migration size, fills missing surfaces, corrects contract placement, and adds validation so future agents know which documents to update.

## Migration Surface

| Surface | New artifact | Status | Evidence |
|---|---|---|---|
| Docs entrypoint | `docs/README.md` | Draft | Repo structure, README, current docs. |
| Ownership | `docs/ownership/team-ownership.md` | Draft | `AGENTS.md`, package layout, controllers, adapters. |
| Change policy | `docs/ownership/change-policy.md` | Draft | User preferences, package scripts, validation commands. |
| Module map | `docs/architecture/module-map.md` | Draft | `apps/*`, `packages/*`, server module layout. |
| Runtime flow | `docs/architecture/runtime-flow.md` | Draft | Workspace, shot, generation, dashboard services. |
| HTTP API | `docs/contracts/openapi.yaml` | Accepted | Migrated machine contract plus contract check. |
| Interface contract | `docs/contracts/interface.md` | Accepted | Fastify controllers and web API adapters. |
| Contract mapping | `docs/contracts/contract-mapping.md` | Accepted | Frontend/backend/schema/test mapping. |
| State machine | `docs/contracts/state-machine.md` | Draft | DB enums, `shot.state.ts`, job and batch tests. |
| Persistence boundary | `docs/data/persistence-boundary.md` | Draft | DB schema, storage adapters, repositories. |
| Frontend governance | `docs/frontend/ui-governance.md` | Draft | React workbench/data dashboard code and tests. |
| AI/eval boundary | `docs/ai/retrieval-eval-boundary.md` | Draft | Provider clients, prompt modules, trace and eval tests. |
| Demo/eval plan | `docs/eval/demo-eval-plan.md` | Draft | Package scripts, provider probes, Playwright/API tests. |
| Decision record | `docs/decisions/ADR-0001-project-docs-ownership.md` | Proposed | This migration decision. |

## Execution Stages

1. Establish the new docs root, ADR, and `.gitignore` allow-list.
2. Move OpenAPI/interface/mapping/Postman assets into `docs/contracts/`.
3. Add missing project-docs surfaces with Draft/Proposed status where the repository has no accepted owner contract yet.
4. Point README and local agent constitutions at `docs/`.
5. Add `pnpm docs:check` and move `pnpm contract:frontend-backend` to the new OpenAPI path.
6. Later, when the new docs have enough review history, plan a separate deprecation or removal of the legacy compatibility package.

## Acceptance

- New agents can start from `docs/README.md`.
- `docs/contracts/openapi.yaml` is the canonical OpenAPI file.
- The legacy core package receives no new canonical content.
- `pnpm docs:check`, `pnpm contract:frontend-backend`, and `git diff --check` pass.
