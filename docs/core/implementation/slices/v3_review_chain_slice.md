# V3 Review Chain Slice

Status: Draft
Owner: Engineering
Last Updated: 2026-06-08
Applies To: First implementation slice after docs/core readiness review
Depends On: `../../product/product_scope_v1.md`, `../../architecture/domain_v1.md`, `../../contracts/contract_mapping_v1.md`, `../../testing/test_strategy_v1.md`
Blocks: Scheduling of cross-layer V3 prompt/artifact changes
Decision State: Proposed

## 1. Problem

The repository already implements most of the V3 creative review chain, but
future changes need a small, repeatable slice boundary so docs, API contracts,
schemas, backend services, frontend viewmodels, and tests move together.

## 2. Scope

In:

- One vertical change to a single review module or per-shot generation step.
- Update source-of-truth docs and runtime schemas together.
- Preserve `propose -> approve`, source fingerprints, and non-destructive
  downstream behavior.

Out:

- Production auth and tenant model.
- Full real-provider smoke automation.
- Replacing the hand-written frontend API client.
- Multi-line workspace history UI.

## 3. Module Boundary

| Module | Change |
|---|---|
| `packages/shared` | Runtime schema/invariant changes only when contract shape changes. |
| `packages/ai` | Subject/contract templates and provider response formats for workspace modules. |
| `apps/server/src/modules/workspace` | Workspace module lifecycle and approved/current rules. |
| `apps/server/src/modules/shot` | Per-shot deterministic prompt assembly, rounds, and selections. |
| `apps/web/src/lib/api` | API adapter changes for route/request/response updates. |
| `apps/web/src/features/creative-review` | Merchant-facing state and review UI. |
| `docs/core` | Product/domain/runtime/contract/test docs for the changed behavior. |

## 4. Acceptance Criteria

- [ ] The changed behavior has a single documented source of truth.
- [ ] API docs, OpenAPI, runtime schemas, backend service, frontend adapter, and
      tests are updated when public contract changes.
- [ ] Existing candidates/selections/final outputs are not deleted by upstream
      changes unless a user-confirmed destructive command is explicitly added.
- [ ] Merchant-facing copy uses `CONTEXT.md` terms.
- [ ] Required test commands from `testing/test_strategy_v1.md` are run or
      explicitly reported as not run with reason.

## 5. Tests

- [ ] Targeted shared/AI/server/web unit tests for the changed layer.
- [ ] Contract check for API shape changes.
- [ ] Browser/Playwright evidence for user-visible frontend changes.

## 6. Blockers

- Missing owner for auth/tenant/security choices when exposing beyond local demo.
- Provider behavior changes without `docs/reference/` verification.
- Schema changes that update only UI or only docs without backend/shared
  enforcement.
