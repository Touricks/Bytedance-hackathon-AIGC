# Handoff: 0530 Backend Implementation

更新时间：2026-05-30

## 下一会话目标

新会话用于从当前文档版本开始开一个独立 git worktree，先实现 0530 后端 P0 当前版本。用户会继续慢慢审核文档，所以实现时以 `docs/0530-dev/` 的目标契约为准，但遇到产品/接口语义不确定时保持小步提交、不要大规模重构。

## 当前状态

- 当前分支：`arc_v2_0530`。
- 已推送提交：
  - `dbc6eb7 Add 0530 backend development plan`
  - `c26a434 Add 0529 dev docs and workspace API updates`
- 当前未提交改动集中在：
  - `docs/0530-dev/backend-development-plan.md`
  - `docs/0530-dev/openapi.yaml`
  - `docs/0530-dev/postman-test-plan.md`
  - `docs/0528-agent-arc/spec/` 文件名从长文件名变成 `r1.md` / `r2.md` 的工作区状态
- 最新 OpenAPI 已通过 YAML parse 校验。

## 主要参考文档

- [Backend Development Plan](./backend-development-plan.md)
- [OpenAPI Target Contract](./openapi.yaml)
- [Postman Test Plan](./postman-test-plan.md)
- [Code Architecture Comments](./code-architecture-comments.md)
- [0528 r2 Spec](../0528-agent-arc/spec/r2.md)
- [0529 Prompt API](../0529-dev/prompt-api/README.md)
- [0529 Product API](../0529-dev/product-api/README.md)

## 当前共识

1. `GET /api/config/limits` 是只读运行时配置接口，用来让前端/测试获取批量生成数量和画幅限制。
2. OpenAPI `operationId` 是接口唯一标识，主要给 SDK、Postman、自动化测试和文档锚点使用。
3. 0530 目标契约不是简单照抄当前实现，而是标出下一版后端应该补齐的稳定行为。
4. LLM 只能生成可编辑、可确认的中间 artifact；已 approve 的 artifact 下游必须走确定性 compiler/provider boundary。
5. 所有 provider-facing prompt 需要中文组装。

## 待实现 P0

按当前计划，优先实现以下后端缺口：

- 上传素材时创建/暴露稳定 `assetId`，打通 `ref -> asset.id -> URL/dataURL`。
- `approveShotPrompt` 同事务写入 `storyboard_shots` 和 `shot_asset_refs`。
- `proposeImagePrompt` / `proposeVideoScript` 做上下文 hydration：approved brief、material intake、shotprompt shot、shot_asset_refs、上一轮 prompt、selected image。
- Seedance video provider 支持 `last_frame`；中间 shot 使用 first/last frame，最后一个 shot 仅 first frame。
- image/video worker 将 provider 24h URL 转存成 workspace 稳定 URL，并写 `objectKey` / stable URL。
- image/video select 增加业务校验：candidate 属于当前 shot、属于 active round、状态 `SUCCEEDED`、batch 匹配。
- 修正 image select 不应触发 stale；stale 只发生在 re-propose / re-generate。
- 提供 workspace-scoped `image-rounds` / `video-rounds` 聚合查询。

## 建议实现顺序

1. 先开新 worktree，基于 `origin/arc_v2_0530` 或当前分支最新 HEAD。
2. 先补 DB/service 级最小能力：`assetId` 暴露、`shot_asset_refs` seed、select 校验。
3. 再补 provider boundary：URL 转存、Seedance `last_frame`。
4. 最后补 rounds API 与 Postman/测试断言。
5. 每个阶段跑 `pnpm --filter @aigc-video/server typecheck`，完成 P0 后跑 `pnpm --filter @aigc-video/server test`。

## 注意事项

- 不要 revert 用户已有未提交文档改动。
- 当前 repo 有历史文档重命名状态：`docs/0528-agent-arc/spec/2026-05-28-*.md` 删除，`r1.md` / `r2.md` 新增。新会话操作前先确认工作树范围。
- 网络受限时，不要尝试真实 provider smoke；本地实现先以 mock/unit/API tests 为准。
- 若需要提交或推送，先明确是否只提交实现 worktree，避免混入用户继续审核中的文档改动。

## 建议技能

- `github:github`：如果需要查看分支、PR 或 issue 背景。
- `typescript-engineering-practices`：实现后端 TypeScript 架构和测试时使用。
- `diagnose`：真实 provider、worker、状态机联调失败时使用。
- `handoff`：下一次跨会话继续时再次压缩上下文。

## 新会话 Prompt

```text
我在 /Users/carrick/ResearchWorkspace/Bytedancehack，需要基于分支 arc_v2_0530 开一个新的 git worktree 来实现 docs/0530-dev 当前版本的后端 P0。

请先阅读：
- docs/0530-dev/handoff-current-version-implementation.md
- docs/0530-dev/backend-development-plan.md
- docs/0530-dev/openapi.yaml
- docs/0530-dev/postman-test-plan.md
- docs/0528-agent-arc/spec/r2.md

目标：实现当前 0530 后端 P0，不要重构无关模块，不要覆盖用户未提交文档改动。优先完成：
1. 上传素材返回并持久化 assetId，打通 ref -> asset.id -> URL/dataURL。
2. approve shotprompt seed storyboard_shots + shot_asset_refs。
3. image/video prompt service 做上下文 hydration。
4. Seedance provider 支持 last_frame。
5. image/video worker 转存 provider 24h URL 为稳定 workspace URL。
6. selectImage/selectVideo 做 candidate 业务校验，并修正 select 不触发 stale。
7. 新增 image-rounds/video-rounds API。

请先创建/切换到新的 worktree，给出实现计划，然后开始小步修改。验证至少跑 pnpm --filter @aigc-video/server typecheck，能跑时再跑 pnpm --filter @aigc-video/server test。
```
