# Frontend UI Governance

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: `apps/web` React/Vite frontend
Depends On: `docs/contracts/interface.md`, `docs/contracts/state-machine.md`
Blocks: Frontend changes that drift from API or workflow contracts
Decision State: Proposed

## Rules

- Frontend API access goes through `apps/web/src/lib/api/*`.
- Workbench state should be derived in `apps/web/src/features/workbench/*` and creative-review helpers, not duplicated across components.
- Button disabled states, polling, partial success display, and retry/regenerate affordances must follow contract state rather than local-only guesses.
- Candidate counts are operation parameters, not creative requirement fields.
- UI should preserve user selections and generated candidates unless the user explicitly regenerates or changes a documented workflow boundary.

## Code Evidence

- API adapters: `apps/web/src/lib/api/*`
- Workbench state: `apps/web/src/features/workbench/*`
- Creative review flow: `apps/web/src/features/creative-review/*`
- E2E coverage: `apps/web/e2e/*`

## Validation

Use targeted web unit tests for view-model behavior and Playwright tests when a change affects visible workflow affordances or navigation.
