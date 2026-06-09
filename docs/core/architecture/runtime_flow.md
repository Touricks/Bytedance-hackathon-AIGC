# Runtime Flow

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: V3 creative generation lifecycle
Depends On: `architecture/domain.md`, `contracts/interface.md`
Blocks: Runtime behavior changes without lifecycle/test updates
Decision State: Accepted

## 1. Executive Summary

Runtime flow is review-gated until the shot set is applied. After apply, per-shot image/video generation and final compose are asynchronous through `generation` jobs. One-click final video and shot image auto-selection orchestrate existing modules instead of creating separate business facts.

## 2. Current Reality

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
```

One-click final video starts from a material-intake draft, approves it, then advances the same downstream artifacts, selections, and final compose. Shot image auto-selection only automates the image side for the active shot set.

## 3. Target State

### Propose / Approve

- `propose` creates待审创作产物 and never becomes downstream input.
- `approve` inserts a new approved/current row and makes old approved rows non-current.
- Approved/current is the only source read by downstream modules.

### Shot Set Apply

- `shotprompt approve` does not create shots.
- `POST /api/workspaces/:workspaceId/shot-sets` creates the active 分镜链路实例.
- Applying a new shot set archives the previous active set but preserves all historical rows.

### Per-Shot Runtime

- Image prompt propose creates an ACTIVE `image_prompt_artifacts` version and an image batch.
- Video script propose requires image selections and creates an ACTIVE `video_script_artifacts` version and async video candidate jobs.
- Video candidates are selectable only after stable workspace persistence sets `status='SUCCEEDED'` and `videoUrl/objectKey`.

### Final Compose

- Final compose requires every active shot-set shot to have a selected video.
- The final job snapshots the shot set, source video candidate ids, source video script artifact ids, and `creative-attribution`.

## 4. Contracts / Interfaces

- `Idempotency-Key` is required for retry, final compose, one-click final video, and image auto-selection.
- `candidateCount` is an operation parameter bounded by server config, not a 创作要求 field.
- `upstreamChanged` is computed by comparing saved `source_fingerprint` to current approved source ids.

## 5. Implementation Slices

1. Workspace module lifecycle services.
2. Shot-set apply transaction.
3. Per-shot deterministic prompt assembly.
4. BullMQ worker candidate generation.
5. Final compose and attribution snapshot.
6. Dashboard import and campaign metrics.

## 6. Acceptance Tests

- `pnpm --filter @aigc-video/server test`
- Targeted shot/generation worker tests.
- Contract check for path/method coverage.

## 7. Open Decisions

- Runtime progress percentages remain frontend-derived from `currentStage/stageState`; the API does not expose a canonical numeric progress field.

## 8. Related Docs

- `architecture/backend.md`
- `architecture/agent.md`
- `testing/e2e_plan.md`

