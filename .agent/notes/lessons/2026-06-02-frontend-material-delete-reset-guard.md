# Lesson: frontend material delete reset guard

Date: 2026-06-02
Task class: bugfix
Repo/module: apps/web_latest/src/features/creative-review, apps/web/src/features/creative-review

## Task

Add a guard to the right-side material library delete button after the user has completed "创作要求与上传素材": deleting an uploaded photo should show a confirmation that the flow will return to step one, then return the user to that step after deletion. The goal was to prevent downstream workflow screens from keeping references to a deleted material.

## Observable trace

- Files/symbols involved:
  - `apps/web_latest/src/features/creative-review/CreativeReviewDesk.tsx`: `RightRail`, `deleteMaterial`, `setSelectedStep("requirements")`.
  - `apps/web_latest/src/features/creative-review/reviewFlow.ts`: `materialDeleteResetConfirmMessage`, `shouldResetFlowAfterMaterialDelete`.
  - Mirrored files in `apps/web/src/features/creative-review/` for legacy comparison parity.
- Commands run:
  - `pnpm --filter @aigc-video/web-latest test` -> pass.
  - `pnpm --filter @aigc-video/web test` -> pass.
  - `pnpm --filter @aigc-video/web-latest typecheck` -> pass.
  - `pnpm --filter @aigc-video/web typecheck` -> pass.
  - `git diff --check -- apps/web_latest/src/features/creative-review apps/web/src/features/creative-review` -> pass.
- Test failures or logs:
  - None after fix. `python .agent/bin/new_lesson.py ...` failed because `python` is not installed; rerun with `python3`.
- Review comments:
  - User interrupted before final and asked for `$postmortem-to-skill` plus a reread of `AGENTS.md`.
- Final diff summary:
  - Delete buttons are no longer disabled only because material has entered the review flow.
  - When current prompt requirements exist, delete asks for confirmation: "确定要删除此照片吗？流程将返回第一步。"
  - Confirmed deletion calls the existing delete API, returns UI selection to `requirements`, then refreshes the view model.
  - Added pure helper tests for the reset condition.

## Correct path

```txt
Frontend bugfix -> map the right-rail delete path -> use current workflow state from the view model -> expose a small tested helper for the reset guard -> wire UI confirmation and selected-step reset -> run web_latest tests/typecheck first, then legacy parity if touched -> reread AGENTS done definition before final
```

## Wrong path

| Symptom | Wrong assumption | Detection | Repair | Prevention |
|---|---|---|---|---|
| User could not safely delete material after progressing past step one. | Treating "material approved/current" as a reason to disable deletion was enough to protect the workflow. | `RightRail` showed `disabled={deletingRef === asset.ref || materialApproved}`, so the requested confirmation path could never run. | Remove the workflow-state disable, add confirmation, and return the selected step to `requirements` after a confirmed delete. | For destructive frontend actions, verify whether the button is reachable in the state the user reports before adding new logic. |
| Final response was about to miss repo-specific closeout. | Passing tests is enough to finish the bugfix. | Rereading `AGENTS.md` showed the Done definition and issue-fix preference require files changed, behavior, tests, commands, risks, and a `docs/core` update decision. | Capture this lesson and report the missed AGENTS cues explicitly. | Before final on bugfixes, compare the response against `AGENTS.md` Done definition and user preferences. |
| Scope could drift toward legacy parity as the default. | Because both `apps/web_latest` and `apps/web` exist, both are equally primary. | `AGENTS.md` says the current frontend target is `apps/web_latest`; legacy `apps/web` remains for comparison. | Keep `apps/web_latest` as the completion target and mention any legacy mirroring as secondary. | For frontend work, start and finish from `apps/web_latest` unless the user asks for legacy `apps/web`. |

## Candidate framework update

Classification:

- [ ] AGENTS.md project fact
- [x] Existing skill patch
- [ ] New skill
- [ ] Agent behavior update
- [ ] Eval case
- [ ] One-off note only

Proposed patch:

```txt
Patch `.agents/skills/bugfix-root-cause-loop/SKILL.md` with a repo closeout guard:
after targeted verification, reread the current repo instructions/done definition when the bugfix touches user-visible behavior, then report whether docs/core or API-contract docs need updates.
```

Eval/check:

```txt
The regression is covered by `shouldResetFlowAfterMaterialDelete` tests in both frontend test suites.
No separate eval case is needed unless this pattern repeats across more destructive workflow actions.
```
