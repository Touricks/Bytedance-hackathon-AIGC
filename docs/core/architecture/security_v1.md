# Security V1

Status: Draft
Owner: Security + Backend
Last Updated: 2026-06-08
Applies To: Auth, authorization, uploads, provider calls, trace, export, and local workspace storage
Depends On: `backend_v1.md` if added, `agent_v1.md` if added, `../contracts/openapi.yaml`
Blocks: Production exposure and security-sensitive implementation
Decision State: Proposed; local demo boundaries accepted

## 1. Executive Summary

Current code is suitable for local/demo operation, not production internet
exposure. The strongest implemented boundaries are input validation, safe
material refs, workspace storage adapters, provider secret env handling, and
trace redaction policies. Production auth, tenant isolation, quota/rate policy,
and signed export authorization remain assigned open decisions.

## 2. Sensitive Areas

| Area | Risk | Canonical owner |
|---|---|---|
| auth/session | No production user identity boundary in local demo | Future auth/security slice |
| workspace authorization | Workspace ids in routes can be guessed without auth | Future auth/security slice |
| uploads/material refs | Path traversal, oversized/invalid media, unsafe MIME | `workspace.controller`, storage helpers, material services |
| provider keys | Leakage through env, logs, traces, errors | `provider-config.ts`, provider wrappers |
| provider inputs/outputs | Prompt injection, malformed JSON, unsafe generated URLs | AI workflows, response schemas, backend validators |
| trace/audit | Data URL, signed URL, secret or PII leakage | trace services and provider-call trace helpers |
| final video export | Unauthorized download if exposed publicly | generation controller and future auth middleware |
| campaign/dashboard metrics | Cross-workspace publication or metrics mutation | campaign/dashboard services and future auth middleware |

## 3. Trust Boundaries

- Browser input is untrusted and must be parsed by route schemas or service
  schemas before mutation.
- External provider output is untrusted and must be JSON parsed, repaired only
  through allowed repair paths, and validated by shared/provider schemas.
- Uploaded material names are untrusted. Delete/read operations must reject path
  traversal and only use safe workspace-relative refs.
- Provider credentials live in env variables; never write real keys or endpoint
  ids to docs, tests, traces, or committed files.
- Provider-call trace metadata may include hashes, host summaries, prompt hashes,
  latency, status, and counts; it must not store signed URLs or data URL raw
  bodies in provider-call audit.
- LOCAL `.daireel/trace/*.jsonl` mirrors are debugging aids; S3 workspace mode
  must not write local JSONL mirrors.

## 4. Negative Tests

- unauthenticated production route access: assigned open decision.
- unauthorized or wrong-workspace access: assigned open decision.
- material delete path traversal: covered by API tests with `INVALID_MATERIAL_REF`.
- malformed module artifact data: covered by Zod parse failures.
- non-P0 storyboard before shotprompt/apply: covered by API tests.
- provider output shot count/index collapse: covered by AI workflow tests.
- image reference filtering should reject video refs before image provider input.
- provider secret redaction in errors/traces should be preserved by provider tests.

## 5. Security Implementation Gate

Before any production or internet-facing deployment:

- [ ] Add auth/session and workspace authorization middleware.
- [ ] Add wrong-tenant negative tests for every mutating route.
- [ ] Add upload size/type limits and document them in OpenAPI.
- [ ] Add signed final-video/material access policy or private proxy rules.
- [ ] Run security review for provider calls, uploads, trace, and campaign metrics.

## 6. Open Decisions

| Decision | Owner | Current recommendation |
|---|---|---|
| Auth provider and session model | Product + Backend + Security | Needs Spike before production; not required for local V3 demo. |
| Workspace ownership model | Backend + Security | Bind every workspace to authenticated owner once auth exists. |
| Export URL policy | Backend + Security | Prefer authenticated proxy or short-lived signed URLs. |
| Provider prompt retention policy | Product + Security | Keep full prompt trace for local/debug only unless compliance approves server retention. |
