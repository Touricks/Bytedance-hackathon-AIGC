# Contract Mapping

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Frontend/backend/API/schema alignment
Depends On: `contracts/openapi.yaml`, `contracts/interface.md`
Blocks: API changes without code and docs traceability
Decision State: Accepted

## 1. Executive Summary

This mapping ties frontend API clients, backend controllers, service-owned schemas, and tests to the OpenAPI contract.

## 2. Current Reality

| Contract area | Frontend | Backend | Shared schemas/tests |
|---|---|---|---|
| Workspaces | `apps/web/src/lib/api/client.ts` | `workspace.controller.ts`, `workspace.schema.ts` | workspace API tests |
| Module artifacts | `client.ts`, creative review view model | `prompt-requirements.service.ts`, `material-intake.service.ts`, `product-brief.service.ts`, `storyboard.service.ts`, `shotprompt.service.ts` | `packages/shared/src/schemas/artifacts.ts` |
| Creative factors | requirements form | `prompt-requirements.service.ts`, reference video import | `creative-factors.ts`, setup template tests |
| Shot flow | `shots.ts`, `imagePrompt.ts`, `videoScript.ts`, `imageSelect.ts`, `videoSelect.ts` | `shot.controller.ts`, `shot.service.ts` | shot service/controller tests |
| Generation | `imageBatch.ts`, `videoBatch.ts`, `finalVideo.ts`, `oneClickFinalVideo.ts` | `generation.controller.ts`, generation services/workers | generation unit/integration tests |
| Dashboard | `dashboardVideoArtifacts.ts` | `dashboard-video-artifact.controller.ts` | dashboard API/web tests |
| Campaign | data dashboard clients/view model | `campaign.controller.ts`, `campaign.service.ts` | campaign API tests |
| Trace observability | none (not public API) | `trace.service.ts`, `trace-sink.ts`, provider-call trace helpers | trace sink tests |

## 3. Change Rule

When an endpoint, body field, enum, or response shape changes:

1. Update backend schema/service/controller.
2. Update frontend API client and consuming view model.
3. Update `contracts/openapi.yaml` and `contracts/interface.md`.
4. Update `architecture/data_model.md` or `architecture/erd.md` if artifact/database shape changes.
5. Run `pnpm contract:frontend-backend` and targeted tests.
