# Demo And Eval Plan

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Local validation, mock demo readiness, and provider diagnosis
Depends On: `docs/contracts/openapi.yaml`, `docs/ai/retrieval-eval-boundary.md`
Blocks: Demo readiness claims without validation gates
Decision State: Proposed

## Validation Gates

| Gate | Command | Purpose |
|---|---|---|
| Docs contracts | `pnpm docs:check` | Ensures canonical docs root and compatibility mirrors are coherent. |
| Frontend/backend contract | `pnpm contract:frontend-backend` | Ensures OpenAPI covers frontend API surface and mock shapes. |
| Typecheck | `pnpm typecheck` | Ensures workspace packages typecheck. |
| Server tests | `pnpm --filter @aigc-video/server test` | Covers backend services, workers, routes, persistence. |
| Web tests | `pnpm --filter @aigc-video/web test` | Covers frontend adapters, view models, and UI logic. |
| Provider probes | `node scripts/verify-provider-image.mjs --json`; `node scripts/verify-provider-video.mjs --image-url <url> --json` | Diagnoses real provider endpoints only. |

## Acceptance Notes

Mock mode can validate the full user workflow without real model credentials. Real-provider probes are diagnostic and do not exercise workspace state, queues, DB writes, asset persistence, selection, or final compose.
