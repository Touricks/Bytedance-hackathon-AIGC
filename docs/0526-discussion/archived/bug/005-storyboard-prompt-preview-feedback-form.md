# Bug 005: UGC 分镜的 prompt 预览、动态表单与 feedback 修订

## 用户反馈

作为用户，希望在“生成 UGC 分镜”后：

1. 在 UGC 分镜格内看到本次实际组装并发送给模型的 prompt。
2. prompt 只展示可读 NL 模块，不展示完整 raw JSON / request payload。
3. UGC 分镜 JSON 应被渲染为可编辑表单，而不是只读卡片。
4. feedback 命中 storyboard 时，应生成新的 proposed storyboard，并让用户看到修改点，而不是黑盒追加文本。

## 相关前置决策

Bug 003 已确认建立 pipeline contract registry：

- prompt-call schemas 放在 `packages/ai/src/schemas/`。
- domain artifact schemas 放在 `packages/shared/src/schemas/`。
- workflow 负责将 AI raw output normalize 成 shared artifact。
- V1 先做只读显式化 + repo 级版本化配置，不做 workspace 级 prompt override。

Bug 004 已确认：

- runtime prompt 必须提供可渲染的 `RuntimePromptView`。
- 前端默认只渲染 `nl.title` 与 `nl.sections`。
- artifact 的可编辑字段由 form metadata 驱动。

## 当前代码事实

- `App.tsx` 中 `StoryboardSummary` 只展示 `narrative` 和 `shots` 摘要。
- `proposeWorkspaceStoryboard(workspaceId)` 不接受用户补充方向，也不返回 `promptView`。
- 后端 `proposeStoryboard()` 在 real 模式调用 `generateStoryboardWithArk({ brief, material })`。
- `buildStoryboardPrompt()` 当前返回拼接字符串。
- `storyboardForm` 目前只是 `{ fields: string[] }`，不足以驱动 React 动态表单。
- `routeFeedback()` 通过关键词把 feedback 路由到 storyboard，但当前只把 feedback 追加到第一个 shot 的 `visualDirection`。

## 问题判断

UGC 分镜是从产品概述进入视频表达的关键决策层。当前 UI 只展示摘要，用户无法稳定审阅模型到底基于什么 prompt 生成，也无法逐项修改 scene、visualDirection、voiceover 等字段。

feedback 回环如果只是把用户反馈追加到旧字段，会把“用户反馈”和“分镜结构”混在一起，后续 shotprompt builder 很难判断哪些内容是正式分镜，哪些只是待处理意见。

正确链路应是：

1. 用户确认产品概述。
2. 系统生成 UGC 分镜，并返回 prompt NL preview。
3. 系统用 form metadata 将 `StoryboardArtifact` 渲染为可编辑表单。
4. 用户编辑并确认完整 storyboard。
5. 视频生成后的 feedback 如果路由到 storyboard，应生成新的 proposed storyboard，不覆盖旧视频 job。

## 已确认目标

### 1. UGC 分镜返回 prompt 预览

`POST /api/workspaces/storyboard/propose` 返回：

```ts
type WorkspaceStoryboardDetail = {
  workspace: CreativeWorkspace;
  artifact: WorkspaceArtifact<StoryboardArtifact>;
  promptView: RuntimePromptView;
  form: StoryboardFormContract;
  trace?: Record<string, unknown>;
};
```

前端在“UGC 分镜”格内展示：

- prompt version。
- NL sections，例如：
  - Role
  - Approved product brief
  - Approved material manifest
  - Task
  - Output contract
- 不默认展示完整 raw JSON、完整 request payload 或 provider response。

### 2. UGC 分镜 JSON 字段结构

UGC 分镜模型输出 normalize 后继续使用 `storyboardArtifactSchema`：

```json
{
  "narrative": "string",
  "totalDurationSec": 12,
  "shots": [
    {
      "index": 0,
      "purpose": "hook | benefit | proof | cta",
      "durationSec": 3,
      "scene": "string",
      "visualDirection": "string",
      "productAssetRef": "string",
      "voiceover": "string",
      "onScreenText": "string",
      "transition": "string"
    }
  ],
  "assumptions": ["string"]
}
```

### 3. UGC 分镜动态表单 metadata

Storyboard contract 必须提供 form metadata：

```ts
type StoryboardFormContract = {
  artifactType: "storyboard";
  artifactSchemaVersion: "storyboard-artifact.v1";
  fields: Array<{
    path: string;
    label: string;
    component:
      | "textarea"
      | "number"
      | "select"
      | "asset_ref"
      | "string_list"
      | "shot_repeater";
    required: boolean;
    source?: "material.assets" | "static";
    options?: string[];
    helpText?: string;
  }>;
};
```

V1 storyboard 表单字段：

```json
[
  {
    "path": "narrative",
    "label": "整体叙事",
    "component": "textarea",
    "required": true
  },
  {
    "path": "totalDurationSec",
    "label": "总时长",
    "component": "number",
    "required": true
  },
  {
    "path": "shots",
    "label": "分镜列表",
    "component": "shot_repeater",
    "required": true
  },
  {
    "path": "shots[].purpose",
    "label": "分镜目的",
    "component": "select",
    "required": true,
    "source": "static",
    "options": ["hook", "benefit", "proof", "cta"]
  },
  {
    "path": "shots[].durationSec",
    "label": "分镜时长",
    "component": "number",
    "required": true
  },
  {
    "path": "shots[].scene",
    "label": "场景",
    "component": "textarea",
    "required": true
  },
  {
    "path": "shots[].visualDirection",
    "label": "视觉方向",
    "component": "textarea",
    "required": true
  },
  {
    "path": "shots[].productAssetRef",
    "label": "引用素材",
    "component": "asset_ref",
    "required": true,
    "source": "material.assets"
  },
  {
    "path": "shots[].voiceover",
    "label": "旁白",
    "component": "textarea",
    "required": true
  },
  {
    "path": "shots[].onScreenText",
    "label": "画面文字建议",
    "component": "textarea",
    "required": true
  },
  {
    "path": "shots[].transition",
    "label": "转场",
    "component": "text",
    "required": true
  },
  {
    "path": "assumptions",
    "label": "模型假设",
    "component": "string_list",
    "required": false
  }
]
```

### 4. Feedback 修订行为

当 feedback route 判定 `targetArtifact = "storyboard"` 时：

- 系统应创建新的 proposed storyboard。
- 新 storyboard 应是结构化 `StoryboardArtifact`，而不是在旧字段后追加 feedback 文本。
- route artifact 记录 `previousJobId`，确保旧视频仍可按 jobId 访问。
- 前端展示 route target、route reason 和新的 storyboard 表单。

## API/Contract 调整建议

### Storyboard proposal request

```ts
type StoryboardProposalRequest = {
  workspaceId: string;
  userDirection?: string;
};
```

`userDirection` 是可选的补充方向，不替代 approved brief。

### Storyboard feedback repair request

```ts
type StoryboardFeedbackRepairInput = {
  currentStoryboard: StoryboardArtifact;
  approvedBrief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  feedback: string;
  previousJobId?: string;
};
```

## 验收标准

- [ ] 生成 UGC 分镜后，卡片展示实际 storyboard prompt 的 NL preview。
- [ ] prompt preview 不展示完整 raw JSON、完整 request payload 或 provider response。
- [ ] 分镜内容以可编辑表单展示，而不是只读卡片 + JSON。
- [ ] `productAssetRef` 只能从 material assets 中选择。
- [ ] 用户编辑后确认，提交完整且符合 `storyboardArtifactSchema` 的 JSON。
- [ ] video feedback 若路由到 storyboard，会产生新的 proposed storyboard。
- [ ] feedback 不覆盖旧视频 job，也不删除旧视频归档。

