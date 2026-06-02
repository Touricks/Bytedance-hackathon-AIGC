---
name: repo-map-before-change
description: "Codebase mapping / 代码地图: use before unfamiliar edits, cross-layer changes, refactors, bugfixes, or risky implementation to trace files, symbols, tests, and source of truth before modifying code."
---

# Repo map before change

## Goal

Build an evidence-backed map of the relevant code path before editing. This prevents the common failure mode where the agent patches the first visible file but misses the true source of truth.

## When to use

Use this skill when:

- The task touches unfamiliar code.
- A change may cross UI, API, domain, data, jobs, or external integrations.
- The user reports a bug but the root cause is not proven.
- A refactor could affect hidden callers.
- A reviewer asks for source-of-truth or coverage evidence.

Do not use for isolated typos, comments, or mechanical formatting.

## Correct path

1. Restate the behavior, request, or symptom.
2. Find entry points with targeted search:
   - frontend routes/components/hooks
   - API routes/controllers/server actions
   - domain services/policies/schemas
   - database models/migrations/queries
   - background jobs/webhooks/events
   - tests/fixtures/mocks
3. Trace one real execution path end to end.
4. Identify the source of truth for business rules.
5. Identify duplicated logic and stale assumptions.
6. List existing tests and missing coverage.
7. Recommend the smallest next action and the best skill/agent to use.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Editing before mapping | No file/symbol map exists | Stop and map first |
| Patching UI-only logic for backend behavior | Same rule appears in UI and API | Move/check rule at domain or policy layer |
| Missing hidden callers | Only one entry point searched | Search call sites and tests |
| Assuming source of truth | No owner service/schema identified | Locate canonical service/schema/policy |
| Over-scanning | Huge unrelated file list | Narrow to user behavior and call path |

## Output contract

Return:

1. Behavior or symptom mapped.
2. Relevant files and symbols.
3. Execution path / data flow.
4. Source of truth and duplicated logic risks.
5. Existing tests and coverage gaps.
6. Recommended next step, agent, and skill.
