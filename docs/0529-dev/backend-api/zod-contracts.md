# Zod Contracts

本文记录后端请求/输出契约来源。完整实现以代码为准。

## Workspace schemas

代码位置：

```text
apps/server/src/modules/workspace/workspace.schema.ts
packages/shared/src/schemas/artifacts.ts
```

| 接口 | Request schema | Output artifact |
|---|---|---|
| `POST /api/workspaces` | `managedWorkspaceCreateRequestSchema` | workspace + manifest |
| `POST /api/workspaces/init` | `workspaceDirectoryRequestSchema` | workspace + manifest |
| `POST /api/workspaces/status` | `workspaceDirectoryRequestSchema` | workspace status detail |
| `POST /api/workspaces/material-intake` | `materialIntakeRequestSchema` | `materialIntakeArtifactSchema` |
| `POST /api/workspaces/brief/propose` | `productBriefProposalRequestSchema` | `productBriefArtifactSchema` |
| `POST /api/workspaces/artifacts/brief/approve` | `productBriefApprovalRequestSchema` | `productBriefArtifactSchema` |
| `POST /api/workspaces/artifacts/storyboard/approve` | `storyboardApprovalRequestSchema` | `storyboardArtifactSchema` |
| `POST /api/workspaces/shotprompt/compile` | `shotPromptCompileRequestSchema` | `shotPromptArtifactSchema` |
| `POST /api/workspaces/feedback/route` | `feedbackRouteRequestSchema` | `feedbackRouteArtifactSchema` |

## Shot schemas

代码位置：

```text
apps/server/src/modules/shot/shot.schema.ts
```

| 接口 | Request schema |
|---|---|
| image prompt propose | `proposeImagePromptRequest` |
| image prompt patch | `patchImagePromptRequest` |
| image batch create | `createImageBatchRequest` |
| image select | `selectImageRequest` |
| video script propose | `proposeVideoScriptRequest` |
| video script patch | `patchVideoScriptRequest` |
| video batch create | `createVideoBatchRequest` |
| video select | `selectVideoRequest` |
| retry | `retryRequest` |

## 维护规则

- Request schema 变更后必须同步 OpenAPI。
- Artifact schema 变更后必须同步 prompt 文档。
- 状态枚举变更后必须同步前端 state machine 和产品状态文案。

