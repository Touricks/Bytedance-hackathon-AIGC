# Review note 2026-05-23: `codex/fix-v0-architecture-bugs`

## Question

Issues have been solved. Review branch `codex/fix-v0-architecture-bugs`. 是否修复了 bugs 且满足我们提出的架构文档 `docs/arc_codex_r3.md`、`docs/plan_0523/proposed_architecture.md` 所需的功能？如果满足，请参考 `arc_codex_r3.md`，写入当前架构文档 `docs/arc_codex_r4.md`。

## Verdict

当前 branch 修复了大部分已发现的架构 bug，但 **还不完全满足** 架构文档的运行时承诺。因此本轮没有生成 `docs/arc_codex_r4.md`。

Blocking issue:

- Server still only reads `process.env`; root `.env` is not loaded by `pnpm dev`.
- With the current local shell, server config resolves to the memory fallback path, not Postgres.
- This means the implemented Postgres adapter works when `DATABASE_URL` is explicitly exported, but the documented local startup flow (`cp .env.example .env`, `pnpm dev`) still does not reliably make Postgres the business fact source.

## What was fixed

The branch adds:

- Postgres-backed `DbAdapter` with schema initialization.
- `DATABASE_URL` config surface.
- Persistent Product / Asset / Script / StoryboardShot / GenerationJob read/write methods.
- Durable blueprint retrieval after process restart test.
- Shared job-state helpers for `running`, `completed`, and `failed`.
- Real-provider mode via `MODEL_MODE=real`.
- AI smoke command for real Ark + Seedance provider checks.
- Review state URL helpers for stable `scriptId` / `jobId` recovery.

## Remaining finding

### P1: documented dev/runtime startup still falls back to memory DB

Evidence:

- `apps/server/src/common/config.ts` reads `process.env.DATABASE_URL`.
- No `dotenv`, `--env-file`, or equivalent loader is wired in the server startup scripts.
- Running a config probe in the current branch returns `memory-fallback`.

Impact:

The architecture says Postgres is the business fact source, and the README-style local flow tells developers to copy `.env.example` to `.env`. But copying `.env` alone does not populate `process.env` for the Node server. Unless the developer explicitly exports `DATABASE_URL`, the app still uses `MemoryDbAdapter`, so `scriptId`, frozen blueprints, job progress, final assets, and review links are not durable after restart.

Recommended fix:

- Add an explicit environment loading path for server and AI smoke scripts, or change scripts/docs so the required variables are exported before startup.
- Prefer making `DATABASE_URL` required for normal server runtime, with memory adapter reserved for tests or explicit `DATABASE_URL` absence in a named mock/dev mode.
- Add a regression test or startup assertion that the documented local command path uses Postgres when `.env` contains `DATABASE_URL`.

## Validation run

Passed:

- `pnpm --filter @aigc-video/web test`
- `pnpm --filter @aigc-video/server test`
- `pnpm --filter @aigc-video/ai test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm exec turbo typecheck --force`
- `pnpm exec turbo lint --force`
- `pnpm exec turbo build --force`

Important nuance:

The server persistence test passes because it spawns child processes with `DATABASE_URL` explicitly set. That proves the Postgres adapter works under explicit environment configuration; it does not prove the documented `.env` startup path activates Postgres.

## R4 status

`docs/arc_codex_r4.md` should be written after the environment-loading/runtime-mode gap is fixed. At that point, r4 can truthfully describe the current architecture as:

- Fastify modular monolith.
- Postgres business fact source.
- Redis/BullMQ optional async transport.
- Local upload storage for P0.
- Ark/OpenAI-compatible text provider with Zod validation and repair retry.
- Seedance single-call 12s image-to-video generation.
- Mock/fallback providers only in explicit local/demo modes.
- Stable review links via `scriptId` and `jobId`.
