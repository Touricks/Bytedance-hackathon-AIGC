# Domain V1

Status: Accepted
Owner: Domain/API
Last Updated: 2026-06-08
Applies To: V3 core entities, source of truth, lifecycle, and invariants
Depends On: `../product/product_scope_v1.md`, `../archived/erd.md`, `../archived/prompt_artifact.md`
Blocks: DB, API, prompt-chain, and frontend workflow implementation
Decision State: Accepted with assigned open decisions

## 1. Executive Summary

The domain source of truth is module-owned artifacts plus shot-set and per-shot
execution tables. Workspace module artifacts are append-only facts with
current-approved pointers. Shot sets are explicit 分镜链路实例 created only by
apply. Per-shot image/video prompts, candidates, and selections are independent
facts and are not deleted by upstream changes.

## 2. Core Entities

| Entity                | Source of truth                                                                                                | Lifetime                            | Notes                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 创作工作目录          | `creative_workspaces`, workspace storage binding                                                               | Project lifetime                    | Recognized workspace boundary before resume or generation.                                                                |
| 创作要求              | `prompt_requirements_artifacts.data`                                                                           | Proposed/approved append            | Includes `creativeFactors`, 9 factor guidance fields, script influence, and 7 compiled requirement slots.                 |
| 素材                  | `assets`, workspace storage objects                                                                            | Until deleted                       | Material delete validates safe refs and does not automatically rerun downstream.                                          |
| 素材解读              | `material_intake_artifacts.data`                                                                               | Proposed/approved append            | Real service currently passes text context only; image helper exists but is not wired by `materialIntakeV2Service`.       |
| 商品卖点              | `product_brief_artifacts.data`                                                                                 | Proposed/approved append            | Real mode may attach primary material image to Ark text provider.                                                         |
| 分镜脚本              | `storyboard_artifacts.data`                                                                                    | Proposed/approved append            | P0 requires 15 seconds, 3 shots, durations 4/7/4, purposes hook/proof/cta, voiceover <= duration \* 5 chars.              |
| 分镜生成要求          | `shot_prompt_artifacts.data`                                                                                   | Proposed/approved append            | Must match approved storyboard shot count, order, and indexes; includes `shotImage`, `shotVideo`, and `tts.voiceProfile`. |
| 分镜链路实例          | `shot_sets`, `storyboard_shots`, `shot_prompt_requirements`, `shot_asset_refs`                                 | Active/archived                     | Created by explicit shot-set apply; old sets are archived, not physically erased.                                         |
| 分镜图要求 artifact   | `image_prompt_artifacts`                                                                                       | Per-shot versions                   | Built by server deterministic assembler from shot goal, `shotImage`, references, and feedback.                            |
| 分镜图候选/选择       | `image_generation_batches`, `image_candidates`, `image_select_artifacts`, `storyboard_shots.selected_image_id` | Per-round facts/current selection   | Unselected candidates remain available.                                                                                   |
| 分镜视频要求 artifact | `video_script_artifacts`                                                                                       | Per-shot versions                   | Built by server deterministic assembler from shot goal, `shotVideo`, selected frames, voiceover, and voice profile.       |
| 分镜视频候选/选择     | `video_generation_batches`, `video_candidates`, `video_select_artifacts`, `storyboard_shots.selected_video_id` | Per-round facts/current selection   | `PERSISTING` candidates are previewable but not selectable/final-composable until stable.                                 |
| 成片任务              | `final_video_jobs`                                                                                             | Per compose attempt                 | Reads selected videos from the active shot set and writes composed output.                                                |
| 一键成片任务          | `one_click_final_video_jobs`                                                                                   | Per orchestrator attempt            | Reuses existing module artifacts, candidates, selections, and final compose.                                              |
| 分镜图自动选择任务    | `shot_image_auto_selection_jobs`                                                                               | Per image-side orchestrator attempt | Only image side; no video generation or final compose.                                                                    |
| 发布/看板标签         | `campaign_publications`, `dashboard_video_artifacts`                                                           | Publication/import lifetime         | Copies creative tags from final-video manifest or import metadata.                                                        |
| 审计追踪              | `trace_events` and LOCAL `.daireel/trace/*.jsonl` mirrors                                                      | Append-only                         | Full prompts/provider requests are trace facts, not user-facing primary UI language.                                      |

## 3. Aggregates And Invariants

- Workspace module lifecycle is `propose -> approve`; downstream reads only
  `status='approved' and is_current=true`.
- Only approved rows can be current; old current rows are demoted instead of
  deleted.
- `source_fingerprint` records upstream artifact ids for 上游变更提示. It is
  not an invalidation or cleanup command.
- `prompt-requirements` stores structured 创作要求. Raw prompt/system prompt is
  not a merchant-owned artifact.
- `creativeFactors.audience` supports `general` for 「不限定」人群. It means the
  chain should not target a specific age, identity, or family role; it does not
  remove the `creativeFactors.audience` field.
- `factorGuidance.audience.*` may be empty when the merchant deletes the
  「适用人群影响」 fields. Downstream prompt context treats that as
  不限定特定人群 instead of falling back to a default audience.
- `creativeFactors.strategy` supports `visual-story` for 「视觉叙事」. It uses
  product visual texture, material detail, and atmosphere as the selling
  structure.
- `creativeFactors.visualStyle` defaults to `authentic`; current UI does not
  expose it as a separate merchant control. It is preserved as an additive
  creative style control, while dashboard primary aggregation still uses
  `productType + audience + strategy`.
- Workspace module prompt assembly is
  `subject.md + Runtime Context + contract.md` through
  `packages/ai/src/prompts/module-prompt-assembler.ts`.
- 素材解读 has exactly one 主商品素材. `primaryProductRef` is the canonical
  primary material reference; only that asset may carry `role='product_main'`.
  Other product images/videos/text must use detail, packaging, demo, spec, or
  reference roles even when the model returns duplicate 主商品 labels.
- Per-shot image/video artifacts do not use subject/contract agents in the main
  path. `apps/server/src/modules/shot/prompt-assembler.ts` is the source for
  provider-facing per-shot prompts.
- `shotprompt approve` only updates current approved artifact state. It does not
  create or rebuild `storyboard_shots`.
- `POST /api/workspaces/:workspaceId/shot-sets` creates the active
  分镜链路实例 and archives the previous active set.
- Candidate count is an operation parameter bounded by server defaults/max env
  values; it is not persisted in 创作要求.
- One-click final video uses an internal candidate count of `1` for each
  auto-generated image and video batch. This keeps the orchestrator on the
  `first_success` selection contract without changing manual generation
  defaults or user candidate-count preferences.
- Final compose requires every active shot to have a stable selected video.

## 4. Commands And Events

| Command                         | Deterministic owner                                  | Event/fact                                                         |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| propose 创作要求                | `promptRequirementsService.propose`                  | `prompt_requirements_artifacts(status='proposed')`                 |
| approve 创作要求                | `promptRequirementsService.approve`                  | current approved requirements row                                  |
| propose/approve 素材解读        | `materialIntakeV2Service` + AI workflow in real mode | material-intake artifact and trace events                          |
| propose/approve 商品卖点        | `productBriefV2Service` + AI workflow in real mode   | product-brief artifact and optional primary-image provider request |
| propose/approve 分镜脚本        | `storyboardV2Service` + AI workflow in real mode     | storyboard artifact, P0 validation                                 |
| rewrite 分镜口播                | `storyboardV2Service.proposeVoiceover`               | proposed storyboard with `rewriteKind='voiceover'`                 |
| propose/approve 分镜生成要求    | `shotPromptV2Service` + AI workflow in real mode     | shotprompt artifact, storyboard match validation                   |
| apply 分镜链路实例              | `shotSetService.apply`                               | active shot set, shots, shot requirements, asset refs              |
| propose/regenerate 分镜图要求   | `shotWorkflowService`                                | image prompt artifact and image generation batch                   |
| select 分镜图                   | `shotWorkflowService`                                | image select artifact and selected image pointer                   |
| propose/regenerate 分镜视频要求 | `shotWorkflowService`                                | video script artifact and video generation batch                   |
| select 分镜视频                 | `shotWorkflowService`                                | video select artifact and selected video pointer                   |
| compose 成片                    | `generationService` + final compose worker           | `final_video_jobs` and composed asset                              |
| publish campaign                | `campaignService`                                    | `campaign_publications` plus optional metrics                      |
| advance 一键成片                | `oneClickFinalVideoService`                          | existing module artifacts, candidate selections, and final job     |

## 5. Data Lifecycle

```text
browser draft/input
-> shared Zod/API validation
-> module service or deterministic shot service
-> provider call only when runtime mode and module require it
-> module-owned artifact or per-shot artifact
-> batch/candidate/selection facts
-> final compose manifest and campaign/dashboard tag copy
-> trace/audit events
```

## 6. Open Decisions

| Decision                                                           | Owner                  | Current recommendation                                                                                                                             |
| ------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whether material-intake should use image inputs                    | Product + AI + Backend | Keep current service text-only until docs/reference provider behavior and test cost are approved. Product-brief remains the image-grounded module. |
| Whether archived shot sets need merchant-visible history           | Product                | Keep hidden in V1; expose only if workflow review requires compare/restore.                                                                        |
| Whether campaign/dashboard tags need backfill for old final videos | Data + Backend         | Treat as a migration/backfill slice, not implicit runtime behavior.                                                                                |
