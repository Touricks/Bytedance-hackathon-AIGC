# Scripts

This directory contains local development scripts and retired real-chain acceptance helpers for the V2 module artifact workflow.

## Common Commands

| Command | Script | Purpose |
|---|---|---|
| `pnpm reset:dev -- --yes` | `reset-dev-session.mjs` | Stop current `SERVER_PORT` / `WEB_PORT` / `WEB_LATEST_PORT` listeners, clear Postgres business tables and BullMQ Redis queues, then start `pnpm dev-latest` unless `--no-dev` is passed. |
| `pnpm db:clear -- --yes` | `clear-postgres.mjs` | Clear Postgres business tables without touching workspace files. |
| `pnpm redis:clear -- --yes` | `clear-redis.mjs` | Clear BullMQ `generation` and `generation_v2` queue state. |
| `pnpm contract:frontend-backend` | `frontend-backend-contract-check.mjs` | Checks the frontend API surface against `docs/core/openapi.yaml`, validates mock response shapes, and records backend route gaps. |
| `pnpm --filter @aigc-video/server test:integration:smoke` | server integration tests | Active real-provider smoke; runs only backend image-flow and video-flow with one image candidate and one video candidate. |

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

Default mode requires OpenAPI coverage and validates all frontend-facing response shapes through an in-process mock backend. `--strict-source` additionally fails when the server source has no route for a frontend endpoint. `--write-issues` writes P0 backend gap docs for known missing routes.

## Real Provider Checks

The only active real-provider smoke is the backend image/video chain. It fixes image/video candidates to 1 each:

```bash
pnpm --filter @aigc-video/server test:integration:smoke
```

The following multi-real-model package scripts have been removed from `package.json` and must not be restored as active automation without a new test policy decision:

- `realitest`
- `test:agent-chain`
- `agenttest:real`
- `realitest:parallel`
- `test:integration:provider`
- `test:integration:expensive`
- `smoke:providers`
- `smoke:real-providers`

Legacy direct runner files such as `scripts/run-realitest.mjs`, `scripts/run-agent-chain-test.mjs`, `scripts/run-realitest-parallel.mjs`, and `scripts/verify-provider-apis.mjs` remain guarded and exit with a disabled message if invoked manually.

## Postman Assets

The V2 Postman/Newman assets live in:

```text
docs/test/agent-chain/
├── agent-chain.postman.json
├── agent-chain.env.json
└── agent-chain.data.json
```

Their roles:

- `agent-chain.postman.json`: the readable public API collection for system, workspace, module artifact, and shot-set apply requests.
- `agent-chain.env.json`: non-secret runtime variables such as `baseUrl`, `workspaceDirectory`, artifact ids, shot ids, and poll settings.
- `agent-chain.data.json`: Collection Runner data for creative requirements such as image style, script tone, storyboard rhythm, and shot-level image/video requirements.

Provider secrets should stay in `.env` or other local-only env files. Do not commit provider keys into Postman files.

## Trace Locations

There are two trace stores in the current architecture:

| Store | Location | Used For |
|---|---|---|
| DB trace | `trace_events` table | Queryable product/debug timeline exposed through API. |
| Workspace-local file trace | `<workspaceDirectory>/.daireel/trace/events.jsonl` | Local debugging of selected provider/agent boundary events. |

Trace APIs:

```text
GET /api/workspaces/:workspaceId/traces
GET /api/shots/:shotId/traces
```

The one-picture extractor prints the workspace-local file trace:

```bash
node scripts/extract-one-picture-events.mjs
```

Useful filters:

```bash
node scripts/extract-one-picture-events.mjs --tail 40
node scripts/extract-one-picture-events.mjs --kind image_prompt_proposed
node scripts/extract-one-picture-events.mjs --shot <shotId>
node scripts/extract-one-picture-events.mjs --failed-only
```

Resolution order:

1. `REALITEST_WORKSPACE_DIRECTORY`, if set.
2. `workspaceDirectory` in `docs/test/provider.env.json`.
3. Repo-local fallback: `integrationTest_v0/onePicture/.daireel/trace/events.jsonl`.

Example:

```bash
REALITEST_WORKSPACE_DIRECTORY=/Users/carrick/TestWorkspace/Project-AIGC/IntegrationTest_v0/onePicture \
  node scripts/extract-one-picture-events.mjs
```

## Why Older `events.jsonl` Files Can Be Small

Older `events.jsonl` files may be short because the workspace-local file trace used to receive events only from code paths that explicitly created and passed a file trace logger, for example:

- `material-intake` real text agent/provider calls.
- `shotprompt` real text agent/provider calls.

In historical `pnpm realitest:parallel` runs, the one-picture `events.jsonl` could contain only a handful of lines, such as:

- `material_intake.request_prepared`
- `provider.request_started`
- `provider.response_received`
- `material_intake.parsed`
- `shotprompt.request_prepared`
- `provider.request_started`
- `provider.response_received`
- `shotprompt.parsed`

That small file does not mean the image/video/final-compose chain did not run. In that earlier implementation:

- `run-realitest-parallel.mjs` approves fixed product brief and storyboard artifacts, so those modules may not call real provider code and therefore do not add file trace events.
- Shot-level image prompt and video script events were recorded through `traceService.record(...)` into the `trace_events` table.
- Image generation, video generation, and final compose worker events were also recorded as DB trace rows.
- The extractor only reads `.daireel/trace/events.jsonl`; it does not query `trace_events`.
- Provider payloads are intentionally compacted and redacted in file traces, especially image data URLs.

Historical full runs mirrored `traceService.record(...)` into the workspace-local file trace after writing the DB row. Those runs could include shot-level events such as:

- `image_prompt_proposed`
- `image_candidate_completed`
- `image_candidate_selected`
- `video_script_proposed`
- `video_generation_completed`
- `video_candidate_selected`
- `final_compose_completed`

For historical full-run auditing, use both sources:

```bash
node scripts/extract-one-picture-events.mjs
```

and:

```text
GET /api/workspaces/:workspaceId/traces?limit=500
```

The retired parallel acceptance script checked both. Its summary reported the local trace path and the DB trace row count:

```json
{
  "trace": {
    "tracePath": "<workspaceDirectory>/.daireel/trace/events.jsonl",
    "dbTraceCount": 21
  }
}
```

That retired gate also required local file trace coverage for shot-level propose, generation completion, and candidate selection events.

## Script Flags

`run-agent-chain-test.mjs` supports:

```bash
node scripts/run-agent-chain-test.mjs --help
node scripts/run-agent-chain-test.mjs --no-reset
node scripts/run-agent-chain-test.mjs --no-dev
```

- `--no-reset`: keep current Postgres, Redis, and workspace `.daireel/` state.
- `--no-dev`: use an already running backend instead of starting `pnpm dev`.

`reset-dev-session.mjs` supports:

```bash
pnpm reset:dev -- --yes
pnpm reset:dev -- --yes --no-dev
```

Use `--no-dev` when you only want cleanup and plan to start the server yourself.
