# Security Architecture

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Uploads, storage, provider credentials, SSRF, trace redaction
Depends On: `architecture/backend.md`, `contracts/interface.md`
Blocks: Auth/storage/upload/provider changes without security review
Decision State: Accepted

## 1. Executive Summary

The current API is unauthenticated and single-tenant for local development, but it still handles uploads, URL imports, local/S3 storage, provider credentials, and trace data. Security-sensitive changes require explicit review.

## 2. Current Reality

- Provider keys come from `.env`; real credentials must never be committed.
- Multipart upload size limits are enforced by Fastify and service checks.
- Reference video URL import blocks localhost/private hosts and requires direct video download.
- Workspace file streaming rejects path traversal.
- Provider call trace stores URL summaries/hashes rather than full signed/data URLs.

## 3. Target State

| Risk | Required control |
|---|---|
| Secrets | Use env vars; never commit provider keys or endpoint ids. |
| Upload size/type | Validate content type, bytes, and model-specific limits before provider calls. |
| Path traversal | Resolve relative paths under workspace storage roots only. |
| SSRF | Restrict reference video imports to http(s), block private/local hosts, require video content. |
| Trace leakage | Redact signed URLs/data URLs; keep provider request summaries minimal. |
| S3 exposure | Frontend uses server proxy URLs, not direct object URLs. |
| Tenant boundary | Future auth/multi-tenant work must add permission checks before sharing routes publicly. |

## 4. Contracts / Interfaces

- Upload and streaming endpoints return business errors rather than stack traces.
- `reference-video/import` returns `INVALID_REFERENCE_VIDEO_URL`, `REFERENCE_VIDEO_NOT_DIRECT_DOWNLOAD`, `REFERENCE_VIDEO_TOO_LARGE`, or `UNSUPPORTED_REFERENCE_VIDEO_TYPE` for import violations.
- Provider failures should preserve diagnostic code without leaking secrets or full signed URLs.

## 5. Implementation Slices

- Upload guards and image/video provider input filters.
- Storage adapter path checks.
- Reference video SSRF and size controls.
- Trace redaction and logging policy.

## 6. Acceptance Tests

- Reference video API tests.
- Asset URL resolver tests.
- Generated asset storage tests.
- Security reviewer pass for auth/upload/S3/provider changes.

## 7. Open Decisions

- Authentication and authorization model is not yet defined for production.

## 8. Related Docs

- `architecture/backend.md`
- `testing/test_strategy.md`

