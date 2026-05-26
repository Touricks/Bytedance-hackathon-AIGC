# Bug 003: 开发者无法显式配置 0-1-2-3-视频导出链路的 prompt 与 JSON I/O

## 用户反馈

作为开发者，希望能够显式配置 0-1-2-3-视频导出链路中的 prompt 和 JSON input/output。

## 当前代码事实

V1 链路的 prompt 与 schema 已经落到 runtime，但分散在代码中：

- Step 0 素材清点
  - prompt: `packages/ai/src/prompts/material-intake.prompt.ts`
  - output parser: `materialIntakeTagsSchema` + `materialIntakeArtifactSchema`
  - workflow: `packages/ai/src/workflows/material-intake.workflow.ts`
- Step 1 产品概述
  - prompt: `packages/ai/src/prompts/product-brief.prompt.ts`
  - output parser: `productBriefArtifactSchema`
  - workflow: `packages/ai/src/workflows/product-brief.workflow.ts`
- Step 2 UGC 分镜
  - prompt: `packages/ai/src/prompts/storyboard.prompt.ts`
  - output parser: `storyboardArtifactSchema`
  - workflow: `packages/ai/src/workflows/storyboard.workflow.ts`
- Step 3 视频剧本 / shotprompt
  - prompt: `packages/ai/src/prompts/shotprompt.prompt.ts`
  - output parser: `shotPromptArtifactSchema`
  - workflow: `packages/ai/src/workflows/shotprompt.workflow.ts`
- 视频导出
  - prompt builder: `packages/ai/src/prompts/video.prompt.ts`
  - runtime call: `apps/server/src/jobs/processors/media-generate.processor.ts`
  - input source: approved shotprompt -> generated script -> Seedance prompt

JSON output 的类型事实主要在 `packages/shared/src/schemas/artifacts.ts`；JSON input 则散落在 workflow input type、workspace service 参数和上游 artifact 组合中。

### `packages/shared` 当前职责

当前 `packages/shared` 更像是系统公共契约包，而不只是前后端 DTO：

- 前后端共同消费的 domain types：`Asset`, `Script`, `GenerationJob`, `CreativeWorkspace`, `WorkspaceStatus`。
- API request DTO / public interface schema：`createGenerationJobRequestSchema`, `createCreativeBlueprintRequestSchema`。
- 跨包通用状态/常量：`JOB_STAGE_MESSAGES`, queue payload types。
- 系统内部 artifact / generated output schema：`materialIntakeArtifactSchema`, `productBriefArtifactSchema`, `storyboardArtifactSchema`, `shotPromptArtifactSchema`, `generatedScriptSchema`。

这里需要明确边界：`shared` 应回答“系统最终承认、持久化、前端渲染的数据长什么样”；`ai` 应回答“某个 prompt 版本要求模型输入/输出长什么样”。

这两者可能相同，但不应该强制相同。例如 material intake 的模型输出可以是：

```json
{
  "primaryProductRef": "product.png",
  "tags": []
}
```

而系统 artifact 是：

```json
{
  "primaryProductRef": "product.png",
  "assets": [],
  "rejected": []
}
```

中间需要 workflow normalize。normalize 后的 artifact 才适合进入 `packages/shared`。

## 问题判断

这不是“prompt 没接入 runtime”的问题，而是缺少一个开发者可见、可配置、可审计的链路契约层。

当前的问题有三类：

1. prompt 是代码，不是显式 contract
   - 开发者要改 prompt 必须改 TS 文件。
   - prompt version 只在常量里，没有一个统一 pipeline registry。

2. JSON input/output 没有成对展示
   - output schema 可以从 zod 找到。
   - input JSON shape 需要读 workflow/server 拼装逻辑才能理解。
   - 没有单点能看出每一步吃什么、产出什么、传给下一步什么。

3. 视频导出没有并入同一个 0-1-2-3-导出 contract 视图
   - shotprompt artifact 里有 provider prompt。
   - 最终 Seedance 导出又经过 `buildTwelveSecondVideoPrompt(script)` 二次编译。
   - 开发者无法明确判断最终传给视频模型的 prompt 是否就是 step 3 的 `shotPrompt.prompt`，还是经过二次模板化后的 prompt。

## 推荐修复方向

建立一个显式 pipeline contract registry，覆盖 0-1-2-3-video：

```ts
type PipelineStepContract = {
  id: "material_intake" | "product_brief" | "storyboard" | "shotprompt" | "video_export";
  promptVersion: string;
  promptTemplate: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  provider: "ark" | "seedance" | "deterministic";
};
```

### 最小 V1 修复

- 在 `packages/ai` 中建立三层结构：
  - `packages/ai/src/prompts/`：只负责 prompt 文本组装。
  - `packages/ai/src/schemas/`：定义每个 prompt 版本的模型调用 input/output JSON schema。
  - `packages/ai/src/contracts/`：绑定 prompt builder、AI input/output schema、provider、version，并声明目标 shared artifact。
- 每个 step 明确导出：
  - prompt version
  - prompt builder / template
  - prompt-level input JSON schema
  - prompt-level output JSON schema
  - normalize 到 shared artifact 的目标 schema
  - repair prompt（如果有）
- 服务端增加开发者只读 endpoint：
  - `GET /api/workspaces/pipeline-contracts`
  - 返回 0-1-2-3-video 的 prompt/input/output 摘要。
- trace 中记录 contract id/version，并在 request_prepared 中关联该 contract。

### 后续增强

- 支持通过本地配置覆盖 prompt，例如 `.daireel/contracts/*.md` 或 workspace-level overrides。
- 支持在前端开发者面板查看每一步实际 input JSON、prompt、raw output、parsed output。
- 支持导出一次 pipeline run 的完整 contract bundle，便于复现。

## 待确认问题

这些 prompt contract 的“可配置”范围应该到哪一层？

1. 只读显式化：开发者能通过 endpoint/UI 查看 prompt 与 JSON I/O，但修改仍走代码提交。
2. repo 配置化：prompt/template/schema registry 放在版本化配置文件中，服务端启动时读取。
3. workspace 覆盖：每个工作目录可以有 `.daireel/contracts/` 覆盖默认 prompt。

推荐答案：V1 先做 `1 + 2`，暂不做 `3`。理由是现在还在稳定 schema 和状态链路，workspace 级 prompt override 会引入复现、鉴权、版本漂移和历史产物解释问题。先把 contract 版本化、显式化，并提供只读开发者视图，已经能解决“开发者不知道当前 prompt 和 JSON I/O 是什么”的核心 bug。

## 已确认设计边界

- 支持 V1 先做 `1 + 2`：只读显式化 + repo 级版本化配置。
- 不把 `prompts/schemas/contracts` 全部转移到 `packages/shared`。
- prompt-call schemas 放在 `packages/ai/src/schemas/`，因为它们会随 prompt 版本变化。
- domain artifact schemas 继续保留在 `packages/shared/src/schemas/`，因为它们是系统持久化、API 返回、前端渲染的稳定契约。
- workflow 负责将 AI raw output normalize 成 shared artifact。
