---
name: react-state-form-flow
description: "React state/form flow / React 状态与表单: use for components, hooks, forms, validation, accessibility, loading/error states, and UI behavior changes."
---

# React state and form flow

## Goal

Implement UI behavior that is consistent, accessible, testable, and aligned with backend contracts.

## Correct path

1. Locate existing component patterns:
   - design system components
   - form library and validation schema
   - data fetching/mutation hooks
   - routing and error boundaries
   - test utilities
2. Keep state ownership clear:
   - server state in query/cache layer
   - form state in form layer
   - derived display state computed from canonical data
   - no duplicate business rules in UI
3. Cover visible states:
   - loading
   - empty
   - error
   - success
   - disabled/permission state
4. Preserve accessibility:
   - labels and descriptions
   - keyboard flow
   - focus on modal/error paths
   - ARIA only when semantic HTML is insufficient
5. Test behavior, not implementation details.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Local state mirrors props unnecessarily | State gets stale after prop change | Derive state or reset deliberately |
| Validation differs from API | UI accepts value API rejects, or reverse | Share schema or align with API canonical validation |
| Missing error/loading state | Component only tested happy path | Add visible state handling and tests |
| Accessibility regression | Inputs/buttons lack labels or keyboard path | Add semantic markup and tests/manual checks |
| Business rule in UI only | Backend can bypass rule | Move/check rule in domain/API layer |

## Output contract

Return:

1. Components/hooks changed.
2. State ownership decision.
3. Visible states handled.
4. Accessibility notes.
5. Tests and commands run.
6. Backend contract assumptions.
