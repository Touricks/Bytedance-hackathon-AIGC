# Core Architecture Package

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: AIGC commerce video generation V3 implementation in `apps/server`, `apps/web`, `packages/ai`, and `packages/shared`
Depends On: `CONTEXT.md`, current code, `docs/core_v0/`
Blocks: Backend/API/frontend/prompt-chain changes without matching contract and architecture updates
Decision State: Accepted

## 1. Purpose

This package is the current source of truth for the merchant-facing AIGC commerce video generation system. It replaces the legacy `docs/core_v0/` flat documents with a template-aligned architecture set.

Use these docs for new work:

1. `product/original_prd.md`
2. `product/product_scope.md`
3. `product/prd_traceability.md`
4. `architecture/domain.md`
5. `architecture/runtime_flow.md`
6. `contracts/openapi.yaml`
7. `contracts/interface.md`
8. `contracts/contract_mapping.md`
9. `architecture/data_model.md`
10. `architecture/erd.md`
11. `architecture/backend.md`
12. `architecture/frontend.md`
13. `architecture/agent.md`
14. `architecture/recommendation_engine.md`
15. `architecture/security.md`
16. `testing/test_strategy.md`
17. `testing/e2e_plan.md`
18. `implementation/runbook_local_dev.md`

## 2. Directory Map

```text
docs/core/
  product/        Product source, selected scope, PRD traceability.
  contracts/      OpenAPI, interface notes, frontend/backend mapping, examples, Postman notes.
  architecture/   Domain, runtime, backend, frontend, agent, recommendation engine, security, data model, ERD.
  implementation/ Local runbook and implementation slices.
  testing/        Test strategy and E2E plan.
```

## 3. Current V3 Flow

The current flow is:

```text
创作要求
  -> 上传素材
  -> 素材解读
  -> 商品卖点
  -> 分镜脚本
  -> 分镜生成要求
  -> apply 分镜链路实例
  -> 分镜图要求 / 分镜图选择
  -> 分镜视频要求 / 分镜视频选择
  -> 成片
  -> 数据看板视频 artifact
  -> 发布记录 / 指标
```

Workspace modules use `propose -> approve`. Downstream modules read only approved/current artifacts. Upstream changes are surfaced as `upstreamChanged` warnings and must not automatically delete candidates, selections, or final outputs.

## 4. Contract Anchors

- `contracts/openapi.yaml` is the machine-readable frontend/backend HTTP contract.
- `architecture/data_model.md` is the service-facing artifact and payload contract.
- `architecture/erd.md` is the PostgreSQL/BullMQ/storage fact model.

When API behavior changes, update all applicable anchors together.
