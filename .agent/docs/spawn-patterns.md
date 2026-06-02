# Codex spawn patterns

Copy these prompts into Codex and customize as needed.

## 1. Full-stack feature

```txt
Use $fullstack-feature-slice.
Spawn repo_mapper to map the current UI/API/domain/data/test path.
Spawn feature_planner to propose the smallest vertical implementation plan.
Wait for both. Reconcile disagreements.
Do not edit until the source of truth and test plan are explicit.
```

Implementation follow-up:

```txt
Implement the approved plan.
Use frontend_worker for UI changes and backend_worker for backend/API/data changes.
Keep the diff minimal. Then spawn test_verifier to add/run targeted checks.
```

## 2. Bug fix

```txt
Use $bugfix-root-cause-loop.
Spawn repo_mapper to trace the failing path and existing tests.
State the symptom, reproduction/localization evidence, root-cause hypothesis, and minimal fix plan before editing.
```

## 3. API contract change

```txt
Use $api-contract-change.
Spawn repo_mapper to identify route/schema/consumer/test locations.
Spawn docs_researcher if framework or external API behavior is version-sensitive.
Classify compatibility before editing.
```

## 4. Security-sensitive change

```txt
Use $security-sensitive-change.
Spawn repo_mapper to map the auth/permission/data path.
Spawn security_reviewer to identify trust boundaries and required negative tests.
Do not implement until the canonical policy/check is known.
```

## 5. Final review

```txt
Use $diff-review-before-merge.
Spawn reviewer to inspect the current diff for correctness, behavior regressions, and missing tests.
If auth/payment/PII/upload/webhook/tenant isolation is touched, also spawn security_reviewer.
If query/render/cache/bundle behavior is touched, also spawn performance_reviewer.
```

## 6. Postmortem to skill

```txt
Use $postmortem-to-skill.
Spawn skill_curator.
Inspect the recent diff, test output, and review notes.
Create a lesson file and patch the smallest relevant skill only if the lesson is repeatable and triggerable.
```
