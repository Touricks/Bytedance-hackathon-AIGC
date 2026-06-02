# Optional Claude compatibility

This framework is Codex-first.

If you also use Claude Code:

- Mirror `.agents/skills/<skill>/SKILL.md` into `.claude/skills/<skill>/SKILL.md`, or use symlinks if your platform supports them.
- Translate `.codex/agents/*.toml` into `.claude/agents/*.md` with YAML frontmatter.
- Keep `AGENTS.md` as the shared project constitution.
- Avoid maintaining two manually edited copies of the same skill.

Suggested rule:

```txt
Codex owns canonical skills in .agents/skills. Claude mirrors are generated or symlinked.
```
