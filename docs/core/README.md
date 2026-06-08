# Docs/Core Architecture Pack

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
`testing/`, and `implementation/` are the implementation source of truth.
`contracts/openapi.yaml` and `contracts/interface.md` are the public contract
files. `archived/` is migration staging for older core documents; once their
facts are migrated into the template-aligned files, it may be deleted or ignored
and must not become a dependency for new work.

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

## 3. Migration Staging

| File | Current role |
|---|---|
| `contracts/openapi.yaml` | Template-aligned OpenAPI contract source. |
| `contracts/interface.md` | Template-aligned detailed REST behavior notes. |
| `archived/*` | Temporary holding area for migrated legacy docs; not a source of truth. |

## 4. Drift Rules

- Code-visible API behavior changes require updates to
  `contracts/contract_mapping_v1.md`, `contracts/interface.md`, and
  `contracts/openapi.yaml` when applicable.
- Prompt chain changes require updates to `architecture/domain_v1.md`,
  `architecture/runtime_flow_v1.md`, and `contracts/contract_mapping_v1.md`
  when applicable.
- Persistence or job-state changes require updates to
  `architecture/domain_v1.md`, `architecture/runtime_flow_v1.md`, and
  `contracts/contract_mapping_v1.md`.
- Frontend workflow copy must use `CONTEXT.md` business terms, not raw provider
  prompt terminology.
