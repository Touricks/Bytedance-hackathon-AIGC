# Route Index

本文用于后端快速定位接口实现和测试。新增接口时请补充本表。

| 接口 | Controller | Service | Test |
|---|---|---|---|
| `GET /api/health` | `apps/server/src/app.ts` | inline | app/build server tests |
| `GET /api/config/limits` | `apps/server/src/app.ts` | config | config tests |
| `GET /api/workspaces` | `workspace.controller.ts` | `workspaceService.listManagedWorkspaces` | `workspace.api.test.ts` |
| `POST /api/workspaces` | `workspace.controller.ts` | `workspaceService.createManagedWorkspace` | `workspace.api.test.ts` |
| `GET /api/workspaces/:workspaceId/directory` | `workspace.controller.ts` | `workspaceService.getWorkspaceDirectory` | `workspace.api.test.ts` |
| `POST /api/workspaces/status` | `workspace.controller.ts` | `workspaceService.status` | `workspace.api.test.ts` |
| `POST /api/workspaces/materials` | `workspace.controller.ts` | `workspaceService.uploadMaterial` | `workspace.api.test.ts` |
| `POST /api/workspaces/brief/propose` | `workspace.controller.ts` | `workspaceService.proposeBrief` | `workspace.api.test.ts` |
| `GET /api/workspaces/:workspaceId/shots` | `shot.controller.ts` | `shotWorkflowService.listShots` | `shot.workflow.api.test.ts` |
| `POST /api/shots/:shotId/image-batches` | `shot.controller.ts` | `generationService.createImageBatch` | `shot.workflow.api.test.ts` |
| `POST /api/shots/:shotId/video-batches` | `shot.controller.ts` | `generationService.createVideoBatch` | `shot.workflow.api.test.ts` |
| `POST /api/workspaces/:workspaceId/final-videos` | `generation.controller.ts` | `generationService.createFinalCompose` | integration tests |
| `GET /api/workspaces/:workspaceId/traces` | `trace.routes.ts` | `traceService.list` | trace tests |

## 维护规则

- 表中只放公开 API，不放内部 helper。
- 如果接口行为由多个 service 协作，写入口 service。
- Test 列写最主要的契约测试位置。

