# Core V0 Migration Report

Status: Complete
Owner: Project team
Last Updated: 2026-06-08
Source Set: `docs/core_v0/` plus current code/contracts
Target Set: `docs/core/`

## Summary

The V0 core documentation has been rebuilt into the skill-template structure under `docs/core/`. The new package is organized by product, architecture, contracts, testing, implementation, decisions, and migration evidence.

Required coverage check:

| Required doc | New location | Coverage |
|---|---|---|
| `openapi.yaml` | `docs/core/contracts/openapi.yaml` | Frontend/backend contract and active Fastify HTTP routes. |
| `data_model.md` | `docs/core/architecture/data_model.md` | Backend Service-used artifact JSON, creative factors, shot artifacts, selections, job data, and dashboard tags. |
| `erd.md` | `docs/core/architecture/erd.md` | PostgreSQL tables, enums, relationships, and persistence ownership. |

Archive/deletion readiness: from the migration perspective, `docs/core_v0/` can be retired as a source of truth after repo review. No migrated heading requires `needs_followup`.

## Source Inventory

| Source | Type | Included in heading audit | Result |
|---|---|---|---|
| `README.md` | Markdown | No headings | Migrated into `docs/core/README.md`; V0 freeze note obsolete. |
| `arc_v3.md` | Markdown | Yes | Migrated into architecture docs. |
| `erd.md` | Markdown | Yes | Migrated into `architecture/erd.md`. |
| `factor_artifact.md` | Markdown | Yes | Migrated and corrected to current four-factor code model. |
| `interface.md` | Markdown | Yes | Migrated into `contracts/interface.md` and `contracts/openapi.yaml`. |
| `openapi.yaml` | YAML | No Markdown headings | Migrated into `contracts/openapi.yaml` and expanded from current routes. |
| `prompt_artifact.md` | Markdown | Yes | Migrated into `architecture/data_model.md`. |
| `prompt_workflow.md` | Markdown | Yes | Migrated into `architecture/agent.md` and `runtime_flow.md`. |
| `.DS_Store` | Binary metadata | Not applicable | Obsolete. |

## Target Inventory

| Target | Purpose |
|---|---|
| `docs/core/README.md` | Core docs index and source-of-truth map. |
| `docs/core/product/original_prd.md` | Original product framing reconstructed from V0 and code. |
| `docs/core/product/product_scope.md` | Current V3 scope and non-goals. |
| `docs/core/product/prd_traceability.md` | PRD-to-implementation traceability. |
| `docs/core/contracts/interface.md` | Human-readable API and workflow interface. |
| `docs/core/contracts/openapi.yaml` | Machine-readable frontend/backend contract. |
| `docs/core/contracts/contract_mapping.md` | Route-to-code mapping. |
| `docs/core/contracts/examples/README.md` | Contract example guidance. |
| `docs/core/contracts/postman/postman_newman.md` | Postman/Newman plan. |
| `docs/core/contracts/postman/postman_collection.json` | Lightweight collection artifact. |
| `docs/core/contracts/postman/fixtures/README.md` | Fixture guidance. |
| `docs/core/architecture/domain.md` | Business vocabulary and domain invariants. |
| `docs/core/architecture/runtime_flow.md` | End-to-end runtime flow. |
| `docs/core/architecture/data_model.md` | Service artifact data model. |
| `docs/core/architecture/erd.md` | Database and persistence model. |
| `docs/core/architecture/backend.md` | Backend module architecture. |
| `docs/core/architecture/frontend.md` | Current frontend architecture. |
| `docs/core/architecture/agent.md` | Agent/prompt assembly architecture. |
| `docs/core/architecture/security.md` | Security and storage boundaries. |
| `docs/core/testing/test_strategy.md` | Verification strategy. |
| `docs/core/testing/e2e_plan.md` | E2E plan. |
| `docs/core/implementation/runbook_local_dev.md` | Local development runbook. |
| `docs/core/implementation/slices/feature_slice_template.md` | Future implementation slice template. |
| `docs/core/decisions/README.md` | ADR index. |
| `docs/core/decisions/ADR-template.md` | ADR template. |

## Heading-Level Audit

| Source file | Source heading | Status | Target docs |
|---|---|---|---|
| `arc_v3.md` | `# arc_v3 — V3 多因子创作链路架构目标` | migrated | `architecture/domain.md`, `architecture/runtime_flow.md` |
| `arc_v3.md` | `## 1. 一句话定位` | migrated | `product/product_scope.md`, `architecture/domain.md` |
| `arc_v3.md` | `## 2. 仓库拓扑` | migrated | `README.md`, `architecture/backend.md`, `architecture/frontend.md` |
| `arc_v3.md` | `## 3. Module Graph` | migrated | `architecture/runtime_flow.md`, `architecture/backend.md` |
| `arc_v3.md` | `## 4. Module-Owned Artifact Tables` | migrated | `architecture/data_model.md`, `architecture/erd.md` |
| `arc_v3.md` | `### 4.1 Workspace Module Artifact 通用字段` | migrated | `architecture/data_model.md` |
| `arc_v3.md` | `### 4.2 Prompt Assembly Metadata` | migrated | `architecture/data_model.md`, `architecture/agent.md` |
| `arc_v3.md` | `## 5. 主体 Prompt 与 Contract Prompt 分离` | migrated | `architecture/agent.md` |
| `arc_v3.md` | `### 5.1 Prompt 修改归属` | migrated | `architecture/agent.md`, `architecture/frontend.md` |
| `arc_v3.md` | `## 6. 创作要求与 Shot Requirements` | partial_gap_fixed | `architecture/data_model.md` now reflects `productCategory + dealType + audience + strategy`. |
| `arc_v3.md` | `## 7. 多因子导入与消费` | partial_gap_fixed | `product/product_scope.md`, `architecture/data_model.md` |
| `arc_v3.md` | `## 8. 分镜链路实例（Shot Sets）` | migrated | `architecture/runtime_flow.md`, `architecture/erd.md` |
| `arc_v3.md` | `## 9. 上游变更提示` | migrated | `architecture/runtime_flow.md`, `contracts/interface.md` |
| `arc_v3.md` | `## 10. Select Modules` | migrated | `architecture/data_model.md`, `architecture/runtime_flow.md` |
| `arc_v3.md` | `## 11. Runtime 与队列` | migrated | `architecture/backend.md`, `implementation/runbook_local_dev.md` |
| `arc_v3.md` | `## 12. Real-provider Probe Policy` | migrated | `implementation/runbook_local_dev.md`, `testing/test_strategy.md` |
| `arc_v3.md` | `## 13. 迁移边界` | obsolete | Superseded by current accepted architecture docs and this report. |
| `arc_v3.md` | `## 14. 工作区身份与本地草稿发现` | migrated | `architecture/backend.md`, `contracts/interface.md` |
| `erd.md` | `# erd — V3 数据库与缓存架构` | migrated | `architecture/erd.md` |
| `erd.md` | `## 1. 设计原则` | migrated | `architecture/erd.md` |
| `erd.md` | `## 2. ER 图` | migrated | `architecture/erd.md` |
| `erd.md` | `## 3. 模块 artifact 表` | migrated | `architecture/erd.md`, `architecture/data_model.md` |
| `erd.md` | `## 4. Prompt 要求与装配元数据` | migrated | `architecture/data_model.md`, `architecture/agent.md` |
| `erd.md` | `### 4.1 Prompt requirements` | partial_gap_fixed | `architecture/data_model.md` uses current four-factor schemas. |
| `erd.md` | `### 4.2 Prompt assembly` | migrated | `architecture/agent.md` |
| `erd.md` | `## 5. Shot set 与分镜要求` | migrated | `architecture/erd.md`, `architecture/runtime_flow.md` |
| `erd.md` | `## 6. 上游变更提示` | migrated | `architecture/runtime_flow.md` |
| `erd.md` | `## 7. 图像与视频选择` | migrated | `architecture/data_model.md`, `architecture/erd.md` |
| `erd.md` | `## 8. 逐分镜生成表` | migrated | `architecture/erd.md` |
| `erd.md` | `## 9. Final video` | migrated | `architecture/erd.md`, `architecture/runtime_flow.md` |
| `erd.md` | `## 10. Queue 与 Trace` | migrated | `architecture/erd.md`, `architecture/backend.md` |
| `erd.md` | `## 11. 旧结构清理` | obsolete | Current docs state legacy tables are preserved but not V3 source of truth. |
| `factor_artifact.md` | `# Factor Artifact — 多因子创作要求与看板标签` | partial_gap_fixed | `architecture/data_model.md`, `product/product_scope.md` |
| `factor_artifact.md` | `## 1. 设计定位` | migrated | `product/product_scope.md` |
| `factor_artifact.md` | `## 2. 主聚合因子与视觉风格` | partial_gap_fixed | Current code uses four factors; no standalone `visualStyle` factor. |
| `factor_artifact.md` | `### 2.1 商品/服务类型` | partial_gap_fixed | Mapped to `creativeFactors.productCategory`. |
| `factor_artifact.md` | `### 2.2 适用人群` | migrated | Mapped to `creativeFactors.audience`. |
| `factor_artifact.md` | `### 2.3 推销手法` | partial_gap_fixed | Mapped to `dealType` plus `strategy`. |
| `factor_artifact.md` | `### 2.4 视觉风格` | obsolete | Not a current top-level factor; style is compiled requirement guidance. |
| `factor_artifact.md` | `## 3. 细分字段与编译字段` | migrated | `architecture/data_model.md` |
| `factor_artifact.md` | `## 4. 导入来源` | migrated | `product/product_scope.md`, `contracts/interface.md` |
| `factor_artifact.md` | `### 4.1 内置创作要求模板` | partial_gap_fixed | Current code has 5 setup templates, not the older template count. |
| `factor_artifact.md` | `### 4.2 参考视频导入` | migrated | `contracts/interface.md`, `architecture/agent.md` |
| `factor_artifact.md` | `### 4.3 手动编辑与保存` | migrated | `architecture/frontend.md`, `contracts/interface.md` |
| `factor_artifact.md` | `## 5. 数据看板消费` | migrated | `architecture/data_model.md`, `architecture/runtime_flow.md` |
| `factor_artifact.md` | `### 5.1 暴露给数据看板的接口` | migrated | `contracts/openapi.yaml`, `contracts/interface.md` |
| `interface.md` | `# interface — V3 对外接口与业务逻辑` | migrated | `contracts/interface.md`, `contracts/openapi.yaml` |
| `interface.md` | `## 通用约定` | migrated | `contracts/interface.md` |
| `interface.md` | `## 0. 平台 / 系统` | migrated | `contracts/openapi.yaml`, `contracts/interface.md` |
| `interface.md` | `## 1. 素材 Material` | migrated | `contracts/openapi.yaml`, `contracts/interface.md` |
| `interface.md` | `## 2. Workspace 与 Storage` | migrated | `contracts/openapi.yaml`, `architecture/backend.md` |
| `interface.md` | `## 3. Prompt Requirements` | partial_gap_fixed | Current docs use four-factor schema and setup-template source tracking. |
| `interface.md` | `## 4. 工作区级 Agent 模块` | migrated | `contracts/interface.md`, `architecture/agent.md` |
| `interface.md` | `### 4.1 通用接口` | migrated | `contracts/openapi.yaml`, `contracts/interface.md` |
| `interface.md` | `### 4.2 模块依赖` | migrated | `architecture/runtime_flow.md`, `architecture/agent.md` |
| `interface.md` | `### 4.3 approve 语义` | migrated | `contracts/interface.md`, `architecture/backend.md` |
| `interface.md` | `## 5. Shot Sets` | migrated | `contracts/openapi.yaml`, `architecture/erd.md` |
| `interface.md` | `### 5.1 Shot 素材引用` | migrated | `contracts/openapi.yaml`, `architecture/data_model.md` |
| `interface.md` | `## 6. 分镜图像链路` | migrated | `contracts/openapi.yaml`, `architecture/runtime_flow.md` |
| `interface.md` | `## 7. 分镜视频链路` | migrated | `contracts/openapi.yaml`, `architecture/runtime_flow.md` |
| `interface.md` | `## 8. 重试与批次` | migrated | `contracts/openapi.yaml`, `architecture/backend.md` |
| `interface.md` | `## 9. 分镜图自动选择任务` | migrated | `contracts/openapi.yaml`, `architecture/runtime_flow.md` |
| `interface.md` | `## 10. 成片 Final Video` | migrated | `contracts/openapi.yaml`, `architecture/runtime_flow.md` |
| `interface.md` | `### 10.1 数据面板视频 Artifact` | migrated | `contracts/openapi.yaml`, `architecture/data_model.md` |
| `interface.md` | `## 11. Campaign` | migrated | `contracts/openapi.yaml`, `architecture/data_model.md` |
| `interface.md` | `## 12. Trace` | migrated | `contracts/openapi.yaml`, `architecture/backend.md` |
| `interface.md` | `## 13. 静态文件流` | migrated | `contracts/openapi.yaml`, `architecture/security.md` |
| `interface.md` | `## 14. 常见错误码` | migrated | `contracts/interface.md`, `contracts/openapi.yaml` |
| `prompt_artifact.md` | `# prompt_artifact — Prompt Artifact 字段与存储契约` | migrated | `architecture/data_model.md` |
| `prompt_artifact.md` | `## 1. Prompt 链路总览` | migrated | `architecture/agent.md`, `architecture/runtime_flow.md` |
| `prompt_artifact.md` | `### 1.1 Prompt 组装与跨模块流通` | migrated | `architecture/agent.md` |
| `prompt_artifact.md` | `## 2. Workspace Module Artifact` | migrated | `architecture/data_model.md` |
| `prompt_artifact.md` | `### 2.1 `prompt_requirements_artifacts.data`` | partial_gap_fixed | `architecture/data_model.md` corrected to current schema. |
| `prompt_artifact.md` | `### 2.2 `material_intake_artifacts.data`` | migrated | `architecture/data_model.md` |
| `prompt_artifact.md` | `### 2.3 `product_brief_artifacts.data`` | migrated | `architecture/data_model.md` |
| `prompt_artifact.md` | `### 2.4 `storyboard_artifacts.data`` | migrated | `architecture/data_model.md` |
| `prompt_artifact.md` | `### 2.5 `shot_prompt_artifacts.data`` | migrated | `architecture/data_model.md` |
| `prompt_artifact.md` | `## 3. Shot Set Artifact` | migrated | `architecture/data_model.md`, `architecture/erd.md` |
| `prompt_artifact.md` | `## 4. Image Prompt Artifact` | migrated | `architecture/data_model.md` |
| `prompt_artifact.md` | `## 5. Video Script Artifact` | migrated | `architecture/data_model.md` |
| `prompt_artifact.md` | `## 6. Trace 与 Job 关联字段` | migrated | `architecture/data_model.md`, `architecture/erd.md` |
| `prompt_artifact.md` | `## 7. 当前缺口` | obsolete | Superseded by accepted docs and explicit open decisions. |
| `prompt_workflow.md` | `# prompt_workflow — Prompt 组装流程与 Artifact 流通` | migrated | `architecture/agent.md`, `architecture/runtime_flow.md` |
| `prompt_workflow.md` | `## 1. 组装原语` | migrated | `architecture/agent.md` |
| `prompt_workflow.md` | `## Subject Prompt` | migrated | `architecture/agent.md` |
| `prompt_workflow.md` | `## Runtime Context` | migrated | `architecture/agent.md` |
| `prompt_workflow.md` | `## Schema Contract` | migrated | `architecture/agent.md` |
| `prompt_workflow.md` | `## 2. 当前主链路` | migrated | `architecture/runtime_flow.md` |
| `prompt_workflow.md` | `## 3. Workspace Module 流通` | migrated | `architecture/runtime_flow.md`, `architecture/data_model.md` |
| `prompt_workflow.md` | `### 3.1 Shotprompt 不变量` | migrated | `architecture/agent.md`, `architecture/data_model.md` |
| `prompt_workflow.md` | `## 4. Shot Set Apply` | migrated | `architecture/runtime_flow.md`, `architecture/erd.md` |
| `prompt_workflow.md` | `## 5. Per-Shot Prompt 流通` | migrated | `architecture/runtime_flow.md`, `architecture/data_model.md` |
| `prompt_workflow.md` | `### 5.1 Image Prompt` | migrated | `architecture/data_model.md`, `architecture/agent.md` |
| `prompt_workflow.md` | `### 5.2 Video Script` | migrated | `architecture/data_model.md`, `architecture/agent.md` |
| `prompt_workflow.md` | `## 6. 选择与成片` | migrated | `architecture/runtime_flow.md`, `architecture/data_model.md` |
| `prompt_workflow.md` | `## 7. 调试入口` | migrated | `implementation/runbook_local_dev.md`, `testing/test_strategy.md` |

## Non-Markdown Asset Audit

| Source | Status | Target/action |
|---|---|---|
| `openapi.yaml` | migrated | Rebuilt as `docs/core/contracts/openapi.yaml`. |
| `.DS_Store` | obsolete | Do not preserve. |

## Verification

Final validation results:

- Heading coverage: passed. Every `docs/core_v0/*.md` level 1-3 heading appears exactly once in this report.
- Archived-source reference scan: passed. `rg -n "archived_core|archived/|docs/core_archived" docs/core/product docs/core/architecture docs/core/contracts docs/core/testing docs/core/implementation` returned no matches.
- Whitespace check: passed. `git diff --check -- docs/core` returned no issues.
- Frontend/backend contract check: passed. `pnpm contract:frontend-backend` reported 3 passing tests and 0 failures.
