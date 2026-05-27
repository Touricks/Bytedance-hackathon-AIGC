# Bug 004: 素材清点后的 prompt 预览与产品概述动态表单

## 用户反馈

作为用户，希望完成“运行素材清点”后：

1. 在“素材清点”格内看到组装好、实际发送给模型的 prompt。
2. prompt 不应以混乱的 raw JSON 或完整 request payload 展示，而应从 JSON 中抽出 `NL` 模块渲染到前端。
3. 在“产品概述”格内看到模型生成的产品概述 JSON 字段，并以表单形式编辑。
4. 用户不应在生成 Brief 前自己填写商品标题、核心卖点、目标人群、风格偏好；这些应由模型根据素材清点结果生成，再由用户修改确认。

## 相关前置决策

Bug 003 已确认建立 pipeline contract registry：

- prompt-call schemas 放在 `packages/ai/src/schemas/`。
- domain artifact schemas 放在 `packages/shared/src/schemas/`。
- workflow 负责将 AI raw output normalize 成 shared artifact。
- V1 先做只读显式化 + repo 级版本化配置，不做 workspace 级 prompt override。

Bug 004 基于该 contract registry 增加一层“用户可见运行时视图”：

- prompt 的自然语言部分必须可被前端稳定渲染。
- artifact 的可编辑字段必须由 schema/form metadata 驱动，而不是前端硬编码一组孤立输入框。

## 当前代码事实

### 素材清点

- `buildMaterialIntakePrompt()` 当前返回一个拼接后的字符串。
- real provider 模式下，`material_intake.request_prepared` trace 会记录 `meta.prompt` 和 `meta.content`。
- `workspaceService.materialIntake()` 返回 `{ workspace, artifact, trace }`，其中 `trace` 目前只包含 provider/model/promptVersion 等摘要，不返回用户可读 prompt 视图。
- 前端 `MaterialSummary` 只渲染 material artifact 的资产列表，不渲染 prompt。

### 产品概述

- 当前前端在生成 Brief 之前要求用户手填：
  - `title`
  - `sellingPoints`
  - `audience`
  - `stylePreference`
- `proposeWorkspaceBrief()` 将这些字段发给后端。
- 后端 `buildProductBriefPrompt()` 把这些用户输入与 material artifact 一起组装成 prompt。
- 模型输出最终 normalize 成 `productBriefArtifactSchema`，但前端只以 summary/JSON preview 展示，不使用动态表单渲染完整可编辑字段。

## 问题判断

当前 UI 让用户在模型生成之前填写产品概述字段，等于把“让模型从素材中提取产品信息”的工作提前交给用户了。

正确链路应是：

1. 用户选择/导入系统素材。
2. 用户运行素材清点。
3. 系统展示本次实际发送给素材清点模型的 NL prompt 预览。
4. 用户运行产品概述生成。
5. 系统展示模型生成的产品概述 JSON，并按 contract 定义渲染成表单。
6. 用户编辑表单并确认。

## 已确认目标

### 1. Prompt JSON 必须包含可渲染 NL 模块

每个 runtime prompt contract 至少提供：

```ts
type RuntimePromptView = {
  contractId: string;
  promptVersion: string;
  provider: "ark" | "seedance" | "deterministic";
  model?: string;
  nl: {
    title: string;
    sections: Array<{
      id: string;
      label: string;
      body: string;
    }>;
  };
  variables: Record<string, unknown>;
};
```

前端只默认渲染 `nl.title` 与 `nl.sections`。

`variables` 只用于开发者调试或折叠查看，不进入主 UI。

### 2. 素材清点返回 prompt 预览

`POST /api/workspaces/material-intake` 返回：

```ts
type WorkspaceMaterialDetail = {
  workspace: CreativeWorkspace;
  artifact: WorkspaceArtifact<MaterialIntakeArtifact>;
  promptView: RuntimePromptView;
  trace?: Record<string, unknown>;
};
```

前端在“素材清点”格内展示：

- 已使用的 prompt version。
- NL sections，例如：
  - Role
  - User intent
  - Selected material manifest
  - Task
  - Output contract
- 不默认展示完整 multimodal request payload、base64、raw JSON。

### 3. 产品概述输入改为模型生成后编辑

产品概述阶段不再要求用户预填 `title/sellingPoints/audience/stylePreference` 才能生成 Brief。

`POST /api/workspaces/brief/propose` 的 V1 主路径输入应改为：

```ts
type ProductBriefProposalRequest = {
  workspaceId: string;
  userDirection?: string;
};
```

其中 `userDirection` 是可选的补充方向，不是必填产品事实。

产品事实应主要来自：

- `.daireel/materials/` 中的系统素材。
- 已批准或最新的 material intake artifact。
- material intake 中的 text previews / image tags。

### 4. 产品概述 JSON 字段结构

产品概述模型输出 normalize 后继续使用 `productBriefArtifactSchema`，但为了动态表单，需要稳定字段路径：

```json
{
  "product": {
    "name": "string",
    "category": "string",
    "keyFacts": ["string"],
    "assets": [
      {
        "ref": "string",
        "useAs": "primary | support"
      }
    ]
  },
  "audience": {
    "who": "string",
    "painOrDesire": "string"
  },
  "coreSellingPoint": "string",
  "proof": ["string"],
  "offer": "string | null",
  "platform": "Seedance",
  "brandTone": "string",
  "bannedExpressions": ["string"],
  "landingInfo": "string | null",
  "assumptions": ["string"]
}
```

### 5. 产品概述动态表单 metadata

Product brief contract 必须提供 form metadata：

```ts
type ArtifactFormContract = {
  artifactType: "brief";
  artifactSchemaVersion: "product-brief-artifact.v1";
  fields: Array<{
    path: string;
    label: string;
    component:
      | "text"
      | "textarea"
      | "string_list"
      | "asset_ref_list"
      | "nullable_text"
      | "select";
    required: boolean;
    source?: "material.assets" | "static";
    options?: string[];
    helpText?: string;
  }>;
};
```

V1 product brief 表单字段：

```json
[
  {
    "path": "product.name",
    "label": "商品名称",
    "component": "text",
    "required": true
  },
  {
    "path": "product.category",
    "label": "商品类别",
    "component": "text",
    "required": true
  },
  {
    "path": "product.keyFacts",
    "label": "关键事实",
    "component": "string_list",
    "required": true
  },
  {
    "path": "product.assets",
    "label": "商品素材",
    "component": "asset_ref_list",
    "required": true,
    "source": "material.assets"
  },
  {
    "path": "audience.who",
    "label": "目标人群",
    "component": "text",
    "required": true
  },
  {
    "path": "audience.painOrDesire",
    "label": "痛点/欲望",
    "component": "textarea",
    "required": true
  },
  {
    "path": "coreSellingPoint",
    "label": "核心卖点",
    "component": "textarea",
    "required": true
  },
  {
    "path": "proof",
    "label": "支撑证据",
    "component": "string_list",
    "required": true
  },
  {
    "path": "offer",
    "label": "优惠信息",
    "component": "nullable_text",
    "required": false
  },
  {
    "path": "platform",
    "label": "目标平台",
    "component": "select",
    "required": true,
    "options": ["Seedance"]
  },
  {
    "path": "brandTone",
    "label": "品牌语气",
    "component": "text",
    "required": true
  },
  {
    "path": "bannedExpressions",
    "label": "禁用表达",
    "component": "string_list",
    "required": false
  },
  {
    "path": "landingInfo",
    "label": "落地页信息",
    "component": "nullable_text",
    "required": false
  },
  {
    "path": "assumptions",
    "label": "模型假设",
    "component": "string_list",
    "required": false
  }
]
```

### 6. 前端渲染行为

产品概述格的状态应变为：

- 未生成：显示“等待产品概述”，按钮为“生成 Brief”。
- 已生成 proposed：用 `ArtifactFormContract.fields` 渲染可编辑表单，表单初始值来自 `artifact.data`。
- 用户编辑：更新本地 draft JSON。
- 用户确认：提交编辑后的完整 `ProductBriefArtifact` 到 approve endpoint。
- 已确认 approved：表单仍可查看；如允许再次编辑，应先进入 proposed/draft 状态。

## API/Contract 调整建议

### Material intake detail

```ts
type WorkspaceMaterialDetail = {
  workspace: CreativeWorkspace;
  artifact: WorkspaceArtifact<MaterialIntakeArtifact>;
  promptView: RuntimePromptView;
  trace?: Record<string, unknown>;
};
```

### Product brief detail

```ts
type WorkspaceBriefDetail = {
  workspace: CreativeWorkspace;
  artifact: WorkspaceArtifact<ProductBriefArtifact>;
  promptView?: RuntimePromptView;
  form: ArtifactFormContract;
  trace?: Record<string, unknown>;
};
```

### Product brief proposal request

```ts
type ProductBriefProposalRequest = {
  workspaceId: string;
  userDirection?: string;
};
```

旧的 `title/sellingPoints/audience/stylePreference` 可保留为 compatibility 字段，但不应是 V1 前端主路径。

## 验收标准

- [ ] 运行素材清点后，素材清点格显示实际 prompt 的 NL preview。
- [ ] prompt preview 不展示 base64、完整 request payload 或大段 raw JSON。
- [ ] 产品概述不再要求用户在生成前填写商品标题、核心卖点、目标人群、风格偏好。
- [ ] 生成 Brief 后，前端根据 `form.fields` 和 `artifact.data` 动态渲染表单。
- [ ] 用户编辑表单后确认，提交的是完整且符合 `productBriefArtifactSchema` 的 JSON。
- [ ] 刷新或恢复历史 workspace 后，已生成的 product brief artifact 能重新 hydrate 为同一动态表单。
- [ ] contract registry 能说明 product brief artifact 字段与表单字段的对应关系。

## 已确认决策：保留可选自由文本方向

产品概述生成允许用户在生成前提供一个可选的自由文本方向 `userDirection`。

但不要再拆成 title/sellingPoints/audience/stylePreference 四个必填字段。`userDirection` 是“补充偏好”，不是产品事实来源；产品事实应由素材清点和系统素材推导，并在生成后由用户编辑确认。
