# Persistence Boundary

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Durable records, queues, storage, and compatibility boundaries
Depends On: `docs/contracts/state-machine.md`, `apps/server/src/db/schema/schema.sql`
Blocks: Persistence or storage changes without durable-source ownership
Decision State: Proposed

## Durable Sources

| Boundary | Durable source | Evidence |
|---|---|---|
| Workspace identity and manifests | PostgreSQL workspace rows plus `.daireel/workspace.json` | `workspace.service.ts`, `workspace.schema.ts` |
| Review artifacts | Module artifact tables with proposed/current approved semantics | `workspace/*.service.ts`, `packages/shared/src/schemas/artifacts.ts` |
| Shot runtime | Shot set, shot, prompt/script, batch, candidate, and selection tables | `shot.service.ts`, `generation/*.worker.ts` |
| Async execution | BullMQ plus `generation_jobs` mirror tables | `job.queue.ts`, `job.repository.ts`, generation workers |
| Workspace media | Active storage binding, local or S3-compatible workspace storage | `workspace/storage/*.ts` |
| Dashboard media | Dashboard-owned copied video assets and registry rows | `dashboard-video-artifact.service.ts`, `dashboard-asset-storage.ts` |

## Boundary Rules

- Dashboard video artifacts are decoupled published-video registry rows; workspace deletion must not silently erase already imported dashboard videos.
- API consumers receive server proxy URLs rather than direct local paths or S3 object addresses.
- Queue state may drive polling, but durable business facts must be persisted before the frontend can select or compose them.
- `creative_workspace.display_name` is user-facing metadata only; workspace ids and LOCAL/S3 object keys remain stable when it changes.
- Compatibility copies under legacy docs do not own data semantics.

## Change Rule

Schema, storage key, queue payload, or retention changes must update this document and the relevant contract or state-machine document before being considered ready.
