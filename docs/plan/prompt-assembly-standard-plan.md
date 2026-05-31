# Prompt Assembly 标准版开发计划

更新时间：2026-05-31

目标：在保留 input/output artifact 契约 prompt 的前提下，让用户可以对图像、剧本、分镜图、分镜视频提出结构化自定义要求，并让这些要求稳定进入 workspace builder 与 shot agent 的 prompt 组装过程。

非目标：

- 不允许用户替换完整 system prompt。
- 不允许用户改写 input artifact 说明、output schema、provider 硬约束和 JSON 格式约束。
- 不做单会话的版本追踪和回滚；只保存“当前生效要求”和每次生成 artifact 的 provenance 快照。
- 不建设完整 Prompt Studio、prompt profile 市场或跨项目模板库。

---

## 1. 设计原则

1. 固定契约不可变：输入说明、输出 schema、provider 限制、安全/格式约束永远由代码提供。
2. 用户要求走可控插槽：用户只能填入业务风格、画面偏好、叙事/镜头/运动要求、负向要求等 slot。
3. 生成可复现：每次产出的 artifact 需要保存当次使用的 custom requirements 快照，便于 debug，但不提供回滚 UI。
4. 空要求零影响：没有配置时，现有链路行为保持等价。
5. 不考虑向后兼容：可以直接调整请求 schema、OpenAPI 和前端表单。

---

## 2. 用户要求模型

新增共享 schema：`PromptRequirementsArtifact`

建议字段：

| 字段 | 用途 |
|---|---|
| `globalStyle` | 全局品牌语气、视觉风格、禁用表达。 |
| `materialImage` | 素材/图像理解阶段的关注点，例如产品主体、包装、禁用误读。 |
| `briefScript` | brief / 剧本方向要求，例如受众、卖点优先级、叙事语气。 |
| `storyboard` | 分镜大纲要求，例如镜头数量、节奏、场景变化、转场偏好。 |
| `shotprompt` | 分镜 provider prompt 要求，例如 Seedance 画面描述粒度、口播策略、负向提示。 |
| `shotImage` | 单镜图像候选要求，例如构图、光线、产品露出、参考图使用方式。 |
| `shotVideo` | 单镜视频候选要求，例如 camera motion、subject motion、首末帧连续性、产品可见性。 |
| `negativeRequirements` | 跨模块负向要求，例如不要文字、不要品牌变形、不要过度滤镜。 |

每个 slot 建议使用：

```ts
type PromptRequirementSlot = {
  enabled: boolean;
  instruction: string;
};
```

workspace 级保存一份当前要求；shot 级可以覆盖 `shotImage` / `shotVideo` 两个 slot。

---

## 3. 数据模型

标准版采用“当前态保存”，不做历史版本表。

推荐实现：

1. 复用 `workspace_artifact`
   - 新增 `artifact_type='promptRequirements'`。
   - `status='approved'` 表示当前生效。
   - `data` 存 `PromptRequirementsArtifact`。
   - 由于 `workspace_artifact` 已按 `(workspace_id, artifact_type)` 唯一，天然只保留当前态。

2. 给 `storyboard_shots` 增加当前覆盖字段
   - `prompt_requirements jsonb not null default '{}'::jsonb`
   - 只用于 per-shot 覆盖，不记录历史。

3. provenance 快照
   - `image_prompt_artifacts.prompt_json.context.promptRequirements` 存本次图像 prompt 使用的合并后要求。
   - `video_script_artifacts.script_json.context.promptRequirements` 存本次视频脚本使用的合并后要求。
   - workspace builder 的 trace metadata 存 `promptRequirements` 和 `assemblySections` 摘要。

说明：provenance 快照是 artifact debug 证据，不提供单会话版本追踪或回滚能力。

---

## 4. Prompt Assembly 层

新增模块：`packages/ai/src/prompts/assembly.ts`

核心 API：

```ts
type PromptAssemblyModuleId =
  | "material_intake"
  | "product_brief"
  | "storyboard"
  | "shotprompt"
  | "storyboard_image_prompt"
  | "video_shot_script";

type PromptAssemblyInput = {
  moduleId: PromptAssemblyModuleId;
  contractPrompt: string;
  inputArtifactGuide: string;
  outputSchemaGuide: string;
  providerConstraints: string[];
  runtimeContext: unknown;
  customRequirements: PromptRequirementsArtifact;
};

type PromptAssemblyResult = {
  finalPrompt: string;
  sections: Array<{ id: string; title: string; body: string; locked: boolean }>;
};
```

组装顺序：

1. Contract identity：模块 id、prompt version、provider。
2. Locked input guide：当前模块能读取哪些 artifact / runtime fields。
3. Locked output guide：必须输出的 schema 和字段语义。
4. Locked provider constraints：Ark/Seedream/Seedance 的硬限制。
5. Default module instructions：现有 prompt builder 或 agent system prompt 的业务规则。
6. User custom requirements：按 slot 注入，只能追加要求。
7. Runtime context：素材、brief、storyboard、shotprompt、selected images、neighbor frames 等。

---

## 5. 后端改造

### 5.1 API

新增：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/workspaces/:workspaceId/prompt-requirements` | 读取 workspace 当前自定义要求。 |
| PUT | `/api/workspaces/:workspaceId/prompt-requirements` | 覆盖 workspace 当前自定义要求。 |
| GET | `/api/workspaces/:workspaceId/shots/:shotId/prompt-requirements` | 读取 shot 覆盖要求。 |
| PUT | `/api/workspaces/:workspaceId/shots/:shotId/prompt-requirements` | 覆盖 shot 要求。 |

扩展现有 endpoint request body：

| Endpoint | 新增字段 |
|---|---|
| `material-intake` | `customRequirements?` |
| `brief/propose` | `customRequirements?` |
| `storyboard/propose` | `customRequirements?` |
| `shotprompt/compile` | `customRequirements?` |
| `image-prompts/propose` | `customRequirements?`，继续兼容 `userDirection?` 作为一次性提示。 |
| `video-scripts/propose` | `customRequirements?`，继续兼容 `userDirection?` 作为一次性提示。 |

合并规则：

```text
effective requirements =
  default empty requirements
  + workspace current promptRequirements
  + shot prompt_requirements
  + request customRequirements
  + request userDirection mapped to the relevant slot
```

### 5.2 Service

新增 helper：

- `getWorkspacePromptRequirements(workspaceId)`
- `upsertWorkspacePromptRequirements(workspaceId, data)`
- `getShotPromptRequirements(shotId)`
- `updateShotPromptRequirements(shotId, data)`
- `resolveEffectivePromptRequirements({ workspaceId, shotId?, inline?, userDirection?, moduleId })`

接入位置：

- `workspace.service.ts`
  - `materialIntake`
  - `proposeBrief`
  - `proposeStoryboard`
  - `compileShotPrompt`
  - `routeFeedback` 可读取当前要求辅助路由，但不必第一期暴露编辑。
- `shot.service.ts`
  - `proposeImagePrompt`
  - `proposeVideoScript`

### 5.3 Trace

每次 builder/agent 调用写入：

- `promptRequirementsHash`
- `promptRequirements`
- `assemblySections`
- `finalPromptPreview`

不要新增 prompt history 表。

---

## 6. AI Package 改造

### 6.1 Workspace builder

改造这些 prompt view builder：

- `material-intake.prompt.ts`
- `product-brief.prompt.ts`
- `storyboard.prompt.ts`
- `shotprompt.prompt.ts`
- `feedback-route.prompt.ts` 可延后

每个 builder 输出：

- `promptVersion`
- `contractId`
- `assembly.sections`
- `assembly.finalPrompt`

real provider 调用使用 `assembly.finalPrompt`。

### 6.2 Shot agents

改造：

- `storyboard-image-prompt.agent.ts`
- `video-shot-script.agent.ts`
- `storyboard-image-prompt.workflow.ts`
- `video-shot-script.workflow.ts`

要求：

- system prompt 保留 schema 和硬规则。
- payload 增加 `customRequirements` 或 `promptRequirements`。
- agent instructions 明确：用户要求优先影响风格/内容，但不得突破 output schema 和 provider constraints。
- mock 模式也要把要求反映进 deterministic output，便于测试。

---

## 7. 前端改造

入口：

1. Workspace 设置区：编辑全局 prompt requirements。
2. Builder 阶段表单：允许本次 propose 附带一次性 `customRequirements`。
3. Shot focus 面板：
   - 图像阶段编辑 `shotImage` 要求。
   - 视频阶段编辑 `shotVideo` 要求。

交互原则：

- 保存 workspace/shot 当前要求不触发生成。
- 点击 propose/compile 时才读取当前要求并生成新 artifact。
- 已生成 artifact 不自动回滚；如果要求改变，用户重新 propose 得到新 artifact。

---

## 8. 文档与契约

需要同步更新：

- `docs/core/openapi.yaml`
- `docs/core/interface.md`
- `docs/core/arc_v2.md`
- `docs/core/erd.md`
- `docs/core/prompt_artifact.md`
- `docs/test/postman-test-plan.md`

OpenAPI 需要新增：

- `PromptRequirementSlot`
- `PromptRequirementsArtifact`
- prompt requirements GET/PUT endpoints
- 各 propose/compile request 的 `customRequirements`

---

## 9. 测试计划

单元测试：

- `PromptRequirementsArtifact` schema parse。
- prompt assembler section 顺序和 locked section 不可被覆盖。
- 空 requirements 与旧 prompt 等价。
- inline `userDirection` 正确映射到目标 slot。

API 测试：

- workspace prompt requirements GET/PUT。
- shot prompt requirements GET/PUT。
- brief/storyboard/shotprompt propose 能读取 workspace 要求。
- image/video propose 能读取 workspace + shot + inline 要求。
- provenance 快照落入 `prompt_json/script_json.context.promptRequirements`。

真实链路验收：

- `pnpm realitest`
- `REALITEST_PARALLEL_SHOTPROMPT_SOURCE=fixed pnpm realitest:parallel`
- `node scripts/extract-one-picture-events.mjs` 检查 trace 中存在 prompt requirements 摘要。

---

## 10. 分阶段实施

### Phase 1：Schema 和 API

- 新增 shared schema。
- 复用 `workspace_artifact` 保存 workspace 当前要求。
- 给 `storyboard_shots` 增加 `prompt_requirements`。
- 增加 GET/PUT endpoints。
- 更新 OpenAPI 和 interface 文档。

### Phase 2：Prompt Assembly

- 新增 `prompts/assembly.ts`。
- 改造 workspace prompt builders。
- 增加 assembler 单测。
- real/mock 两种模式都走同一套 assembly 输出。

### Phase 3：Shot Agent 接入

- image prompt agent payload 注入 effective requirements。
- video script agent payload 注入 effective requirements。
- artifact context 保存 requirements 快照。
- 更新 image/video workflow 测试。

### Phase 4：前端入口

- Workspace 全局要求编辑。
- Shot 图像/视频要求编辑。
- Propose/compile 请求带 inline requirements。

### Phase 5：验收和回归

- 跑单元/API 测试。
- 跑 realitest 和 parallel acceptance。
- 用 trace extractor 检查生成链路是否携带 requirements。

---

## 11. 工作量预估

| 模块 | 估计 |
|---|---|
| Schema/API/DB | 0.5-1 天 |
| Prompt assembly 和 AI package 改造 | 1-1.5 天 |
| Shot agent 接入和 provenance | 0.5-1 天 |
| 前端表单和调用 | 1 天 |
| 测试/文档/真实链路验收 | 0.5-1 天 |

总计：约 3.5-5.5 天。范围不含单会话版本追踪、回滚、Prompt Studio 或跨项目模板库。
