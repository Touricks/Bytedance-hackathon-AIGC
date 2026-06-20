# Test Strategy

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Unit, API, contract, integration, and manual provider validation
Depends On: `contracts/openapi.yaml`, `architecture/runtime_flow.md`
Blocks: Declaring architecture-ready without validation gates
Decision State: Accepted

## 1. Executive Summary

The test strategy separates deterministic local regression coverage from manual provider diagnosis. Full real-provider chain smoke automation is intentionally not an active package script.

## 2. Current Reality

| Layer | Command / location | Purpose |
|---|---|---|
| Shared contracts | `pnpm --filter @aigc-video/shared test` | Zod schemas, creative factors, storyboard validation. |
| AI package | `pnpm --filter @aigc-video/ai test` | Prompt assembly, provider clients, response formats. |
| Server | `pnpm --filter @aigc-video/server test` | API/services/workers/storage/internal trace sink. |
| Web | `pnpm --filter @aigc-video/web test` | API clients, creative review state, dashboard UI logic. |
| Frontend/backend contract | `pnpm contract:frontend-backend` | OpenAPI path/method coverage and frontend mock shape checks. |
| Provider probes | `node scripts/verify-provider-image.mjs --json`, `node scripts/verify-provider-video.mjs --image-url <url> --json` | Manual provider endpoint diagnosis only. |

## 3. Target State

- Every user-visible behavior change has at least one targeted test.
- Every API contract change updates OpenAPI/interface and contract check coverage.
- Every artifact/data model change updates shared schemas or service validation tests.
- Every provider boundary change uses provider reference docs and targeted provider client tests.

## 4. Contracts / Interfaces

- Contract tests read `docs/core/contracts/openapi.yaml`.
- Trace tests cover DB index, Pino-safe redaction, LOCAL JSONL mirror, and S3 per-event archive; trace HTTP endpoints are not part of frontend/backend contract coverage.
- Server API tests should verify status codes, error codes, and business state writes.
- Frontend tests should verify view-model behavior, not duplicate server business rules.

## 5. Implementation Slices

1. Contract gate.
2. Module artifact lifecycle tests.
3. Shot set and upstream drift tests.
4. Image/video candidate lifecycle tests.
5. Final compose/dashboard/campaign attribution tests.
6. E2E journey evidence where UI or orchestration changes.

## 6. Acceptance Tests

Before declaring docs/core-aligned implementation ready, prefer:

```sh
pnpm contract:frontend-backend
pnpm --filter @aigc-video/shared test
pnpm --filter @aigc-video/server test
pnpm --filter @aigc-video/web test
```

Run narrower subsets when the change is documentation-only or when runtime dependencies are unavailable, and state exactly what ran.

## 7. Open Decisions

- No official full real-provider smoke package script is active; keep direct probes manual.

## 8. Related Docs

- `testing/e2e_plan.md`
- `implementation/runbook_local_dev.md`
