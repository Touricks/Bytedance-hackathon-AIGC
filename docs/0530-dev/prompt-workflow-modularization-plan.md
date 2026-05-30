# Prompt Workflow Modularization Plan

更新时间：2026-05-30

本文说明当前 prompt payload / artifact 组装状态，以及如何演进到类似 Dify / OpenAI Agent Builder 的无代码节点化工作流：每个 prompt module 都显式声明输入 artifact、用户输入、prompt builder、provider request、输出 artifact、approval gate 与副作用。

## 当前状态（<100 lines）

| moduleId | triggerEndpoint | requiredArtifacts | optionalUserInputs | contextHydrator | promptBuilder | provider/output contract | outputArtifact | approve / side effect |
|---|---|---|---|---|---|---|---|---|
| `material-intake` | `POST /api/workspaces/material-intake` | storage-bound workspace material library | `prompt`, `selectedMaterialRefs` | `workspace.service.ts` scans local storage, mime, bytes, sha256, text/image previews | `packages/ai/src/prompts/material-intake.prompt.ts` | Ark `response_format` in `packages/ai/src/contracts/response-formats.ts`; parsed by `materialIntakeArtifactSchema` | `workspace_artifact(type=assets,status=approved)` | no extra approve; material intake is approved after scan/tag |
| `product-brief` | `POST /api/workspaces/brief/propose` | `assets` artifact | `userDirection`, `title`, `sellingPoints`, `audience`, `stylePreference` | `workspace.service.ts` loads material artifact and primary product image | `packages/ai/src/prompts/product-brief.prompt.ts` | Ark `response_format`; parsed by `productBriefArtifactSchema` | `workspace_artifact(type=brief,status=proposed)` | `POST /api/workspaces/artifacts/brief/approve` stores approved brief |
| `storyboard` | `POST /api/workspaces/storyboard/propose` | approved `brief`, `assets` artifact | none | `workspace.service.ts` loads brief/material artifacts | `packages/ai/src/prompts/storyboard.prompt.ts` | Ark `response_format`; parsed by `storyboardArtifactSchema` | `workspace_artifact(type=storyboard,status=proposed)` | approve stores approved storyboard |
| `shotprompt` | `POST /api/workspaces/shotprompt/compile` | approved `brief`, `assets`, `storyboard` | `aspectRatio` | `workspace.service.ts` loads artifacts and normalizes aspect ratio | `packages/ai/src/prompts/shotprompt.prompt.ts`; mock path uses `packages/shared/src/shotprompt/compiler.ts` | Ark `response_format`; parsed by `shotPromptArtifactSchema` | `workspace_artifact(type=shotprompt,status=proposed)` | approve stores approved shotprompt and seeds `storyboard_shots` + `shot_asset_refs` |
| `image-prompt` | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | approved `brief`, `assets`, `shotprompt`, seeded shot | `referenceAssetIds`, `userDirection/userHint`, `stylePresetId` | `shot.service.ts` hydrates shot, refs, material descriptions, scene anchor, previous prompt | `packages/ai/src/prompts/storyboard-image-prompt/v1.system.md` via `StoryboardImagePromptAgent` | OpenAI Agent `outputType` with `StoryboardImagePromptOutputSchema` | `image_prompt_artifacts(status=ACTIVE)` | no user approve route; active prompt feeds image batch |
| `video-script` | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | selected image for all shots, current shot, approved `brief/shotprompt` | `durationSec`, `useNeighborFrames`, `userDirection/userHint` | `shot.service.ts` hydrates current/prev/next images and all-shot image selection gate | `packages/ai/src/prompts/video-shot-script/v1.system.md` via `VideoShotScriptAgent` | OpenAI Agent `outputType` with `VideoShotScriptOutputSchema` | `video_script_artifacts(status=ACTIVE)` | no user approve route; active script feeds video batch |
| `feedback-route` | `POST /api/workspaces/feedback/route` | latest `brief`, `storyboard`, `shotprompt` | `feedback`, optional `previousJobId` | `workspace.service.ts` loads current artifacts | `packages/ai/src/prompts/feedback-route.prompt.ts` | Ark `response_format`; parsed by `feedbackRouteArtifactSchema` | `workspace_artifact(type=feedback_route)` plus proposed target artifact | routes feedback to brief/storyboard/shotprompt revision |

当前实现已经能跑通 0530 主链路，但 module 边界仍是“服务代码里的约定”，不是声明式 workflow graph。

## Gap to No-Code Workflow Nodes

- `workspace.service.ts` / `shot.service.ts` 同时承担 hydration、`promptView` 组装、provider 调用选择、artifact 持久化与状态推进，节点边界不够独立。
- Ark text workflow 与 OpenAI Agent workflow 两套输出约束并存：前者用 Ark `response_format`，后者用 Agent `outputType`。
- `promptView` 只是 UI/trace 视图，不是可执行 module manifest，不能单独驱动工作流或渲染节点图。
- required artifacts 由 service 临时读取，没有统一声明式依赖图，也无法自动解释“缺哪个 artifact 就卡在哪个 node”。
- approve 后副作用（例如 seed `storyboard_shots`、写 `shot_asset_refs`、切 workspace status）没有从 prompt module 元数据中显式表达。
- prompt 文本、JSON schema、provider request、artifact schema 分散在 `packages/ai`、`packages/shared`、server service 中，新同学需要跨包追踪。

## Development Plan

### Phase 1: Documented Manifest, No Runtime Change

- 为每个 prompt module 固定一份 manifest 字段：`moduleId`、`triggerEndpoint`、`requiredArtifacts`、`optionalUserInputs`、`contextHydrator`、`promptBuilder`、`provider`、`outputSchema`、`outputArtifact`、`approvalRequired`、`approvalSideEffects`。
- 继续保持现有 API 和 service 逻辑，只把现状映射写清楚，作为后续 refactor 的 contract。
- 在 trace / Postman 文档中统一使用 `moduleId` 名称，避免同一节点被叫作 workflow、agent、artifact step。

### Phase 2: Code Registry

- 新增 prompt module registry，让 workspace / shot service 通过 registry 获取依赖、prompt builder、schema、artifact 写入策略和 approval side effect。
- 把 `promptView` 改成由 manifest 派生：UI 文案、provider、model、contract version、required artifact 摘要都来自同一份配置。
- 保留现有 OpenAPI route shape；controller 仍只负责 Zod parse 和 HTTP error mapping。
- 给 Ark text workflow 和 Agent workflow 包一层统一 adapter：输入是 hydrated payload，输出是 parsed artifact-like object 和 trace metadata。

### Phase 3: Workflow Graph for UI / Trace

- 从 module registry 生成 workflow graph JSON：nodes、edges、input artifacts、output artifacts、approval gates、runtime status。
- 前端按 graph 渲染类似 Dify / Agent Builder 的节点状态：blocked、ready、running、proposed、approved、stale、failed。
- Trace viewer / Postman 使用同一份 graph 标注每次运行属于哪个 module、读了哪些 artifact、产出了哪个 artifact。

## Test Plan

- 文档阶段：校验本文件引用路径存在；当前状态表保持少于 100 行；`docs/0530-dev/README.md` 包含本文入口。
- Registry 阶段：unit test 覆盖每个 module 的 required artifacts、output artifact、approval side effects；API tests 确认现有 endpoint 响应不变。
- Graph 阶段：snapshot test 覆盖 workflow graph JSON；接口 smoke 验证每个 node 能映射到已有 workspace status、artifact status 和 trace event。

## Assumptions

- 当前只做文档和计划，不改 runtime。
- 目标不是立刻复刻 Dify，而是先建立同等清晰的模块边界和可视化元数据。
- 现有 API 路由保持兼容；模块化发生在 service / prompt registry 内部。
- `image-prompt` 与 `video-script` 暂时继续使用 OpenAI Agent `outputType`，后续由统一 adapter 屏蔽和 Ark `response_format` 的差异。
