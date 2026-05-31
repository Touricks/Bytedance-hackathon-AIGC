# Prompt Manifest

更新时间：2026-05-30

本文说明当前项目如何按照 `docs/plan/prompt.md` 的模块化思路配置各模块 prompt。文件名沿用当前需求中的 `prompt_manifast.md`。

## 1. 总体结构

当前 prompt 配置分三层：

| 层级 | 位置 | 职责 |
|---|---|---|
| Contract / Version | `packages/ai/src/contracts/pipeline.contracts.ts` | 定义 workspace 级模块的 `contractId`、`activeVersion`、prompt builder、provider、输入/输出 schema。支持 `AIGC_VIDEO_PIPELINE_CONTRACT_OVERRIDES` 覆盖版本。 |
| Prompt Builder / Agent Template | `packages/ai/src/prompts/*`、`packages/ai/src/agents/*` | 把结构化输入组装为自然语言 prompt 或 agent instructions，并绑定 prompt version / template version。 |
| Runtime Orchestrator | `apps/server/src/modules/workspace/workspace.service.ts`、`apps/server/src/modules/shot/shot.service.ts` | 读取 artifacts、注入后端上下文、调用 workflow/agent、持久化 artifact/candidates、记录 trace。 |

`prompt.md` 中提到的 module manifest 字段，目前不是一个单独 JSON 文件，而是分散在上述三层中实现。后续如果要做无代码节点化，可以把这些字段抽成显式 registry。

## 2. Manifest 字段映射

| prompt.md 字段 | 当前实现来源 |
|---|---|
| `moduleId` | workspace 级使用 `pipeline.contracts.ts` 的 `id`；shot 级由路由/服务命名约定，如 `image-prompt`、`video-script`。 |
| `triggerEndpoint` | Fastify controller：workspace 模块在 workspace controller，shot 模块在 `shot.controller.ts`。 |
| `requiredArtifacts` | server service 中显式读取：如 brief/storyboard/shotprompt/material artifact、selected image/video。 |
| `backendInjectedInputs` | server service 组装 payload：如 `image_ref`、`number`、`first_frame_url`、`last_frame_url`、`durationSec`。 |
| `userInputs` | request schema。shot 级 propose 现在只接受 `{ userDirection? }`。 |
| `agentRunner` | `packages/ai/src/workflows/*`。workspace 级多为 `generate*WithArk`，shot 级为 `runStoryboardImagePromptAgent` / `runVideoShotScriptAgent`。 |
| `providerInvoker` | 文本模块走 Ark text provider；image/video candidates 走 `direct-generation.ts` 中的 Ark image / Seedance video provider。 |
| `outputArtifact` | workspace artifact 表或 shot artifact 表：`workspace_artifact`、`image_prompt_artifacts`、`video_script_artifacts`。 |
| `candidateStore` | `image_generation_batches` + `image_candidates`；`video_generation_batches` + `video_candidates`。 |
| `selectionGate` | `image-candidates/select`、`video-candidates/select`。 |
| `stalePolicy` | artifact versioning/stale rules；selection 本身不触发 stale。re-propose 产生新 ACTIVE 轮次。 |

## 3. Workspace 级模块

### `material-intake`

- Trigger: `POST /api/workspaces/material-intake`
- Prompt config:
  - Contract id: `material_intake`
  - Version: `material-intake.v1`
  - Builder: `buildMaterialIntakePrompt`
  - Prompt file: `packages/ai/src/prompts/material-intake.prompt.ts`
  - Workflow: `packages/ai/src/workflows/material-intake.workflow.ts`
- Required inputs:
  - workspace material library
  - selected material refs, if provided
  - optional initial prompt
- Runtime behavior:
  - Server scans/binds materials, builds prompt view, calls Ark in real mode.
  - Output is persisted as approved `assets` artifact.

### `product-brief`

- Trigger: `POST /api/workspaces/brief/propose`
- Prompt config:
  - Contract id: `product_brief`
  - Version: `product-brief.v1`
  - Builder: `buildProductBriefPrompt`
  - Prompt file: `packages/ai/src/prompts/product-brief.prompt.ts`
  - Workflow: `packages/ai/src/workflows/product-brief.workflow.ts`
- Required artifacts:
  - approved `assets`
- User inputs:
  - `userDirection`
  - optional title / selling points / audience / style preference
- Runtime behavior:
  - Server injects material artifact and primary product image.
  - Output is persisted as proposed `brief` artifact.
  - Human approval promotes it to approved brief.

### `storyboard`

- Trigger: `POST /api/workspaces/storyboard/propose`
- Prompt config:
  - Contract id: `storyboard`
  - Version: `ugc-storyboard.v1`
  - Builder: `buildStoryboardPrompt`
  - Prompt file: `packages/ai/src/prompts/storyboard.prompt.ts`
  - Workflow: `packages/ai/src/workflows/storyboard.workflow.ts`
- Required artifacts:
  - approved `brief`
  - approved `assets`
- Runtime behavior:
  - Server injects brief + material.
  - Output is persisted as proposed `storyboard`.
  - Human approval writes approved storyboard artifact.

### `shotprompt`

- Trigger: `POST /api/workspaces/shotprompt/compile`
- Prompt config:
  - Contract id: `shotprompt`
  - Version: `video-shotprompt.v1`
  - Builder: `buildShotPromptPrompt`
  - Prompt file: `packages/ai/src/prompts/shotprompt.prompt.ts`
  - Workflow: `packages/ai/src/workflows/shotprompt.workflow.ts`
- Required artifacts:
  - approved `brief`
  - approved `assets`
  - approved `storyboard`
- Backend injected inputs:
  - `aspectRatio`, default `9:16`
- Runtime behavior:
  - Output is persisted as proposed `shotprompt`.
  - Approval seeds `storyboard_shots` and `shot_asset_refs`, which become the shot-level runtime source.

### `feedback-route`

- Trigger: feedback route endpoint in workspace workflow.
- Prompt config:
  - Contract id: `feedback_route`
  - Version: `feedback-route.v1`
  - Builder: `buildFeedbackRoutePrompt`
  - Prompt file: `packages/ai/src/prompts/feedback-route.prompt.ts`
  - Workflow: `packages/ai/src/workflows/feedback-route.workflow.ts`
- Required artifacts:
  - latest brief / storyboard / shotprompt artifacts
- Runtime behavior:
  - Routes user feedback to the artifact that should be revised.
  - Output is a routing decision, then workspace service applies the target revision flow.

## 4. Shot 级模块

Shot 级模块已经按 `prompt.md` 的直出候选目标重构：前端不再触发独立 batch，也不直接 PATCH prompt/script 文本。用户意图统一通过 `userDirection` 进入 propose。

### `image-prompt`

- Trigger: `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose`
- User inputs:
  - `{ userDirection? }`
- Prompt config:
  - Template version: `v1`
  - Agent builder: `buildStoryboardImagePromptAgent`
  - System prompt: `packages/ai/src/prompts/storyboard-image-prompt/v1.system.md`
  - Workflow: `packages/ai/src/workflows/storyboard-image-prompt.workflow.ts`
- Required artifacts / state:
  - approved material intake
  - approved brief
  - approved shotprompt / seeded `storyboard_shots`
  - shot asset refs
  - for shot N>=1: previous shot selected image
- Backend injected inputs:
  - `workspaceId`
  - `shotId`
  - `number`
  - `image_ref`
  - material intake artifact
  - shot prompt fields
  - product/reference asset refs
  - previous image prompt text when available
- Provider invocation:
  - After agent output, server creates ACTIVE `image_prompt_artifacts`.
  - Server creates an internal `image_generation_batches` row.
  - `runImageGenerationBatch` calls Ark Seedream and persists stable candidate URLs.
- Output:
  - response returns `{ artifact, batch, candidates, created, usage, traceId, context }`
  - candidates are persisted in `image_candidates`
- Selection:
  - `POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select`
  - select only upserts current chosen image and does not stale downstream artifacts.

### `video-script`

- Trigger: `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose`
- User inputs:
  - `{ userDirection? }`
- Prompt config:
  - Template version: `v1`
  - Agent builder: `buildVideoShotScriptAgent`
  - System prompt: `packages/ai/src/prompts/video-shot-script/v1.system.md`
  - Workflow: `packages/ai/src/workflows/video-shot-script.workflow.ts`
- Required artifacts / state:
  - approved brief
  - seeded storyboard shot
  - current shot selected image
  - all shots must have selected images before video propose
  - next shot selected image when current shot is not the last shot
- Backend injected inputs:
  - `workspaceId`
  - `shotId`
  - `number`
  - `first_frame_url`
  - `last_frame_url`
  - `durationSec` from `storyboard_shots.default_duration_sec`
  - shot voiceover
  - selected image metadata
  - previous video script when available
- Provider invocation:
  - After agent output, server creates ACTIVE `video_script_artifacts`.
  - Server creates an internal `video_generation_batches` row.
  - `runVideoGenerationBatch` calls Seedance, waits for terminal result, and persists stable candidate URLs.
- Output:
  - response returns `{ artifact, batch, candidates, traceId, context, frames }`
  - candidates are persisted in `video_candidates`
- Selection:
  - `POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select`
  - response duration comes from storyboard/default shot duration.
  - select does not stale downstream artifacts.

## 5. Selection / Rounds / Compose

| Module | Read API | Select API | Compose dependency |
|---|---|---|---|
| `image-prompt` | `GET /api/workspaces/:workspaceId/shots/:shotId/image-rounds` | `POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select` | Video script uses selected image as frame input. |
| `video-script` | `GET /api/workspaces/:workspaceId/shots/:shotId/video-rounds` | `POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | Final compose reads current `selected_shot_videos`. |

Final compose remains a pull model: it does not call text/image/video providers. It reads selected video candidates and concatenates the stable workspace-local video files.

## 6. Prompt Versioning Rules

- Workspace modules use prompt versions from `pipeline.contracts.ts`.
- Shot modules use agent template versions from `packages/ai/src/agents/*`.
- Prompt version / template version is stored in artifacts:
  - workspace artifact trace includes `promptVersion`
  - `image_prompt_artifacts.prompt_template_version`
  - `video_script_artifacts.prompt_template_version`
- Provider traces include contract/version metadata where available.
- To override workspace prompt versions without code changes, use `AIGC_VIDEO_PIPELINE_CONTRACT_OVERRIDES`.

## 7. Current Gaps Toward A Single Manifest

The code now follows the runtime behavior described in `prompt.md`, but the manifest is still implicit. A future explicit registry should include:

```ts
interface PromptModuleManifest {
  moduleId: string;
  triggerEndpoint: string;
  requiredArtifacts: string[];
  backendInjectedInputs: string[];
  userInputs: string[];
  agentRunner: string;
  providerInvoker?: string;
  outputArtifact: string;
  candidateStore?: string;
  selectionGate?: string;
  stalePolicy: string;
}
```

That registry can then generate workflow graph JSON, API documentation, trace labels, and Postman/Newman test expectations from the same source.
