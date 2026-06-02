# Full-stack feature prompt

```txt
Use $fullstack-feature-slice.

Task:
<describe behavior and acceptance criteria>

Constraints:
<compatibility, migration, rollout, security, performance, non-goals>

Workflow:
1. Spawn repo_mapper to map UI/API/domain/data/test paths.
2. Spawn feature_planner to create the smallest vertical plan.
3. Wait for both and reconcile disagreements.
4. Do not edit until source of truth and test plan are explicit.
5. After plan approval, implement the smallest safe diff.
6. Spawn test_verifier to validate.
7. Spawn reviewer for final diff review.
```
