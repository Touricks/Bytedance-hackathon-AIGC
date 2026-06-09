# Product Scope

Status: Accepted
Owner: Project team
Last Updated: 2026-06-08
Applies To: V3 merchant creative review and video generation scope
Depends On: `CONTEXT.md`, `docs/core/product/original_prd.md`
Blocks: Feature work that changes user-visible creative flow
Decision State: Accepted

## 1. Executive Summary

Current scope supports one current creative line per 创作工作目录. The merchant works in the 创作审核台, approves structured 创作要求 and generated creative artifacts, applies a 分镜链路实例, chooses 分镜图 and 分镜视频 candidates, composes a 成片, and optionally imports that video into the data dashboard or records publication metadata.

## 2. In Scope

- Workspace discovery and initialization for local `.daireel/` workspaces plus S3-compatible storage bindings.
- Structured four-factor 创作要求 based on `productCategory`, `dealType`, `audience`, and `strategy`.
- Module artifacts for 素材解读, 商品卖点, 分镜脚本, and 分镜生成要求.
- Explicit apply step from approved 分镜生成要求 to active 分镜链路实例.
- Per-shot image prompt/video script artifacts, generation batches, candidates, and current selections.
- 一键成片 orchestration from approved 素材解读 into final compose.
- Independent batch image auto-selection for current active 分镜链路实例.
- Final compose using ffmpeg and workspace storage.
- Dashboard video import with 成片创作归因 and campaign publication metrics.

## 3. Out of Scope

- Multi-branch workspace versioning and product-level rollback UI.
- User editing of system prompts, provider prompts, or raw assembled prompts.
- Active official real-provider smoke scripts that exercise the full workspace chain.
- Treating Redis as business cache or object storage as business fact source.
- Automatically deleting downstream candidates, selections, or final outputs when upstream inputs change.

## 4. User-Visible Language

Use terms from `CONTEXT.md` in UI and docs. In particular, prefer 创作审核台, 创作要求, 素材解读, 分镜脚本, 分镜生成要求, 分镜链路实例, 分镜图选择, 分镜视频选择, 成片, and 上游变更提示.

## 5. Related Docs

- `architecture/domain.md`
- `architecture/runtime_flow.md`
- `contracts/interface.md`

