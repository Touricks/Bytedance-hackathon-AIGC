# Scripts

This directory contains local development, provider verification, and real-chain acceptance scripts for the V2 module artifact workflow.

## Common Commands

| Command | Script | Purpose |
|---|---|---|
| `pnpm reset:dev -- --yes` | `reset-dev-session.mjs` | Stop current dev listeners, clear Postgres business tables and BullMQ Redis queues, then start `pnpm dev` unless `--no-dev` is passed. |
| `pnpm db:clear -- --yes` | `clear-postgres.mjs` | Clear Postgres business tables without touching workspace files. |
| `pnpm redis:clear -- --yes` | `clear-redis.mjs` | Clear BullMQ `generation` and `generation_v2` queue state. |
| `pnpm realitest` | `run-realitest.mjs` | Wrapper for the V2 real-provider agent-chain smoke. Internally runs `run-agent-chain-test.mjs`. |
| `pnpm test:agent-chain` / `pnpm agenttest:real` | `run-agent-chain-test.mjs` | Runs the V2 Postman/Newman module chain, then drives image/video/final-compose requests and DB assertions. |
| `pnpm realitest:parallel` | `run-realitest-parallel.mjs` | Runs 4-shot real-provider image/video/final compose acceptance. |
| `node scripts/verify-provider-apis.mjs` | `verify-provider-apis.mjs` | Calls text, image, and video providers directly without creating a merchant creative session. |
| `node scripts/extract-one-picture-events.mjs` | `extract-one-picture-events.mjs` | Prints the one-picture workspace-local trace file to stdout. |

## Real Provider Checks

Use provider verification before debugging a full agent-chain failure:

```bash
node scripts/verify-provider-apis.mjs
```

This script is a standalone model probe. It verifies provider credentials and endpoint availability for text, image, and video, but it does not create a workspace, write module artifacts, or exercise the product workflow.

Use the full V2 real-provider flow when you want to validate the public workflow:

```bash
pnpm test:agent-chain
```

This script:

1. Loads `.env`.
2. Clears Postgres and Redis unless `--no-reset` is passed.
3. Removes the target workspace `.daireel/` directory unless `--no-reset` is passed.
4. Starts `pnpm dev` unless `--no-dev` is passed.
5. Runs Newman with:
   - `docs/test/agent-chain/agent-chain.postman.json`
   - `docs/test/agent-chain/agent-chain.env.json`
   - `docs/test/agent-chain/agent-chain.data.json`
6. Continues past the Postman collection by sending image prompt, image select, video script, video select, and final compose requests.
7. Checks DB invariants, including V2 module artifact tables, current selections, final compose inputs, and absence of legacy main-chain `workspace_artifact` writes.

For multi-shot stability and final compose acceptance:

```bash
pnpm realitest:parallel
```

Useful overrides:

```bash
REALITEST_PARALLEL_SHOTPROMPT_SOURCE=fixed pnpm realitest:parallel
REALITEST_PARALLEL_IMAGE_BATCH_SIZE=1 REALITEST_PARALLEL_VIDEO_BATCH_SIZE=1 pnpm realitest:parallel
```

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

After a successful `pnpm realitest:parallel`, the one-picture `events.jsonl` may contain only a handful of lines, such as:

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

Current behavior mirrors `traceService.record(...)` into the workspace-local file trace after writing the DB row. New full runs should therefore include shot-level events such as:

- `image_prompt_proposed`
- `image_candidate_completed`
- `image_candidate_selected`
- `video_script_proposed`
- `video_generation_completed`
- `video_candidate_selected`
- `final_compose_completed`

For full-run auditing, use both sources:

```bash
node scripts/extract-one-picture-events.mjs
```

and:

```text
GET /api/workspaces/:workspaceId/traces?limit=500
```

The parallel acceptance script already checks both. Its summary reports the local trace path and the DB trace row count:

```json
{
  "trace": {
    "tracePath": "<workspaceDirectory>/.daireel/trace/events.jsonl",
    "dbTraceCount": 21
  }
}
```

The parallel acceptance gate now also requires local file trace coverage for shot-level propose, generation completion, and candidate selection events, so a new successful full run should not produce a text-agent-only trace file.

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
