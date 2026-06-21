# Domain Architecture

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Merchant creative review domain model
Depends On: `CONTEXT.md`, `product/product_scope.md`
Blocks: Feature work that changes domain ownership or lifecycle
Decision State: Accepted

## 1. Executive Summary

The domain is centered on one 创作工作目录 and one current 创作线路. Users review structured artifacts, approve them into current facts, and explicitly create or update downstream generation work. Raw provider prompts are system-owned implementation details.

## 2. Current Reality

The current code implements:

- `creative_workspace` as the workspace identity row.
- `workspace_storage_bindings` as LOCAL/S3 storage location.
- Module-owned artifact tables for workspace creative outputs.
- `shot_sets` as 分镜链路实例.
- `storyboard_shots` plus per-shot prompt/candidate/selection tables.
- `final_video_jobs`, `dashboard_video_artifacts`, `campaign_publications`, and `campaign_publication_metrics` for output and attribution.

## 3. Target State

| Domain concept | Current owner | Rule |
|---|---|---|
| 创作工作目录 | `creative_workspace` + active storage binding | DB row is business state; local `.daireel/workspace.json` is durable local identity. |
| 创作要求 | `prompt_requirements_artifacts` | Four-factor structured data; users do not edit system prompts. |
| 素材解读 | `material_intake_artifacts` | Owns material roles, primary product ref, usable/included decisions. |
| 商品卖点 | `product_brief_artifacts` | Owns product, audience, selling point, proof, offer, platform, tone. |
| 分镜脚本 | `storyboard_artifacts` | Owns narrative and shot beats before provider-facing requirements. |
| 分镜生成要求 | `shot_prompt_artifacts` | Owns per-shot `shotImage` and `shotVideo` requirements. |
| 分镜链路实例 | `shot_sets` | Created only by explicit apply; old active set becomes archived. |
| 分镜图选择 | `image_select_artifacts` | One current selection per shot; unselected candidates remain available. |
| 分镜视频选择 | `video_select_artifacts` | One current stable video selection per shot. |
| 成片 | `final_video_jobs` | Bound to the shot set and selected videos used at creation time. |
| 数据看板视频 | `dashboard_video_artifacts` | Imported copy and attribution snapshot for dashboard video list. |
| 发布记录 / 投放数据 | `external_kol_publications` / `external_kol_metrics` | A KOL/channel placement of a final video (`jobId` reference, validated to the workspace); cumulative metric snapshots are separate append-only rows. |

## 4. Contracts / Interfaces

- Workspace module state returns `proposed`, `current`, and `upstream`.
- Downstream `upstreamChanged` is a warning, not an invalidation.
- Selection endpoints use upsert semantics and must not delete candidates.
- Final compose reads selected videos from the active shot set only.

## 5. Implementation Slices

- Artifact lifecycle: module services insert proposed/approved rows and maintain current pointers.
- Shot set apply: validates approved storyboard/shotprompt boundaries and creates shot execution anchors.
- Candidate selection: validates candidate ownership/status and updates selection rows.
- Attribution: final compose snapshots 成片创作归因; dashboard import parses dashboard-facing factors.

## 6. Acceptance Tests

- Workspace module API tests.
- Shot set service/controller tests.
- Image/video selection tests.
- Final compose/dashboard/campaign API tests.

## 7. Open Decisions

- Archived shot sets are exposed as read-only history for preview/download. They
  are not reactivated, migrated into the active instance, or used as generation
  references.

## 8. Related Docs

- `architecture/data_model.md`
- `architecture/erd.md`
- `architecture/runtime_flow.md`
