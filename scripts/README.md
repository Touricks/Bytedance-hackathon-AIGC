# Scripts

This directory contains only active local development and contract-check scripts for the current module artifact workflow.

## Common Commands

| Command | Script | Purpose |
|---|---|---|
| `pnpm reset:dev -- --yes` | `reset-dev-session.mjs` | Stop current `SERVER_PORT` / `WEB_PORT` listeners, clear Postgres business tables, Campaign temp workspaces, and BullMQ Redis queues, then start `pnpm dev` unless `--no-dev` is passed. |
| `pnpm db:clear -- --yes` | `clear-postgres.mjs` | Clear Postgres business tables without touching workspace files. |
| `pnpm redis:clear -- --yes` | `clear-redis.mjs` | Clear BullMQ `generation` and `generation` queue state. |
| `pnpm contract:frontend-backend` | `frontend-backend-contract-check.mjs` | Checks the frontend API surface against `docs/core/openapi.yaml`, validates mock response shapes, and records backend route gaps. |
| `pnpm --filter @aigc-video/server seed:dashboard -- --reset` | `apps/server/scripts/seed-dashboard.ts` | Inject mock dashboard videos + KOL publications + daily cumulative metrics directly into Postgres, no generation pipeline. |

## Dashboard Seed (mock data)

`apps/server/scripts/seed-dashboard.ts` injects a coherent dashboard chain straight into Postgres — `dashboard_video_artifacts` -> `external_kol_publications` -> daily cumulative `external_kol_metrics` — so the dashboard shows videos with realistic投放 analytics without running the generation pipeline.

```bash
# from apps/server (or prefix with: pnpm --filter @aigc-video/server ...)
pnpm seed:dashboard -- --reset
pnpm seed:dashboard -- --fixture <path> --workspace <id>
```

- Reads `apps/server/scripts/fixtures/dashboard-seed.json` by default (videos -> KOL publications -> `days` + `finalTotals`). Edit it to change the injected data, then re-run with `--reset`.
- Per publication it backfills one cumulative `external_kol_metrics` snapshot per day, ending exactly at `finalTotals`. `ctr` / `cvr` / `roas` are derived at read time, not stored.
- Idempotent: every row uses a deterministic `mock_*` id. `--reset` deletes prior `mock_*` rows first — required when changing totals/days, since inserts use `on conflict do nothing`.
- No MP4 is written, so `GET /api/dashboard/videos/:id/file` returns 404; the list and analytics rows still render.

Flags: `--reset`, `--fixture <path>`, `--workspace <id>`, `--help`. The pure daily-curve generator (`scripts/seed/cumulative-series.ts`) has unit tests: `node --import tsx --test scripts/seed/cumulative-series.test.ts`.

### Recommendation engine data (投放策略推荐)

`apps/server/scripts/fixtures/recommendation-seed.json` is a richer fixture (15 videos / 35 publications across 5 `商品一级类目 × 商品成交类型` groups) that gives the recommendation engine enough signal per group. Seed it into Postgres, then call the API:

```bash
# from apps/server
pnpm seed:dashboard -- --reset --fixture scripts/fixtures/recommendation-seed.json
# GET /api/dashboard/recommendations
# GET /api/dashboard/recommendations/:productCategory/:dealType?roasWeight=0.3&gmvWeight=0.7
```

Preview the engine output **without a database** (each publication's `finalTotals` is treated as one record — identical to what the DB repository loads):

```bash
# from apps/server
node --import tsx scripts/recommendation-preview.ts            # default weights
node --import tsx scripts/recommendation-preview.ts --roas 0.3 --gmv 0.7   # scale-first
node --import tsx scripts/recommendation-preview.ts --json     # full JSON
```

Engine design + method: `docs/auto_report/report.md`. Pure-engine unit tests: `node --import tsx --test apps/server/src/modules/recommendation/recommendation-engine.test.ts`.

## Frontend / Backend Contract Check

Run the lightweight contract check before touching backend/frontend API shape:

```bash
pnpm contract:frontend-backend
```

Useful modes:

```bash
node scripts/frontend-backend-contract-check.mjs --strict-source
node scripts/frontend-backend-contract-check.mjs --write-issues
FRONTEND_BACKEND_CONTRACT_LIVE=1 node scripts/frontend-backend-contract-check.mjs
```

Default mode requires OpenAPI coverage and validates all frontend-facing response shapes through an in-process mock backend. `--strict-source` additionally fails when the server source has no route for a frontend endpoint. `--write-issues` writes backend gap docs for known missing routes.

## Real Provider Probes

There is no active official real-provider smoke automation in package scripts. `scripts/` only keeps direct manual provider probes for diagnosis:

```bash
node scripts/verify-provider-image.mjs --json
node scripts/verify-provider-video.mjs --image-url <url> --json
```

These probes call provider endpoints directly. They do not exercise workspace state, queues, DB writes, asset persistence, selection, or final compose.

Removed real-provider smoke and multi-real-model runners are intentionally not kept as compatibility stubs. Old commands now fail as missing scripts/files so accidental provider-heavy runs are obvious.

## Trace Locations

There are two trace stores in the current architecture:

| Store | Location | Used For |
|---|---|---|
| DB trace | `trace_events` table | Queryable product/debug timeline exposed through API. |
| Workspace-local file trace | `<workspaceDirectory>/.daireel/trace/events.jsonl` | Local debugging of selected provider and generation boundary events. |

Trace APIs:

```text
GET /api/workspaces/:workspaceId/traces
GET /api/shots/:shotId/traces
```

For workspace-local files, inspect `<workspaceDirectory>/.daireel/trace/events.jsonl` and `<workspaceDirectory>/.daireel/trace/provider_call.jsonl` directly.

## Reset Script Flags

`reset-dev-session.mjs` supports:

```bash
pnpm reset:dev -- --yes
pnpm reset:dev -- --yes --no-dev
```

Use `--no-dev` when you only want cleanup and plan to start the server yourself.

During cleanup, `reset-dev-session.mjs` removes only immediate `daireel-campaign-*`
directories under Node's `os.tmpdir()` (for example macOS `/var/folders/.../T`).
It does not recursively scan `/var/folders` or remove merchant-selected workspace
directories.
