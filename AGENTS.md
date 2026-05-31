## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Touricks/Bytedance-hackathon-AIGC`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the canonical triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain layout rooted at `CONTEXT.md`. See `docs/agents/domain.md`.

### Storage cleanup

Before a new version test run, prefer the one-shot reset:

```sh
pnpm reset:dev -- --yes
```

It stops current `SERVER_PORT` / `WEB_PORT` listeners, clears Postgres business tables, clears BullMQ `generation` / `generation_v2` Redis queues, then starts `pnpm dev`.

IMPORTANT: This do not delete workspace file in test folder. ({testDir}/.daireel/), which may cause some problems when implementing second tests. Delete them by yourself when needed.

For cleanup without restarting dev:

```sh
pnpm reset:dev -- --yes --no-dev
```

The reset does not delete workspace `.daireel/trace/events.jsonl`, deprecated repo-local `storage/trace`, `storage/uploads`, or MinIO content.

### Codex worktree creation

When creating a new Codex worktree, create a fresh branch from the local `main` branch instead of checking out `main` directly. Use `dev_{timestamp}` as the branch name format, for example `dev_20260530143000`.

Use the local `main` ref as the source of truth for the new worktree, not `origin/main`, so the new worktree is a copy of the current local main state:

```sh
git worktree add -b dev_$(date +%Y%m%d%H%M%S) <worktree-path> main
```
### Reference

When context is compacted or a new agent joins, use these files to regain the project center before making backend or provider changes:

- `docs/reference/`: authoritative model/provider API references and examples. Use this for Ark text/image and Seedance video request/response shapes before changing provider calls.
- `docs/core/`: current target API contract. 
- `CONTEXT.md`: canonical domain language. Use these terms in new docs, issues, comments, and API explanations.

### User preference

- 当用户提到后端架构更新时，同时检查后端开发计划（backend-development-plan.md）以及契约文档(openapi.yaml),测试文档(postman-test-plan.md)并更新
- 更新时，不需要考虑向后兼容
