# .agent index

This hidden directory contains framework-owned assets so your product repository can keep its own root-level `docs/`, `prompts/`, and `scripts/` directories without conflicts.

## Contents

- `.agent/docs/`: operating model and spawn/maintenance guidance.
- `.agent/prompts/`: copyable Codex task prompts.
- `bin/`: local helper scripts.
- `notes/lessons/`: correct-path and wrong-path task lessons.
- `notes/evals/`: regression prompts/evals for agent behavior.
- `notes/traces/`: optional local traces; keep sensitive logs out of git.
- `templates/`: optional future templates.

## Standard Codex paths kept at repo root

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `.agents/skills/*/SKILL.md`
