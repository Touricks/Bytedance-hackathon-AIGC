# Change Policy

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Documentation and implementation change routing
Depends On: `docs/ownership/team-ownership.md`, `package.json`
Blocks: Implementation changes that bypass affected contracts
Decision State: Proposed

## Policy

Implementation changes must update the canonical docs when they change user-visible workflow, HTTP API, state names, persistence, storage, frontend view models, AI/provider behavior, or acceptance gates.

## Required Checks

| Change type | Required docs | Required validation |
|---|---|---|
| HTTP route, body, response, or error shape | `docs/contracts/openapi.yaml`, `docs/contracts/interface.md`, `docs/contracts/contract-mapping.md` | `pnpm contract:frontend-backend` |
| Workflow state or async job behavior | `docs/contracts/state-machine.md` | targeted server/web tests |
| Database, storage, queue, or retention boundary | `docs/data/persistence-boundary.md` | server tests or migration checks |
| Frontend flow, buttons, polling, or status presentation | `docs/frontend/ui-governance.md` | web tests or Playwright scenario |
| Prompt, provider, trace, or eval behavior | `docs/ai/retrieval-eval-boundary.md`, `docs/eval/demo-eval-plan.md` | targeted AI/provider/eval tests |

## Compatibility Rule

During migration, update legacy compatibility copies only when needed to keep existing tools or agents working. Do not write new canonical decisions into the compatibility area.
