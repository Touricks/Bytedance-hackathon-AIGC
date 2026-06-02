# Sources checked while creating this framework

These are source notes for maintainers. They are not loaded automatically by Codex unless referenced.

- Codex custom agents are standalone TOML files under `~/.codex/agents/` or `.codex/agents/`. Required fields are `name`, `description`, and `developer_instructions`. Optional config-like fields include `model`, `model_reasoning_effort`, `sandbox_mode`, MCP servers, and skill config.
- Codex repo skills are directories under `.agents/skills/<skill>/SKILL.md`. Each `SKILL.md` requires frontmatter with `name` and `description`.
- Codex discovers `AGENTS.md` before work and layers global, repo, and nested directory guidance.

Primary docs:

- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/learn/best-practices
