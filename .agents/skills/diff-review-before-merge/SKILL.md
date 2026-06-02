---
name: diff-review-before-merge
description: "Diff review / 合并前审查: use before accepting a patch or opening a PR to review uncommitted changes for correctness, regressions, security, performance, and test gaps."
---

# Diff review before merge

## Goal

Catch real issues in the final diff before the user accepts or merges it.

## Correct path

1. Inspect the diff, not just the final files.
2. Reconstruct the intended behavior from the task and tests.
3. Review priority:
   - correctness and invariants
   - behavior regressions
   - API/data contract drift
   - security/privacy risk
   - performance risk
   - missing tests
   - maintainability risk with concrete cost
4. Ignore style-only comments unless style hides a bug.
5. For each finding, provide exact file/symbol evidence and a minimal fix.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Reviewing only changed lines misses caller | No call-site check | Trace impacted callers |
| Nits overwhelm real issues | Findings are formatting-only | Drop nits unless they hide bugs |
| Security-sensitive path not escalated | Auth/payment/PII touched | Ask security_reviewer or use security skill |
| Test confidence overstated | Commands not run or failed | Report actual state |
| Unrelated changes accepted | Diff includes cleanup outside task | Recommend revert/split |

## Output contract

Return:

1. Blocking findings by severity.
2. Non-blocking suggestions only if useful.
3. Missing tests.
4. Verification status.
5. Explicit “no blocking findings” if none found.
