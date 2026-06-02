---
name: fullstack-feature-slice
description: "Full-stack feature / 全栈功能: use when implementing a vertical product feature or bug fix that touches frontend, API/backend, database, tests, or cross-layer behavior; not for isolated style-only edits."
---

# Full-stack feature slice

## Goal

Implement the smallest safe vertical slice from user-visible behavior to backend/data behavior, with tests proving the contract.

## Inputs

- User-visible behavior or acceptance criteria.
- Existing repo map, if available.
- Constraints: compatibility, migration, rollout, feature flags, security, and performance.

## Correct path

1. Map before editing:
   - UI entry point
   - API route or server action
   - domain service / policy / validation schema
   - data model / migration / external integration
   - tests, fixtures, mocks, and generated types
2. Identify the source of truth:
   - Business rules should live in domain/service/policy/schema layers.
   - UI may display state but must not invent entitlement, permission, billing, or authorization logic.
3. Define a minimal vertical plan:
   - one behavior change
   - one canonical rule location
   - targeted tests
   - migration/rollback notes if data changes
4. Implement the smallest coherent diff.
5. Verify with targeted tests first, then broader checks if the change crosses layers.
6. Review the final diff for unrelated changes.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Rule duplicated in UI and backend | Same condition appears in multiple layers | Move/check rule at canonical domain/policy layer |
| Happy-path-only test | No old behavior or negative case covered | Add regression and edge/negative tests |
| Contract drift | API/schema changed without consumer/test update | Update contract, consumers, generated types, and tests |
| Data change without rollback | Migration has no remediation note | Add rollback/remediation note |
| Broad refactor hides feature | Diff contains unrelated cleanup | Revert unrelated changes |

## Output contract

Return:

1. Files changed and why.
2. Behavior implemented.
3. Tests added/updated.
4. Commands run and results.
5. Remaining risks and follow-ups.

## Good Codex prompt

```txt
Use $fullstack-feature-slice.
Spawn repo_mapper first to identify the source of truth and existing tests.
Then spawn feature_planner to propose the smallest vertical plan.
After approval, implement and ask test_verifier to validate the diff.
```
