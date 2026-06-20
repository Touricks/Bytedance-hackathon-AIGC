# Scripts

This directory contains only active local development and contract-check scripts for the current module artifact workflow.

## Common Commands

| Command | Script | Purpose |
|---|---|---|
| `pnpm reset:dev -- --yes` | `reset-dev-session.mjs` | Stop current `SERVER_PORT` / `WEB_PORT` listeners, clear Postgres business tables, Campaign temp workspaces, and BullMQ Redis queues, then start `pnpm dev` unless `--no-dev` is passed. |
| `pnpm db:clear -- --yes` | `clear-postgres.mjs` | Clear Postgres business tables without touching workspace files. |
| `pnpm redis:clear -- --yes` | `clear-redis.mjs` | Clear BullMQ `generation` and `generation` queue state. |
| `pnpm contract:frontend-backend` | `frontend-backend-contract-check.mjs` | Checks the frontend API surface against `docs/core/openapi.yaml`, validates mock response shapes, and records backend route gaps. |
| `pnpm --filter @aigc-video/server seed:dashboard:sample -- --reset` | `apps/server/scripts/seed-dashboard.ts` | Inject the small dashboard smoke-test sample directly into Postgres. |
| `pnpm --filter @aigc-video/server seed:dashboard:recommendation -- --reset` | `apps/server/scripts/seed-dashboard.ts` | Inject the larger recommendation-engine dashboard sample directly into Postgres. |

## Dashboard Seed (mock data)

`apps/server/scripts/seed-dashboard.ts` injects a coherent dashboard chain straight into Postgres — `dashboard_video_artifacts` -> `external_kol_publications` -> daily cumulative `external_kol_metrics` — so the dashboard shows videos with realistic投放 analytics without running the generation pipeline.

```bash
# from apps/server (or prefix with: pnpm --filter @aigc-video/server ...)
pnpm seed:dashboard:sample -- --reset
pnpm seed:dashboard:recommendation -- --reset
pnpm seed:dashboard -- --fixture <path> --workspace <id>
```

- `seed:dashboard:sample` reads `apps/server/scripts/fixtures/dashboard-seed.json` (2 videos / 3 publications / 36 metric snapshots across 2 groups) for fast dashboard smoke tests.
- `seed:dashboard:recommendation` reads `apps/server/scripts/fixtures/recommendation-seed.json` (26 videos / 61 publications / 677 metric snapshots across 8 groups) for recommendation-engine and factor-matrix validation, including `家居家装 × 复购型消耗品`.
- `seed:dashboard` remains a compatibility entrypoint for custom fixtures; without `--fixture`, it uses the small sample.
- Per publication it backfills one cumulative `external_kol_metrics` snapshot per day, ending exactly at `finalTotals`. `ctr` / `cvr` / `roas` are derived at read time, not stored.
- Refreshable: every row uses a deterministic `mock_*` id. `--reset` deletes prior `mock_*` rows first, which is still recommended when changing totals/days so old publication and metric rows are removed cleanly.
- Each mock dashboard video persists `apps/static/placehold.mp4` through the dashboard asset storage rule: `DASHBOARD_S3_BUCKET` writes `dashboard/{artifactId}/video.mp4` and `dashboard/{artifactId}/metadata.json` to S3-compatible storage, otherwise the LOCAL dashboard asset directory is used. `GET /api/dashboard/videos/:id/file` streams the 720x1280 / 15s placeholder MP4 through the same server proxy either way.

Flags: `--reset`, `--fixture <path>`, `--workspace <id>`, `--help`. The pure daily-curve generator (`scripts/seed/cumulative-series.ts`) has unit tests: `node --import tsx --test scripts/seed/cumulative-series.test.ts`.

### Recommendation engine data (投放策略推荐)

`apps/server/scripts/fixtures/recommendation-seed.json` is a richer fixture (26 videos / 61 publications across 8 `商品一级类目 × 商品成交类型` groups) that gives the recommendation engine enough signal per group. It includes a dedicated `家居家装 × 复购型消耗品` group for high-frequency home cleaning consumables. Seed it into Postgres, then call the API:

```bash
# from apps/server
pnpm seed:dashboard:recommendation -- --reset
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

Trace is internal observability data. There is no public trace HTTP API in the current contract.

| Store | Location | Used For |
|---|---|---|
| DB trace | `trace_events` table | Internal index for workspace/shot audit and future trace viewer/backfill. |
| Structured log | Pino JSON emitted by the server process | Runtime observability with token/data URL/temporary provider URL redaction. |
| Workspace-local file trace | `<workspaceDirectory>/.daireel/trace/events.jsonl` | Local debugging mirror for selected agent/generation boundary events. |
| S3 per-event archive | `workspaces/{workspaceId}/trace/events/{createdAt}-{traceEventId}.json` and `workspaces/{workspaceId}/trace/provider-calls/{createdAt}-{traceEventId}.json` | Immutable trace archive for S3-backed workspaces. |

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
