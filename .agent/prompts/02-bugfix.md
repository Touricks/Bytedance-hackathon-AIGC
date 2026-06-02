# Bugfix prompt

```txt
Use $bugfix-root-cause-loop.

Bug:
<symptom, logs, failing test, reproduction steps, expected vs actual>

Workflow:
1. Spawn repo_mapper to trace the failing path and tests.
2. State reproduction/localization evidence.
3. State root-cause hypothesis before editing.
4. Add or update a regression test when feasible.
5. Implement the smallest fix.
6. Spawn test_verifier to run targeted checks.
7. Return root cause, fix, tests, commands, and remaining uncertainty.
```
