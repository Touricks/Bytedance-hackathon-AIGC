# ADR-0001 Project Docs Ownership

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Documentation roots and project contract ownership
Depends On: `docs/README.md`, `docs/migrations/spec-kit-project-docs-migration-plan.md`
Blocks: New canonical docs written into deprecated compatibility areas
Decision State: Proposed

## Decision

`docs/` is the canonical project-docs root. It owns architecture, ownership, contracts, data, frontend, AI/eval, demo/eval, and decision records.

The legacy core package remains as a deprecated migration input and temporary compatibility copy. It is not the source of truth for new project decisions.

## Consequences

- New or changed implementation contracts update `docs/` first.
- `docs/contracts/openapi.yaml` is the canonical machine-readable HTTP contract.
- Compatibility copies may exist during migration, but validation must keep them aligned or explicitly mark them as deprecated.
- `docs/self-use/` is non-canonical working material unless a user explicitly promotes content into the canonical docs root.

## Review Rule

Any future change that alters API behavior, workflow state, persistence shape, frontend view model, AI/provider behavior, or demo acceptance must either update the relevant canonical docs or state that no canonical docs are affected.
