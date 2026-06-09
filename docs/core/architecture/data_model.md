# Service Artifact Data Model

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Backend service payloads and artifact JSON used by `apps/server`
Depends On: `packages/shared/src/schemas/artifacts.ts`, `packages/shared/src/schemas/creative-factors.ts`, `apps/server/src/db/schema/schema.sql`
Blocks: Artifact JSON shape changes without service/docs/tests update
Decision State: Accepted

## 1. Executive Summary

This document is the service-facing artifact contract. It explains the JSON payloads that backend services validate, persist, and pass to downstream modules. Database table ownership is documented in `erd.md`; HTTP paths are documented in `contracts/openapi.yaml`.

## 2. Current Reality

The current code uses Zod schemas from `packages/shared` for workspace module artifact data, creative factors, storyboard validation, and creative tags. Per-shot image/video artifacts are assembled in `apps/server/src/modules/shot/prompt-assembler.ts`.

## 3. Target State

### Common Workspace Module Artifact

Each workspace module artifact table stores:

| Field | Meaning |
|---|---|
| `id` | Artifact id. |
| `workspaceId` | Owning workspace. |
| `moduleId` | `prompt-requirements`, `material-intake`, `product-brief`, `storyboard`, or `shotprompt`. |
| `status` | `proposed`, `approved`, `archived`, or `failed`. |
| `isCurrent` | True only for current approved artifact. |
| `data` | Module-specific structured artifact. |
| `sourceFingerprint` | Upstream artifact ids read when this artifact was created. |
| `promptAssembly` | Prompt template/assembler metadata and preview. |
| `createdAt/updatedAt/approvedAt` | Lifecycle timestamps. |

### `prompt_requirements_artifacts.data`

Canonical schema: `creativeFactorRequirementsDataSchema`.

| Field | Meaning |
|---|---|
| `creativeFactors` | Four-factor tags: `productCategory`, `dealType`, `audience`, `strategy`. |
| `factorGuidance` | Expanded guidance packs for product category, deal type, audience, and strategy. |
| `image`, `script`, `storyboard`, `shotImage`, `shotVideo` | Seven compiled global requirements consumed by downstream prompts. |
| `compiledRequirementSourceMap` | Mapping from guidance fields to compiled requirement fields. |
| `factorPromptVersion` | Current factor prompt version, e.g. `factor-prompt.2026-06-08`. |
| `factorComboKey` | Stable factor tuple key. |
| `compiledRequirementsHash` | Stable hash of compiled requirements. |
| `attributionEligible` | Must be true for current compiled factor requirements. |
| `creativeRequirementTemplate` | Optional preset source snapshot. |

Current code intentionally replaced the older `productType + visualStyle` model with `productCategory + dealType + audience + strategy`.

### `material_intake_artifacts.data`

Canonical schema: `materialIntakeArtifactSchema`.

| Field | Meaning |
|---|---|
| `scannedAt` | Scan timestamp. |
| `primaryProductRef` | The only primary product material ref. |
| `assets[]` | `ref`, `kind`, `mime`, `bytes`, `sha256`, `role`, `description`, `relevance`, `usable`, `included`. |
| `rejected[]` | Rejected material refs and reasons. |

`normalizeMaterialIntakePrimaryRole` ensures only `primaryProductRef` keeps `product_main`.

### `product_brief_artifacts.data`

Canonical schema: `productBriefArtifactSchema`.

Fields: `product`, `audience`, `coreSellingPoint`, `proof[]`, `offer`, `platform`, `brandTone`, `bannedExpressions[]`, `landingInfo`, `assumptions[]`.

### `storyboard_artifacts.data`

Canonical schema: `storyboardArtifactSchema`.

Fields: `narrative`, `totalDurationSec`, `shots[]`, `assumptions[]`. Each shot includes `index`, `purpose`, `durationSec`, `scene`, `visualDirection`, `productAssetRef`, `voiceover`, and `transition`.

P0 storyboard validation currently enforces a 15-second three-shot script in service boundaries that require the P0 format.

### `shot_prompt_artifacts.data`

Canonical schema: `shotPromptArtifactSchema`.

Fields: `targetProvider='seedance'`, `durationSec`, `aspectRatio`, `prompt`, `negativePrompt`, `shots[]`, `tts`, and `assumptions[]`.

Each shot must include `index`, `startSec`, `endSec`, `providerPrompt`, `referenceAssetRefs`, `voiceover`, and may include structured `shotImage`/`shotVideo`. Services enrich missing `shotImage`/`shotVideo` defaults before approval/apply and validate shot count/order against the approved storyboard.

### Shot Set and Per-Shot Artifacts

| Artifact | Source | Service rule |
|---|---|---|
| `shot_prompt_requirements` | `shot_prompt_artifacts.data.shots[].shotImage/shotVideo` | One row per shot; image/video deterministic assemblers read this. |
| `shot_asset_refs` | Material refs from shotprompt or user edits | Roles normalize to `product_identity`, `reference_style`, `reference_scene`, `first_frame_hint`, `other`. |
| `image_prompt_artifacts` | Deterministic image assembler | Versioned per shot; new ACTIVE row stales old ACTIVE row. |
| `video_script_artifacts` | Deterministic video assembler | Versioned per shot; stores first/last frame ids, voice profile hash, and provider prompt. |
| `image_select_artifacts` | User/system selection | One current image candidate per shot. |
| `video_select_artifacts` | User/system selection | One current stable video candidate per shot. |

### Orchestrator Job Data

| Job table | Meaning |
|---|---|
| `one_click_final_video_jobs` | Stage state for automatic material-intake approval through final compose. |
| `shot_image_auto_selection_jobs` | Stage state for batch image generation and first-success selection. |
| `generation_jobs` | Queue mirror for image/video candidate and final compose workers. |

### 成片创作归因 (`creative-attribution`)

Final compose writes:

```json
{
  "schemaVersion": "creative-attribution",
  "promptRequirementsArtifactId": "string-or-null",
  "shotPromptArtifactId": "string-or-null",
  "creativeFactors": {
    "productCategory": "consumer-electronics",
    "dealType": "search-standard",
    "audience": "youth",
    "strategy": "review-comparison"
  },
  "factorPromptVersion": "factor-prompt.2026-06-08"
}
```

Dashboard video artifacts store a single non-null four-factor `creativeFactors` object (`productCategory`, `dealType`, `audience`, `strategy`) plus an internal media storage locator. The factors are derived at import time from the final video job's `compiledManifest.creativeAttribution.creativeFactors` (the snapshot the final compose already resolved); import fails with `FINAL_VIDEO_MISSING_CREATIVE_FACTORS` when that value is absent or incomplete. Dashboard artifacts no longer persist `creativeTags`, attribution schema/version, prompt/shot artifact ids, or a `metadata` blob — `creative-attribution` is read once at import, not stored on the dashboard row.

The dashboard is a **decoupled published-video registry**: `workspace_id` and `final_video_job_id` are soft text references (no foreign key, no cascade), `final_video_job_id` carries a partial unique index as the idempotency/trace key, and a dashboard artifact survives deletion of its originating workspace (row, copied bytes, and trace are retained; deletion-survival applies only to videos imported before the workspace was deleted). Dashboard copies live in dashboard-owned storage, independent of any workspace storage binding: LOCAL copies under `config.dashboardAssetDir`, and S3 copies in the dedicated `DASHBOARD_S3_BUCKET` at `dashboard/{artifactId}/video.mp4` and `dashboard/{artifactId}/metadata.json`. API consumers still receive server proxy URLs.

## 4. Contracts / Interfaces

- HTTP payloads reference these shapes through `contracts/openapi.yaml`.
- Service code should import shared schemas instead of accepting untyped artifact JSON.
- `sourceFingerprint` fields use current code spelling such as `promptRequirementsArtifactId`, `materialIntakeArtifactId`, `productBriefArtifactId`, `storyboardArtifactId`, and `shotPromptArtifactId`.

## 5. Implementation Slices

- Four-factor requirements and template source tracking.
- Module artifact lifecycle and upstream fingerprints.
- Shot set apply and shot requirements persistence.
- Per-shot image/video deterministic assembly.
- Final compose attribution.

## 6. Acceptance Tests

- `pnpm --filter @aigc-video/shared test`
- `pnpm --filter @aigc-video/server test`
- `pnpm contract:frontend-backend`

## 7. Open Decisions

- Expand generated OpenAPI schemas if a typed client generator is introduced.

## 8. Related Docs

- `architecture/erd.md`
- `architecture/agent.md`
- `contracts/interface.md`
