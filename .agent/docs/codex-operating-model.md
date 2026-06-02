# Codex operating model

## Three layers

```txt
AGENTS.md        -> stable project facts and working agreements
.codex/agents    -> isolated roles for exploration, implementation, review, verification
.agents/skills   -> repeatable workflows with triggers, guardrails, and output contracts
```

## Why Codex-first

Codex reads project guidance from `AGENTS.md`, project custom agents from `.codex/agents/*.toml`, and repo skills from `.agents/skills`. This framework keeps those paths first-class and avoids requiring another agent runtime.

## Recommended session loop

1. Start in Codex from repo root.
2. Use a skill by name when the task type is known.
3. Spawn read-only agents for exploration and review.
4. Let one implementation worker make the diff.
5. Ask `test_verifier` to prove behavior.
6. Ask `reviewer` and, if needed, `security_reviewer` or `performance_reviewer` to review.
7. Use `$postmortem-to-skill` when the session produced a repeatable lesson.

## Agent boundaries

| Agent | Default permission | Main value |
|---|---|---|
| repo_mapper | read-only | Prevents editing the wrong layer |
| feature_planner | read-only | Turns fuzzy work into an implementable slice |
| frontend_worker | workspace-write | UI implementation |
| backend_worker | workspace-write | API/domain/data implementation |
| test_verifier | workspace-write | Regression tests and verification |
| reviewer | read-only | Correctness and regression review |
| security_reviewer | read-only | Trust boundary and abuse-path review |
| performance_reviewer | read-only | Bottleneck and measurement review |
| docs_researcher | read-only | Version-sensitive API/framework checks |
| skill_curator | workspace-write | Lesson extraction and skill maintenance |

## Common anti-patterns

- Installing too many agents and letting routing become random.
- Encoding project facts inside agent prompts instead of `AGENTS.md`.
- Putting long incident stories directly in `SKILL.md`.
- Giving review agents write permissions.
- Treating skills as motivational text instead of executable workflow.
