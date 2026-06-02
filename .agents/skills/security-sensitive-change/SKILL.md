---
name: security-sensitive-change
description: "Security-sensitive change / 安全敏感变更: use for auth, permissions, tenancy, PII, secrets, payments, entitlement, upload, webhook, redirects, SSRF, injection, or audit logging changes."
---

# Security-sensitive change

## Goal

Make security-sensitive changes with explicit trust boundaries, negative tests, and minimal exposure.

## Correct path

1. Classify the sensitive area:
   - auth/session
   - authorization/tenant isolation
   - PII/secrets/logging
   - payment/entitlement
   - upload/download
   - webhook/callback/redirect
   - SSRF/injection/deserialization
2. Identify trust boundaries and attacker-controlled inputs.
3. Locate canonical policy/permission checks.
4. Add or update negative tests:
   - unauthenticated
   - authenticated but unauthorized
   - wrong tenant/account
   - malformed input
   - replay/duplicate webhook where applicable
5. Avoid logging secrets, tokens, raw PII, or full request bodies.
6. Prefer deny-by-default behavior.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| UI-only permission check | API path lacks authorization test | Enforce in backend/policy layer |
| Tenant isolation untested | Only same-tenant happy path tested | Add cross-tenant negative test |
| Secrets in logs | Token/API key/error payload logged | Redact and test/log review |
| Webhook trusts payload | No signature/replay validation | Add verification and duplicate handling |
| Payment entitlement duplicated | UI/API/job use different logic | Route through canonical policy/service |

## Output contract

Return:

1. Sensitive area and trust boundary.
2. Canonical policy/check used.
3. Negative tests added/updated.
4. Logging/privacy notes.
5. Commands run and results.
6. Remaining risk.
