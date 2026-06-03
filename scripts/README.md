# Scripts

This directory contains only active local development and contract-check scripts for the V2 module artifact workflow.

## Common Commands

| Command | Script | Purpose |
|---|---|---|
| `pnpm reset:dev -- --yes` | `reset-dev-session.mjs` | Stop current `SERVER_PORT` / `WEB_PORT` listeners, clear Postgres business tables and BullMQ Redis queues, then start `pnpm dev` unless `--no-dev` is passed. |
| `pnpm db:clear -- --yes` | `clear-postgres.mjs` | Clear Postgres business tables without touching workspace files. |
| `pnpm redis:clear -- --yes` | `clear-redis.mjs` | Clear BullMQ `generation` and `generation_v2` queue state. |
| `pnpm contract:frontend-backend` | `frontend-backend-contract-check.mjs` | Checks the frontend API surface against `docs/core/openapi.yaml`, validates mock response shapes, and records backend route gaps. |
| `pnpm --filter @aigc-video/server test:integration:smoke` | server integration tests | Active real-provider smoke for the backend image-flow and video-flow chains with one image candidate and one video candidate. |

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

## Real Provider Checks

The only active real-provider automation is the backend image/video chain:

```bash
pnpm --filter @aigc-video/server test:integration:smoke
```

Removed multi-real-model and direct-provider test runners are intentionally not kept as compatibility stubs. Old commands now fail as missing scripts/files so accidental provider-heavy runs are obvious.

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
