---
name: postmortem-to-skill
description: "Postmortem to skill / 复盘沉淀: use after completed tasks, repeated mistakes, review findings, failed tests, or high-value correct paths to convert observable traces into reusable skills."
---

# Postmortem to skill

## Goal

Convert real engineering experience into small reusable skills without bloating prompts or recording private chain-of-thought.

## Key distinction

Summarize observable engineering traces, not private reasoning.

Observable traces include:

- task request and acceptance criteria
- files and symbols touched
- commands run and outputs
- failing tests, logs, and error messages
- diff shape and review comments
- wrong assumption and how it was detected
- final fix and verification

Do not record private chain-of-thought. Do not write vague advice.

## Four-step compression

### 1. Capture lesson

Create `.agent/notes/lessons/YYYY-MM-DD-short-title.md` using the template.

Capture:

```txt
Task class -> correct path -> wrong path -> detection -> repair -> prevention
```

### 2. Classify target

| Lesson type | Destination |
|---|---|
| Stable repo fact | `AGENTS.md` |
| Repeatable workflow | `.agents/skills/<skill>/SKILL.md` |
| Role-specific behavior | `.codex/agents/<agent>.toml` |
| One-off note | `.agent/notes/lessons/` only |
| Regression prompt/eval | `.agent/notes/evals/` |

### 3. Patch minimally

Only add a rule when it is:

- repeatable
- high-cost or common
- triggerable from future tasks
- verifiable by command, checklist, or review pattern

Prefer patching an existing skill over creating a new skill.

### 4. Add eval/check

When the lesson should prevent future regressions, create an eval case with:

- setup
- prompt
- expected good behavior
- expected bad behavior
- verification signal

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Generic advice added | Skill says “be careful” or “write clean code” | Replace with trigger + guard + verification |
| One-off detail becomes global rule | Rule only applied once and low cost | Keep in lesson only |
| Skill grows too long | SKILL.md contains long incident story | Move story to references and keep actionable steps |
| Wrong destination | Project fact in skill or workflow in AGENTS.md | Reclassify |
| No verification | Rule cannot be tested or checked | Add checklist/eval or remove |

## Output contract

Return:

1. Lesson file path.
2. Correct path extracted.
3. Wrong path extracted.
4. Skill/AGENTS/agent patch proposed or applied.
5. Eval/check added or reason not needed.
