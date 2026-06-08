# Backend Architecture

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Fastify API, PostgreSQL, BullMQ, storage, workers
Depends On: `architecture/domain.md`, `architecture/erd.md`, `contracts/interface.md`
Blocks: Backend implementation that changes module ownership or runtime facts
Decision State: Accepted

## 1. Executive Summary

The backend is a Fastify API plus BullMQ worker runtime. PostgreSQL stores business facts. Workspace storage adapters provide local or S3-compatible media persistence. Provider calls are mediated by `packages/ai` and concurrency semaphores.

## 2. Current Reality

- API runtime starts from `apps/server/src/app.ts`.
- Controllers live under `apps/server/src/modules/*`.
- DDL lives in `apps/server/src/db/schema/schema.sql`.
- Queue names are `generation` and `generation`.
- Worker concurrency is controlled by `GENERATION_WORKER_CONCURRENCY`.
- Provider concurrency is controlled separately by `TEXT_PROVIDER_CONCURRENCY`, `IMAGE_PROVIDER_CONCURRENCY`, and `VIDEO_PROVIDER_CONCURRENCY`.

## 3. Target State

| Backend area | Responsibility |
|---|---|
| Fastify controllers | Parse params/body, map service errors to HTTP errors. |
| Services | Own business rules, artifact lifecycle, validation, and transaction boundaries. |
| DB client | Own SQL and row mapping. |
| BullMQ jobs | Own async candidate generation, final compose, one-click advancement, image auto-selection. |
| Storage adapters | Own LOCAL/S3 object read/write/stream. |
| Trace service | Own DB trace rows and optional local JSONL mirrors. |

## 4. Contracts / Interfaces

- `DATABASE_URL` is required.
- `WORKSPACE_STORAGE_KIND` is `local` or `s3`.
- Candidate counts use `DEFAULT_IMAGE_CANDIDATES`, `MAX_IMAGE_CANDIDATES_PER_SHOT`, `DEFAULT_VIDEO_CANDIDATES`, and `MAX_VIDEO_CANDIDATES_PER_SHOT`.
- Provider calls use explicit `TEXT_*`, `IMAGE_*`, and `VIDEO_*` env families for new work.
- Stable media URLs are server proxy URLs, not direct storage URLs.
- S3-compatible dashboard video copies live under bucket-root `dashboard/{finalVideoJobId}/`, separate from workspace storage prefixes.

## 5. Implementation Slices

- Workspace service and storage binding.
- Workspace module artifact services.
- Shot service and deterministic per-shot prompt assembly.
- Generation service and image/video/final compose workers.
- Dashboard and campaign services.
- Trace/provider-call auditing.

## 6. Acceptance Tests

- `pnpm --filter @aigc-video/server test`
- `pnpm contract:frontend-backend`
- Provider probes only for manual diagnosis.

## 7. Open Decisions

- Production-grade migrations and auth are outside current scope.

## 8. Related Docs

- `implementation/runbook_local_dev.md`
- `architecture/security.md`
