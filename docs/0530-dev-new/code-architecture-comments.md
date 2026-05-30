# Code Architecture Comments

更新时间：2026-05-30

本文不是代码改动，而是给 0530 后端实现时应补的“架构注释”清单。注释只解释业务不变量和边界，不复述代码本身。

## 注释原则

- 写在 controller/service/worker 的关键分叉点附近。
- 解释“为什么必须这样做”，例如 provider 边界、select 不 stale、路径安全、幂等。
- 不把注释写成需求文档；需求归 `docs/0530-dev/backend-development-plan.md` 与 OpenAPI。
- 不在 repository 层解释产品逻辑，repository 只注释 SQL 约束或事务原因。

## 建议补充位置

| 文件 | 位置 | 建议注释内容 |
|---|---|---|
| `apps/server/src/app.ts` | `sendWorkspaceFile` / static routes | 说明 workspace file route 是稳定读取路径，必须把目标文件限制在 `.daireel/materials` 或 `.daireel/videos` 内，避免 path traversal。 |
| `apps/server/src/modules/workspace/workspace.controller.ts` | route 注册顶部 | 说明 workspace controller 只负责 workspace 级 artifact pipeline；per-shot workflow 放在 shot controller，避免两条状态机混在同一 controller。 |
| `apps/server/src/modules/workspace/workspace.service.ts` | storage bind / resolve storage | 说明 workspace 是逻辑记录，localPath 与 S3 `bucket+prefix` 都是 storage binding；一个 workspace 只能有一个 active binding，一个 storage target 也只能属于一个 workspace。 |
| `workspace.service.ts` | material intake 文件扫描/上传路径 | 说明 agent 只能看到后端校验后的素材清单；文件名、mime、sha256 由后端生成，不能让模型编造。 |
| `workspace.service.ts` | brief/storyboard propose | 说明 Ark text 只产出待用户确认的 artifact 草稿，不能直接推进下游 provider 调用。 |
| `workspace.service.ts` | shotprompt compile/approve | 说明 approved shotprompt 是 shot workflow 的种子；approve 必须在事务中写入 artifact 并 seed `storyboard_shots`。 |
| `packages/shared/src/shotprompt/compiler.ts` | `buildSeedanceVideoExportPrompt` | 说明已确认的 `ShotPromptArtifact` 到 Seedance 成片 prompt 是确定性 compiler，不允许再经过 Ark text 改写；`shots[].providerPrompt` 必须原样进入逐镜头时间线。 |
| `apps/server/src/modules/shot/shot.controller.ts` | workspace-scoped shot routes | 说明 `/api/workspaces/:workspaceId/shots/:shotId/*` 是 0530 唯一公开契约；controller 必须校验 path 中的 workspace 与 shot 归属一致。 |
| `apps/server/src/modules/shot/shot.service.ts` | `proposeImagePrompt` | 说明 `image_ref` 由后端注入：shot 0 用主商品素材建立基准，shot N 用上一 shot selected image 保持场景一致；前端不能传任意 URL。 |
| `shot.service.ts` | `selectImage` | 说明 image select 是用户同步点，只 UPSERT selection 并解锁下一步；select 不触发 stale，只有 re-propose/re-generate 才 stale。 |
| `shot.service.ts` | `proposeVideoScript` | 说明视频生成以首尾帧为锚；必须等所有 shots 都 image-selected，才能为每个 shot 注入 first/last frame 并并行生成。 |
| `shot.service.ts` | `selectVideo` | 说明 video select 是 final compose 的同步点；final compose 是拉模式，每次按当下 selection 读取，不缓存旧选择。 |
| `apps/server/src/modules/generation/generation.service.ts` | create image/video/final job | 说明 idempotency key 是任务创建边界，避免重复点击创建重复 provider 任务；dedupe 返回已有 batch/job。 |
| `apps/server/src/modules/generation/image.worker.ts` | provider URL 持久化 | 说明 Ark/Seedream 返回 URL 可能 24 小时过期，入库前或 select 前要转存为稳定 workspace URL。 |
| `apps/server/src/modules/generation/video.worker.ts` | Seedance request build | 说明 Seedance request 只消费 video script artifact、first_frame、last_frame、duration，不再调用文本模型补写 prompt。 |
| `apps/server/src/modules/generation/final-compose.worker.ts` | concat manifest | 说明 final compose 的输入来自 `selected_shot_videos` 当前快照；如果用户换视频，需要重新触发 compose 生成新的 final job。 |
| `packages/ai/src/providers/provider-boundary.guard.test.ts` | 测试顶部 | 说明 provider boundary 测试是架构护栏：video export 阶段不得调用 Ark text provider。 |

## 建议代码注释模板

### approved shotprompt -> Seedance prompt

```ts
// Architecture invariant: once a ShotPromptArtifact has been approved by the user,
// video export must use deterministic compilation only. Do not call Ark text here;
// every shot providerPrompt must stay traceable to the approved artifact.
```

### image select

```ts
// Image selection is a synchronization point, not a regeneration event.
// Re-selecting a candidate updates the current key frame only; stale is handled
// by re-propose/re-generate paths so existing user choices remain auditable.
```

### video script frame injection

```ts
// Seedance continuity is anchored by backend-owned frames: this shot's selected
// image is first_frame, the next shot's selected image is last_frame. The client
// must not provide arbitrary frame URLs.
```

### idempotent generation job

```ts
// Idempotency-Key is the public dedupe boundary for provider jobs. If the user
// double-clicks generate, return the existing batch/job instead of enqueueing a
// second provider call.
```

## 不建议写的注释

- “调用 service 创建 batch”这类复述函数名的注释。
- 把完整 Prompt 模板贴在 controller/service 中。
- 在 DB repository 里写用户旅程解释。
- 把 `docs/0529-dev` 的整段需求复制到代码文件。
