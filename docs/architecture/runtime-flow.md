# Runtime Flow

Status: Draft
Owner: Project team
Last Updated: 2026-06-20
Applies To: V3 creative generation lifecycle
Depends On: `docs/contracts/interface.md`, `docs/contracts/state-machine.md`
Blocks: Runtime behavior changes without lifecycle and validation updates
Decision State: Proposed

## Main Flow

```text
prompt-requirements approve
  -> material-intake propose / approve
  -> product-brief propose / approve
  -> storyboard propose / approve
  -> shotprompt propose / approve
  -> shot-set apply
  -> image prompt / image batch / image select
  -> video script / video batch / video select
  -> final compose
  -> dashboard import / campaign publication
  -> dashboard diagnosis deep link
```

## Runtime Rules

- `propose` creates reviewable drafts and does not become downstream input.
- `approve` creates the current approved artifact; downstream modules read current approved artifacts.
- Shot set apply creates the active per-shot runtime instance.
- Image/video generation is asynchronous through generation jobs and batch/candidate rows.
- Final compose requires every active shot-set shot to have a selected stable video.
- Dashboard import copies completed final videos into a decoupled dashboard registry.

## Code Evidence

- Workspace lifecycle: `apps/server/src/modules/workspace/*.service.ts`
- Shot state and views: `apps/server/src/modules/shot/shot.state.ts`, `apps/server/src/modules/shot/shot.view.ts`
- Generation workers: `apps/server/src/modules/generation/*.worker.ts`
- Dashboard import: `apps/server/src/modules/dashboard/dashboard-video-artifact.service.ts`
- Frontend projection: `apps/web/src/features/workbench/useWorkbenchViewModel.ts`
