---
name: api-contract-change
description: "API contract / 接口契约: use when changing REST/GraphQL/RPC/server-action schemas, request/response types, validation, errors, generated clients, or public integration behavior."
---

# API contract change

## Goal

Change API behavior without accidental contract drift or consumer breakage.

## Correct path

1. Identify the contract surface:
   - route / resolver / server action / RPC method
   - request validation
   - response schema
   - auth and authorization behavior
   - error format and status codes
   - generated client/types/docs
2. Classify the change:
   - backward-compatible additive change
   - behavior change with same shape
   - breaking change
   - deprecation or migration
3. Find consumers:
   - frontend callers
   - internal services/jobs
   - external integrations
   - tests/mocks/fixtures
4. Update canonical schema and generated artifacts.
5. Add tests for success, validation failure, unauthorized/forbidden, and backward compatibility where relevant.
6. Document migration or deprecation notes for breaking behavior.

## Wrong-chain guards

| Failure mode | Detection | Required correction |
|---|---|---|
| Response shape changed silently | Snapshot/client/types fail or consumer untested | Update contract and consumers intentionally |
| Validation differs across layers | UI and API schemas diverge | Share schema or make API canonical |
| Error behavior inconsistent | Tests cover success only | Add validation/auth/error tests |
| Breaking change undocumented | Existing consumer path fails | Add migration/deprecation plan |
| Generated types stale | Generated files or clients not updated | Run generation command or document need |

## Output contract

Return:

1. Contract surface changed.
2. Compatibility classification.
3. Consumers updated or verified.
4. Tests added/updated.
5. Generation/docs commands run.
6. Breaking-change notes if any.
