# AIGC Video Project Docs

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: AIGC commerce video generation repository
Depends On: `README.md`, current code, `docs/migrations/spec-kit-project-docs-migration-plan.md`
Blocks: Treating legacy docs as canonical project contracts
Decision State: Proposed

## Purpose

This directory is the canonical Spec Kit style project-docs root. It replaces the legacy core package as the place agents and reviewers should use for ownership, architecture, contracts, data, frontend, AI/eval, and testing decisions.

`docs/core/` remains a deprecated migration input and temporary compatibility area. Do not add new canonical content there unless the user explicitly asks for a compatibility update.

## Current Doc Map

- `ownership/team-ownership.md`: role owners, folder ownership, and review responsibilities.
- `ownership/change-policy.md`: how cross-boundary changes route through docs, code, and tests.
- `architecture/module-map.md`: product modules mapped to runtime apps, packages, and code owners.
- `architecture/runtime-flow.md`: main user and worker runtime sequence.
- `contracts/openapi.yaml`: canonical frontend/backend HTTP contract.
- `contracts/interface.md`: human-readable API contract.
- `contracts/contract-mapping.md`: frontend/backend/schema/test contract map.
- `contracts/state-machine.md`: workflow, shot, batch, candidate, job, and final-video status vocabulary.
- `data/persistence-boundary.md`: durable data, queue, storage, and compatibility boundaries.
- `frontend/ui-governance.md`: frontend ownership and UI state rules.
- `ai/retrieval-eval-boundary.md`: AI/provider/prompt/eval boundary.
- `eval/demo-eval-plan.md`: demo fixtures, validation gates, and quality checks.
- `decisions/ADR-0001-project-docs-ownership.md`: docs root ownership decision.

## Runtime Folder Model

```text
apps/server/      Fastify API, BullMQ workers, PostgreSQL access, storage adapters, final compose.
apps/web/         React/Vite creative review workbench and data dashboard.
apps/storage/     S3-compatible storage client package.
packages/ai/      Provider clients, prompt modules, AI workflows, response formats.
packages/shared/  Shared Zod schemas, domain types, constants, and compilers.
infra/            Local PostgreSQL, Redis, and MinIO composition.
scripts/          Local reset, provider probes, and contract validation.
```

Dependency direction should remain one-way: runtime apps may import shared packages; shared packages must not import runtime apps.

## P0 Workflow

```text
create workspace
  -> upload or import product/reference materials
  -> approve prompt requirements, material intake, product brief, storyboard, shotprompt
  -> apply shot set
  -> generate and select per-shot images
  -> generate and select per-shot videos
  -> compose final video
  -> import final video into dashboard registry
```

## Compatibility Rule

During migration, compatibility copies may remain under `docs/core/`. The canonical project docs live under `docs/`, and validation should prefer `docs/contracts/openapi.yaml`.
