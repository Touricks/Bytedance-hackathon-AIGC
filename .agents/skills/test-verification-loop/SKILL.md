---
name: test-verification-loop
description: "Verification loop / 测试验证: use before marking work done, after implementation, after bugfixes, or when choosing the right unit/integration/e2e/lint/typecheck commands."
---

# Test verification loop

## Goal

Verify the behavior with the narrowest sufficient checks and report the results honestly.

## Correct path

1. Identify the behavior contract.
2. Choose the right verification layer:
   - unit for pure logic
   - integration for service/API/data behavior
   - component for UI interactions
   - e2e for cross-boundary critical user flows
   - typecheck/lint/build for structural safety
3. Run targeted checks first.
4. If the change crosses layers, run one broader check.
5. Record exact command, result, and failure output summary.
6. If a test cannot be run, explain why and give the exact command for the user.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Claims verified without command | No command/result in final answer | Run or clearly mark not run |
| Only lint run for behavior change | No behavior-level test | Add/run behavior test |
| Snapshot churn | Large snapshot update without assertion rationale | Replace with behavior assertions if possible |
| Flake hidden | Reruns not disclosed | Report rerun count and flake evidence |
| Broad suite hides targeted failure | No narrow test identified | Add or run targeted command first |

## Output contract

Return:

1. Contract verified.
2. Tests added/updated.
3. Commands run exactly.
4. Results.
5. Failures and next actions.
6. Remaining coverage gaps.
