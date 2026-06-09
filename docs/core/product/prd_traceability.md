# PRD Traceability

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: Product goals mapped to architecture and tests
Depends On: `product/original_prd.md`, `product/product_scope.md`
Blocks: MVP readiness claims without acceptance evidence
Decision State: Accepted

## 1. Traceability Matrix

| Product goal | Architecture owner | Contract owner | Test evidence |
|---|---|---|---|
| Merchant reviews structured creative artifacts before downstream generation | `domain.md`, `runtime_flow.md` | `contracts/interface.md` workspace module endpoints | Server module API/unit tests; web creative-review tests |
| Users edit 创作要求, not raw prompts | `data_model.md`, `agent.md` | `PromptRequirementsData` in OpenAPI | `packages/shared` creative factor tests; web requirements form tests |
| Approved/current artifacts drive downstream modules | `domain.md` | Module state endpoints | Workspace service tests |
| 上游变更提示 does not erase downstream work | `runtime_flow.md`, `data_model.md` | `UpstreamDrift` responses | shot stale/upstream drift tests |
| Approved 分镜生成要求 must be explicitly applied | `runtime_flow.md`, `erd.md` | `/shot-sets` endpoints | shot-set and workspace API tests |
| Candidate counts are operation parameters | `backend.md`, `contracts/interface.md` | generation request schemas | shot/generation service tests |
| Stable video persistence gates selection and final compose | `backend.md`, `data_model.md` | video rounds/select endpoints | video worker and integration tests |
| 成片 carries 成片创作归因 | `data_model.md`, `erd.md` | final video and dashboard endpoints | final compose/dashboard/campaign API tests |
| Dashboard video list reads imported artifacts | `frontend.md`, `data_model.md` | dashboard endpoints | data dashboard web/API tests |

## 2. Readiness Gate

A feature that touches one of the goals above is not ready until docs, OpenAPI/interface mapping, and at least one targeted test are updated or explicitly deemed unchanged.

