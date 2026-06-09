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

## Runtime config

- Copy `.env.example` to `.env`; never commit real provider keys, endpoint IDs, credentials, or local secrets.
- Preferred provider env fields are `TEXT_*`, `IMAGE_*`, and `VIDEO_*`. Legacy `ARK_*` aliases may exist in code, but new work should use the explicit per-provider fields.
- Candidate count env names are `DEFAULT_IMAGE_CANDIDATES`, `MAX_IMAGE_CANDIDATES_PER_SHOT`, `DEFAULT_VIDEO_CANDIDATES`, and `MAX_VIDEO_CANDIDATES_PER_SHOT`.
- Queue/provider concurrency is controlled by `GENERATION_WORKER_CONCURRENCY`, `TEXT_PROVIDER_CONCURRENCY`, `IMAGE_PROVIDER_CONCURRENCY`, and `VIDEO_PROVIDER_CONCURRENCY`.

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

## User preference

- 当完成修复issues时，检查docs/core/中文件是否需要更新
- 使用$diagnose诊断时，将issue总结并写入docs/issues/P0
- 前端基于apps/web/进行开发
- 前端页面单.ts文件代码控制在600行之内
- 当用户提到“重启服务”时，你需要:1. 解除端口占用 2. 使用pnpm dev启动服务器
- Do NOT add any emoji in the prompt artifact.