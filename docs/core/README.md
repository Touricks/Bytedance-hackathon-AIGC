# Docs/Core Architecture Pack

Status: Accepted
Owner: Product + Architecture
Last Updated: 2026-06-08
Applies To: V3 merchant-facing AIGC commerce video generation
Depends On: `../../CONTEXT.md`, current repository code, archived legacy references
Blocks: Cross-layer implementation planning and contract-changing work
Decision State: Accepted with assigned open decisions

## 1. Purpose

This directory is the architecture source of truth for the AIGC commerce video
repository. The V3 product loop is:

```text
创作要求 / creative factors
-> 上传素材
-> 素材解读
-> 商品卖点
-> 分镜脚本
-> 分镜生成要求
-> 分镜链路实例 apply
-> 分镜图候选 / 选择
-> 分镜视频候选 / 选择
-> 成片
-> 发布标签 / 数据看板
```

The template-aligned files under `product/`, `architecture/`, `contracts/`,
`testing/`, and `implementation/` are the entry points for implementation
readiness. `contracts/openapi.yaml` and `contracts/interface.md` are the
template-aligned contract files. The root `docs/core/openapi.yaml` and
`docs/core/interface.md` remain compatibility mirrors for existing repo scripts
and AGENTS guidance, and `archived/` keeps the detailed legacy reference set.

## 2. Reading Order

1. `../../CONTEXT.md`
2. `product/product_scope_v1.md`
3. `architecture/domain_v1.md`
4. `architecture/runtime_flow_v1.md`
5. `contracts/openapi.yaml`
6. `contracts/interface.md`
7. `contracts/contract_mapping_v1.md`
8. `architecture/security_v1.md`
9. `testing/test_strategy_v1.md`
10. `implementation/slices/v3_review_chain_slice.md`

## 3. Legacy Reference Map

| File | Current role |
|---|---|
| `contracts/openapi.yaml` | Template-aligned OpenAPI contract source. |
| `contracts/interface.md` | Template-aligned detailed REST behavior notes. |
| `openapi.yaml` | Compatibility mirror consumed by `pnpm contract:frontend-backend`. |
| `interface.md` | Compatibility mirror for existing repo guidance. |
| `archived/arc_v3.md` | Detailed V3 target architecture and module graph. |
| `archived/erd.md` | Detailed persistence model and schema rationale. |
| `archived/factor_artifact.md` | Creative factor artifact behavior and dashboard tag flow. |
| `archived/prompt_workflow.md` | Prompt assembly and prompt artifact flow. |
| `archived/prompt_artifact.md` | Prompt artifact fields and storage contract. |

## 4. Drift Rules

- Code-visible API behavior changes require updates to
  `contracts/contract_mapping_v1.md`, `contracts/interface.md`,
  `contracts/openapi.yaml`, and the root compatibility mirrors when applicable.
- Prompt chain changes require updates to `architecture/domain_v1.md`,
  `architecture/runtime_flow_v1.md`, `archived/prompt_workflow.md`, and
  `archived/prompt_artifact.md` when applicable.
- Persistence or job-state changes require updates to
  `architecture/domain_v1.md`, `architecture/runtime_flow_v1.md`, and
  `archived/erd.md`.
- Frontend workflow copy must use `CONTEXT.md` business terms, not raw provider
  prompt terminology.
