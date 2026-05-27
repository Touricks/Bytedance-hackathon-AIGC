# Review note 2026-05-23: remove Memory DB and write r4

## Question

Memory DB fallback should be deprecated or deleted entirely. Continue on `codex/fix-v0-architecture-bugs`, remove the fallback, validate the architecture, and write `docs/arc_codex_r4.md` if the branch now satisfies the architecture documents.

## Decision

Memory DB was removed from the V0 persistence path. Postgres is now the only supported business fact source.

This is stricter than the previous proposal that kept Memory DB for tests. The stricter version is better for this project because tests should exercise the same durability boundary that the demo and review path depend on.

## Changes made

- Removed `MemoryDbAdapter`.
- Required `DATABASE_URL` in server config.
- Added root `.env` loading for server config.
- Added root `.env` loading for AI provider/smoke paths.
- Made server tests deterministic by forcing provider env to mock/empty values while still using Postgres.
- Added config regression tests:
  - missing `DATABASE_URL` fails loudly;
  - nearest `.env` can provide `DATABASE_URL`.
- Fixed Postgres JSONB writes by serializing `payload`, `trace`, `rawJson`, and `metadata` explicitly.
- Ran server integration tests serially because they share a Postgres-backed app/pool in-process.
- Wrote `docs/arc_codex_r4.md` as the current implemented architecture document.

## Validation

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

## Remaining operator step

Real-provider smoke is intentionally not part of default tests because it needs external credentials and a publicly reachable product image.

Run it before judged demo:

```bash
pnpm --filter @aigc-video/ai smoke:real-providers
```
