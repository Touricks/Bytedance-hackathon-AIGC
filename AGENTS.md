## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Touricks/Bytedance-hackathon-AIGC`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the canonical triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain layout rooted at `CONTEXT.md`. See `docs/agents/domain.md`.

## System Prompt

This file is the project constitution for Codex. Keep it short, factual, and specific to this AIGC commerce video repository.

### Repository profile

- Product: merchant-facing AIGC commerce video generation. The V3 flow is prompt requirements / creative factors -> material upload -> material intake -> product brief -> storyboard -> shotprompt -> shot set apply -> per-shot image/video candidates -> final compose -> campaign publication tags.
- Package manager: `pnpm@9.15.4` in a pnpm workspace (`apps/*`, `packages/*`) with Turbo tasks.
- Runtime: Node.js 22+, PostgreSQL 16, Redis/BullMQ, local workspace files under `.daireel/`, and ffmpeg for final composition.
- Current frontend target: `apps/web`.
- Default ports: API `3000`, current web `5173`.

### Commands

- Install: `pnpm install`.
- Infra: `docker compose -f infra/docker-compose.yml up -d`.
- Current dev after cleanup: `pnpm reset:dev -- --yes` clears dev ports, Postgres business tables, BullMQ queues, then starts `pnpm dev`.
- Current dev without cleanup: `pnpm dev` starts `@aigc-video/server` and `@aigc-video/web`.
- Full dev: `pnpm dev` starts all workspace dev servers, including the current web app.
- Mode-specific dev: `pnpm dev:real` or `pnpm dev:mock`.
- Build: `pnpm build`.
- Typecheck: `pnpm typecheck`.
- Lint: `pnpm lint`.
- Unit tests: `pnpm --filter @aigc-video/ai test`, `pnpm --filter @aigc-video/server test`, or `pnpm --filter @aigc-video/web test`.
- Frontend/backend contract check: `pnpm contract:frontend-backend`.
- Real-provider probes: `node scripts/verify-provider-image.mjs --json` and `node scripts/verify-provider-video.mjs --image-url <url> --json` call provider endpoints directly for manual diagnosis.
- There is no active official real-provider smoke package script; removed multi-real-model and chain-smoke entries are not kept as guarded stubs.

### Repo layout

```text
apps/server/       # Fastify API, BullMQ worker, Postgres access, file storage, ffmpeg compose
apps/web/          # current React/Vite frontend on 5173
packages/ai/       # provider clients, agents/workflows, prompt assembly, response schemas
packages/shared/   # shared Zod contracts, domain types, job payload types
packages/config/   # shared lint/prettier/typescript config
docs/core/         # authoritative V3 architecture, ERD, interface, OpenAPI, prompt workflow/artifacts
docs/reference/    # provider API references for Ark text/image and Seedance video
docs/reference_frontend/ # Claude design reference for frontend migration
docs/test/         # Postman/Newman and acceptance-test documentation
scripts/           # reset/dev/test/provider orchestration
CONTEXT.md         # canonical business language
```

### Runtime config

- Copy `.env.example` to `.env`; never commit real provider keys, endpoint IDs, credentials, or local secrets.
- Preferred provider env fields are `TEXT_*`, `IMAGE_*`, and `VIDEO_*`. Legacy `ARK_*` aliases may exist in code, but new work should use the explicit per-provider fields.
- Candidate count env names are `DEFAULT_IMAGE_CANDIDATES`, `MAX_IMAGE_CANDIDATES_PER_SHOT`, `DEFAULT_VIDEO_CANDIDATES`, and `MAX_VIDEO_CANDIDATES_PER_SHOT`.
- Queue/provider concurrency is controlled by `GENERATION_WORKER_CONCURRENCY`, `TEXT_PROVIDER_CONCURRENCY`, `IMAGE_PROVIDER_CONCURRENCY`, and `VIDEO_PROVIDER_CONCURRENCY`.

### Product and domain rules

- Use `CONTEXT.md` terms in UI copy, docs, issues, and API explanations. Prefer business language such as 创作审核台, 素材解读, 创作要求, 分镜生成要求, 分镜链路实例, 分镜图选择, 分镜视频选择, and 成片.
- Do not turn engineering terms like `Prompt`, raw provider prompt, mock, artifact console, or system prompt into the primary user-facing language.
- Users edit structured 创作要求 and review/edit generated creative artifacts; they do not edit system prompts or assembled provider prompts.
- `shot_sets` are 分镜链路实例. Approved shotprompt / 分镜生成要求 is the source plan; applying it creates or archives shot-set instances.
- Workspace modules follow `propose -> approve`; downstream reads only approved/current artifacts.
- Upstream changes should surface as `upstreamChanged` warnings, not automatic deletion of downstream candidates, selections, or final outputs.
- For frontend migration, match `docs/reference_frontend/` visual direction first. Do not introduce `window.DR` mocks, do not keep `TweaksPanel`, and do not expand prototype-only engineering labels into main UI copy.

### Source of truth rules

- Before backend, provider, or contract work, read `CONTEXT.md` plus the relevant `docs/core/` files.
- `docs/core/arc_v3.md` is the target architecture; `docs/core/interface.md` and `docs/core/openapi.yaml` are the API contract; `docs/core/prompt_workflow.md` and `docs/core/prompt_artifact.md` describe prompt assembly and persisted prompt facts.
- Use `docs/reference/` before changing Ark text/image or Seedance video request/response handling.
- When API behavior changes, update frontend clients, `docs/core/openapi.yaml`, `docs/core/interface.md` together when applicable.
- When fixing issues, check whether `docs/core/` architecture/interface/prompt-chain files need matching updates.
- Business rules belong in backend services, schemas, shared contracts, and domain docs, not duplicated only in UI.

### Framework asset locations

- Codex standard project guidance: `AGENTS.md`.
- Codex custom agents: `.codex/agents/*.toml`.
- Codex repo skills: source files live in `.agents/skills/*/SKILL.md`; symlinks in `~/.codex/skills/*` enable automatic Codex discovery.
- Framework docs/prompts/scripts/notes: `.agent/`.
- Create a lesson: `python .agent/bin/new_lesson.py "<task title>"`.
- Validate framework: `python .agent/bin/validate_framework.py`.

### Default Codex operating model

- For unfamiliar code, cross-layer changes, bug fixes, or refactors, first map the code path before editing.
- For difficult or ambiguous tasks, produce a plan before implementation.
- Prefer the smallest coherent vertical diff over broad speculative refactors.
- Do not add production dependencies without explaining why existing tools are insufficient.
- Do not change unrelated formatting, generated files, lockfiles, or public APIs unless the task requires it.
- When touching user-visible behavior, update or add tests that prove the behavior.
- When tests cannot be run, state the exact command that should be run and why it was not run.

### Agent usage conventions

Use repo-scoped Codex custom agents from `.codex/agents/`:

- `repo_mapper`: read-only mapping before edits.
- `feature_planner`: read-only planning and task decomposition.
- `frontend_worker`: targeted frontend implementation.
- `backend_worker`: targeted backend/API/data implementation.
- `test_verifier`: tests, repros, and validation.
- `reviewer`: correctness and regression review.
- `security_reviewer`: auth, secrets, PII, payment, upload, webhook, SSRF, injection, and permission review.
- `performance_reviewer`: query, bundle, render, cache, and latency review.
- `docs_researcher`: API/framework documentation verification.
- `skill_curator`: post-task lesson extraction and skill maintenance.

For complex tasks, spawn read-only agents before implementation. Keep worker agents narrow and ask reviewers to review the resulting diff.

### Skill usage conventions

Use repo skills from `.agents/skills/`. They are symlinked into `~/.codex/skills/` for automatic `$skill-name` triggering:

- `$repo-map-before-change` before unfamiliar edits.
- `$fullstack-feature-slice` for vertical product changes.
- `$bugfix-root-cause-loop` for bugs and regressions.
- `$api-contract-change` for public API/schema changes.
- `$db-migration-safe-change` for schema/migration/data backfill work.
- `$react-state-form-flow` for React UI state/forms/components.
- `$test-verification-loop` before considering work done.
- `$security-sensitive-change` for auth/payment/PII/upload/webhook/permission-sensitive changes.
- `$diff-review-before-merge` for final review.
- `$postmortem-to-skill` after repeated mistakes or high-value wins.

### Done definition

A task is not done until the response includes:

1. Files changed and why.
2. User-visible behavior or internal behavior changed.
3. Tests added/updated.
4. Commands run and results.
5. Remaining risks, follow-ups, or things intentionally not changed.

### Post-task learning loop

When the same mistake happens twice, or a correct path saves meaningful time:

1. Create a lesson in `.agent/notes/lessons/`.
2. Classify the lesson as project fact, skill workflow, agent behavior, or one-off note.
3. Patch the smallest relevant `SKILL.md` or `AGENTS.md` section.
4. Add an eval case under `.agent/notes/evals/` if the lesson should be tested later.


## Important shortcut
```sh
pnpm reset:dev -- --yes
```

It stops current `SERVER_PORT` / `WEB_PORT` listeners, clears Postgres business tables, clears BullMQ `generation` / `generation_v2` Redis queues, then starts `pnpm dev`.

IMPORTANT: This does not delete workspace files in test folders (`{testDir}/.daireel/`), which may affect later test runs. Delete them manually when needed.

For cleanup without restarting dev:

```sh
pnpm reset:dev -- --yes --no-dev
```

The reset does not delete workspace `.daireel/trace/events.jsonl`, deprecated repo-local `storage/trace`, `storage/uploads`, or MinIO content.

### Real-provider probe policy

There is no active official real-provider smoke automation in package scripts. `scripts/` only keeps direct provider probes for manual diagnosis:

```sh
node scripts/verify-provider-image.mjs --json
node scripts/verify-provider-video.mjs --image-url <url> --json
```

These probes do not exercise workspace state, queues, DB writes, asset persistence, selection, or final compose. Full agent-chain, chain smoke, multi-shot parallel, final-compose, and frontend real-provider E2E are intentionally not present as active scripts to avoid multi-real-model联调.

## Reference

When context is compacted or a new agent joins, use these files to regain the project center before making backend or provider changes:

- `docs/reference/`: authoritative model/provider API references and examples. Use this for Ark text/image and Seedance video request/response shapes before changing provider calls.
- `docs/core/`: current target API contract. 
- `CONTEXT.md`: canonical domain language. Use these terms in new docs, issues, comments, and API explanations.

## User preference

- 当完成修复issues时，检查docs/core/中的架构/接口/prompt链路文件是否需要更新
- 使用$diagnose诊断时，将issue总结并写入docs/issues/P0
- 前端基于apps/web/进行开发
