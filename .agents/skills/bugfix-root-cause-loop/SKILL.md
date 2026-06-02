---
name: bugfix-root-cause-loop
description: "Bugfix root cause / 缺陷修复: use for production bugs, test failures, regressions, flaky behavior, or user-reported failures where the failure mode and root cause must be proven before editing."
---

# Bugfix root cause loop

## Goal

Fix the real cause with a minimal diff and a regression test. Do not patch symptoms.

## Correct path

1. Capture the symptom:
   - exact error message
   - user action or request
   - expected vs actual behavior
   - environment, input, and version if known
2. Reproduce or localize:
   - failing test, log, stack trace, or deterministic manual path
   - affected files and call path
3. State the current hypothesis and why it fits the evidence.
4. Identify the root cause and the source-of-truth layer.
5. Write or update a regression test that fails before the fix when feasible.
6. Implement the smallest fix.
7. Run targeted verification.
8. For repo bugfixes that touch user-visible behavior, reread the current repo instructions/done definition before final and explicitly state whether API/docs/core updates are needed.
9. Summarize why alternative hypotheses were rejected.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Patching first visible error | No root-cause statement | Stop and trace call path |
| Fix lacks regression test | No test fails before fix or covers symptom | Add targeted regression test or explain why impossible |
| Masking error | Code swallows exception without addressing cause | Preserve observability and fix cause |
| Breaking old behavior | Only new case tested | Add old behavior test or compatibility check |
| Flaky test ignored | Test rerun status not reported | Record flake pattern and next action |

## Output contract

Return:

1. Symptom and reproduction/localization evidence.
2. Root cause.
3. Minimal fix.
4. Regression test.
5. Commands run and results.
6. Remaining uncertainty.
