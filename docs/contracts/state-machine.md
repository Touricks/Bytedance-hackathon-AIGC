# State Machine Contract

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: Workflow, shot, batch, candidate, job, and final-video status vocabulary
Depends On: `docs/contracts/interface.md`, `apps/server/src/db/schema/schema.sql`
Blocks: Status changes without frontend/backend/test alignment
Decision State: Proposed

## Canonical Status Sets

| Surface | Values | Evidence |
|---|---|---|
| Shot status | `DRAFT`, `IMAGE_PROMPT_PROPOSING`, `IMAGE_PROMPT_READY`, `IMAGE_PROMPT_EDITED`, `IMAGE_GENERATING`, `IMAGE_CANDIDATES_READY`, `IMAGE_SELECTED`, `VIDEO_SCRIPT_PROPOSING`, `VIDEO_SCRIPT_READY`, `VIDEO_SCRIPT_EDITED`, `VIDEO_GENERATING`, `VIDEO_CANDIDATES_READY`, `VIDEO_SELECTED`, `FAILED` | `apps/server/src/db/schema/schema.sql`, `apps/server/src/modules/shot/shot.state.ts` |
| Artifact status | `DRAFT`, `ACTIVE`, `APPROVED`, `STALE`, `ARCHIVED` | `apps/server/src/db/schema/schema.sql` |
| Batch status | `PENDING`, `RUNNING`, `SUCCEEDED`, `PARTIAL`, `FAILED`, `CANCELLED` | `apps/server/src/db/schema/schema.sql`, `apps/server/src/modules/shot/shot.view.ts` |
| Candidate status | `PENDING`, `RUNNING`, `PERSISTING`, `SUCCEEDED`, `FAILED`, `REJECTED` | `apps/server/src/db/schema/schema.sql` |
| Job status | `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `RETRYING`, `CANCELLED` | `apps/server/src/db/schema/schema.sql` |
| Final video status | `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED` | `apps/server/src/db/schema/schema.sql` |
| Workspace storage status | `ACTIVE`, `ARCHIVED` | `apps/server/src/db/schema/schema.sql` |

## Shot Transition Rules

`apps/server/src/modules/shot/shot.state.ts` is the implementation source for allowed shot transitions and next-action mapping. Frontend labels and buttons must project this state rather than inventing new status names.

## Change Rule

Adding or renaming a status requires updates to the database schema, server state helpers, frontend status presentation, API/OpenAPI examples if exposed, and targeted tests.
