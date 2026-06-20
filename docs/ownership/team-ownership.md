# Team Ownership

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Repository ownership and review routing
Depends On: `docs/README.md`, repository layout, `AGENTS.md`
Blocks: Cross-module changes without owner/reviewer routing
Decision State: Proposed

## Ownership Map

| Surface | Primary owner | Evidence paths |
|---|---|---|
| Product and workflow language | Project team | `README.md`, `docs/README.md` |
| Backend API and workers | Backend owner | `apps/server/src/app.ts`, `apps/server/src/modules/**` |
| Frontend workbench and dashboard | Frontend owner | `apps/web/src/**`, `apps/web/e2e/**` |
| Shared domain schemas | Schema owner | `packages/shared/src/**` |
| AI providers and prompt contracts | AI owner | `packages/ai/src/**` |
| Storage and S3 compatibility | Storage owner | `apps/storage/src/**`, `apps/server/src/modules/workspace/storage/**` |
| Docs contracts | Project team | `docs/**`, `scripts/docs-contract-check.mjs` |

## Review Rules

- Cross-boundary changes need at least one reviewer for every affected surface.
- API or schema changes require updates to `docs/contracts/*` and the frontend/backend contract check.
- State, persistence, or storage changes require review against `docs/contracts/state-machine.md` and `docs/data/persistence-boundary.md`.
- AI/provider changes require review against `docs/ai/retrieval-eval-boundary.md` and targeted provider or prompt tests.

## Open Decisions

- Named human owners are not yet recorded in repository docs. Until accepted owners exist, use the surface owner labels above for routing.
