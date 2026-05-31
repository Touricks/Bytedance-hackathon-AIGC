# Postman Test Plan

更新时间：2026-05-31

## 目标

Postman 用于验证后端公开契约和真实服务联调，不替代 Node test。0530 当前交付拆成两份 collection：

| Collection | 目的 | Provider |
|---|---|---|
| `smoke.json` | 快速确认 API path、schema、状态码、DB/storage、shot seed、Campaign/KOL；不触发 text/image/video provider | 不依赖模型 API |
| `provider.json` | 小批量真实模型联调，覆盖 text/image/video provider、batch polling、select、final video | 依赖 `.env` 中 `TEXT_*`、`IMAGE_*`、`VIDEO_*` |

注意：代码里的 `pnpm --filter @aigc-video/server test:integration:smoke` 和 `smoke:providers` 是真实 provider smoke，会读取 `.env` 并调用模型 API；不要把它们等同于 Postman local smoke。

## 运行前准备

推荐直接运行低成本真实 provider smoke：

```bash
pnpm realitest
```

该脚本会先执行 `pnpm reset:dev -- --yes --no-dev` 清理 Postgres / Redis 并停止旧 dev listener，再删除 `workspaceDirectory/.daireel/`，随后启动 `pnpm dev`，等待 `/api/health` 就绪后运行 provider Newman collection。它当前固定 approve one-shot shotprompt，只证明单 shot 真实图片、视频、final compose、Campaign 主链路能跑通，不承担多 shot 并行稳定性验收。

多 shot 并行验收使用：

```bash
pnpm realitest:parallel
```

该脚本使用固定 4-shot approved storyboard（每个 shot 4 秒，总 16 秒），调用 `shotprompt/compile` 基于该 storyboard 编译 shotprompt，并默认 approve compile 结果。若需要彻底固定 approved shotprompt，可设置 `REALITEST_PARALLEL_SHOTPROMPT_SOURCE=fixed`，但 compile 步骤仍会运行并校验它确实基于 4-shot storyboard。

如需手动拆分执行：

1. 新版本测试前清理 Postgres business tables：

```bash
pnpm db:clear -- --yes
```

2. 启动后端：

```bash
pnpm dev
```

3. 当前约定测试目录：

```text
/Users/carrick/TestWorkspace/Project-AIGC/IntegrationTest_v0/onePicture/
```

4. Postman 环境变量：

| 变量 | 默认值 | 用途 |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | 后端服务地址 |
| `workspaceName` | `0530-postman-demo` | 托管 workspace 名称 |
| `workspaceDirectory` | `/Users/carrick/TestWorkspace/Project-AIGC/IntegrationTest_v0/onePicture/` | local storage binding 的绝对工作目录 |
| `workspaceId` | 空 | 创建后自动回填 |
| `materialRef` | `display_1.png` | onePicture 场景内已有素材 ref |
| `materialFileBase64` | collection 内置 1x1 PNG | local-smoke/provider setup 都会先上传为 `materialRef` |
| `shotId` | 空 | single-shot smoke approve shotprompt 后自动回填 |
| `imagePromptArtifactId` | 空 | image prompt propose 后自动回填 |
| `imageBatchId` | 空 | image batch 创建后自动回填 |
| `imageCandidateId` | 空 | image batch 查询后自动回填 |
| `videoScriptArtifactId` | 空 | video script propose 后自动回填 |
| `videoBatchId` | 空 | video batch 创建后自动回填 |
| `videoCandidateId` | 空 | video batch 查询后自动回填 |
| `finalVideoJobId` | 空 | final compose 创建后自动回填 |
| `campaignPublicationId` | 空 | Campaign / KOL 发布记录创建后自动回填 |
| `campaignPlatform` | `douyin` | 发布平台 |
| `campaignChannelName` | `creator-alpha` | KOL / 渠道名 |
| `campaignKolName` | `Ava` | KOL 展示名 |
| `campaignPublishUrl` | `https://example.com/campaign/post-001` | 测试发布链接 |
| `imagePollAttempts` | `0` | provider collection 自动轮询 image batch |
| `videoPollAttempts` | `0` | provider collection 自动轮询 video batch |
| `pollMaxAttempts` | `80` | provider collection 最大轮询次数 |
| `pollIntervalMs` | `3000` | provider collection 每次轮询间隔 |

## Collection 结构

### 1. System

| 请求 | 断言 |
|---|---|
| `GET /api/health` | `200`；`ok === true`；`runtime` 存在。 |
| `GET /api/config/limits` | `200`；`defaultImageBatchSize`、`defaultVideoBatchSize`、`aspectRatios` 存在。 |

### 2. Workspace Pipeline

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces` | `200`；创建 logical workspace；`storage.bound === false`；回填 `workspaceId`、`scriptId`。 |
| 2 | `POST /api/workspaces/status` | `200`；未绑定时 `nextAction === BIND_STORAGE`。 |
| 3 | `POST /api/workspaces/:workspaceId/storage/bind` | `200`；绑定 `workspaceDirectory`；`storage.kind === local`。 |
| 4 | `GET /api/workspaces/:workspaceId/storage` | `200`；`storage.bound === true`。 |
| 5 | `POST /api/workspaces/status` | `200`；`materialLibrary` 可以读取绑定目录中的测试素材。 |

### 3A. Local Smoke: Shot Seed Without Models

`local-smoke` 不调用 propose/compile/generation 接口。它先上传一张 tiny PNG 到 bound workspace，再直接 `approve shotprompt`：

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces/materials` | `200`；回填 `materialRef`、`materialAssetId`；URL 是 workspace stable URL。 |
| 2 | `POST /api/workspaces/artifacts/shotprompt/approve` | `200`；固定 one-shot payload seed `storyboard_shots` + `shot_asset_refs`。 |
| 3 | `GET /api/workspaces/:workspaceId/shots` | `200`；回填第一个 `shotId`；`referenceAssetRefs` 包含 `materialRef`。 |
| 4 | `GET /api/workspaces/:workspaceId/shot-workflow-status` | `200`；`canComposeFinalVideo === false`。 |
| 5 | `GET /api/workspaces/:workspaceId/shots/:shotId/image-rounds` | `200`；未生成 prompt 前为空数组。 |
| 6 | `GET /api/workspaces/:workspaceId/shots/:shotId/video-rounds` | `200`；未生成 script 前为空数组。 |

### 3B. Provider: Artifact Pipeline

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces/material-intake` | `200`；`artifact.data.primaryProductRef` 命中 `assets[].ref`。 |
| 2 | `POST /api/workspaces/brief/propose` | `200`；brief schema 关键字段存在。 |
| 3 | `POST /api/workspaces/artifacts/brief/approve` | `200`；status 为 approved/active 语义一致。 |
| 4 | `POST /api/workspaces/storyboard/propose` | `200`；`shots.length >= 1`；`totalDurationSec` 等于 shots 时长和。 |
| 5 | `POST /api/workspaces/artifacts/storyboard/approve` | `200`。 |
| 6 | `POST /api/workspaces/shotprompt/compile` | `200`；每个 `shots[].providerPrompt` 为中文且非空。 |
| 7 | `POST /api/workspaces/artifacts/shotprompt/approve` | `200`；`pnpm realitest` 使用固定 one-shot payload seed 出 `storyboard_shots`，便于 Postman 单 shot 走完整 image/video/final 链路。 |

### 3C. Parallel Provider Acceptance

`pnpm realitest:parallel` 不使用 Newman collection；它由 `scripts/run-realitest-parallel.mjs` 直接驱动 API，避免 Postman/Newman 对动态多 shot 和并发请求的限制。

固定数据：

| Artifact | 策略 |
|---|---|
| brief | fixed approved brief |
| storyboard | fixed approved storyboard，4 个 shot，每个 4s，总 16s |
| shotprompt | 先调用 `POST /api/workspaces/shotprompt/compile`；默认 approve compile 结果，可用 `REALITEST_PARALLEL_SHOTPROMPT_SOURCE=fixed` approve 固定 4-shot shotprompt |
| video batch | 默认通过 `DEFAULT_VIDEO_BATCH_SIZE=1` 跑每 shot 1 个候选，避免 4-shot 并发验收一次触发过多 Seedance RPM；可用 `REALITEST_PARALLEL_VIDEO_BATCH_SIZE` 覆盖 |

关键断言：

| 阶段 | 断言 |
|---|---|
| shots | `GET /api/workspaces/:workspaceId/shots` 返回 `shots.length === 4`。 |
| image | 每个 shot 都产生 image prompt artifact、image batch、image candidates；batch `SUCCEEDED` 且 `failedCount === 0`；candidate URL 是 `/api/workspaces/:workspaceId/...` stable URL；每个 shot 完成 image selection。 |
| video | 全部 image selection 完成后，对 4 个 shot 使用 `Promise.allSettled` 并发发起 video script/candidate 生成；每个 shot 都产生 video script artifact、video batch、video candidates；batch `SUCCEEDED` 且 `failedCount === 0`；candidate URL 是 workspace stable URL；每个 shot 完成 video selection。 |
| final compose | 创建 final job 后轮询到 `SUCCEEDED`；`sourceShotVideoIds.length === 4`，即 final compose 输入包含 4 个 selected videos。 |
| audit gate | `.daireel/review/storyboard.approved.json` 至少 4 shot；trace 文件不能出现 `provider.failed` / `batch.failed`；DB trace 不能出现 failed event；DB 中 image/video batch 覆盖全部 shot；DB final compose 输入数等于 selected video shot 数。 |

### 4. Shot Workflow

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `GET /api/workspaces/:workspaceId/shots` | `200`；回填第一个 `shotId`；每个 shot 有 `nextAction`。 |
| 2 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | 只传 `{ userDirection? }`；`200`；回填 `imagePromptArtifactId`、内部 `imageBatchId`；响应包含 `candidates[]`、`context.image_ref`、`traceId`。默认候选数来自 `.env` 的 `DEFAULT_IMAGE_BATCH_SIZE`，当前应为 3。 |
| 3 | `GET /api/workspaces/:workspaceId/shots/:shotId/image-rounds` | `200`；轮询到 `SUCCEEDED`；断言 `succeededCount === requestedCount`、`failedCount === 0`、succeeded 候选数等于 `requestedCount`，再回填 `imageCandidateId`。`PARTIAL`/`FAILED` 视为测试失败。 |
| 4 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select` | `200`；返回 `allShotsImageSelected`；不再要求非 workspace-scoped 兼容路径。 |
| 5 | 对所有 shot 重复 2-4 | shot N>=1 必须在前一 shot 已选图后才能 propose；最后一张图选择后 `allShotsImageSelected === true`。 |
| 6 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | 所有图已选后才 `200`；只传 `{ userDirection? }`；回填 `videoScriptArtifactId`、内部 `videoBatchId`；响应包含 `candidates[]`、`frames`、`traceId`。 |
| 7 | `GET /api/workspaces/:workspaceId/shots/:shotId/video-rounds` | `200`；轮询到 `SUCCEEDED`；轮次包含上一步 `videoBatchId`、候选视频和首/末帧 URL；回填第一个 succeeded `videoCandidateId`。 |
| 8 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | `200`；最后一个 shot 后 `allShotsVideoSelected === true`。 |

### 5. Final Video

| 请求 | 断言 |
|---|---|
| `POST /api/workspaces/:workspaceId/final-videos` | 必带 `Idempotency-Key`；所有 shot 已选视频时 `200`；回填 `finalVideoJobId`。 |
| `GET /api/final-videos/:finalVideoJobId` | 返回 job 状态。 |
| `GET /api/workspaces/:workspaceId/final-videos` | 列表包含刚创建的 job。 |
| `GET /api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | job 未完成返回 `404 NOT_READY`；完成后返回 `video/mp4`。 |

### 6. Campaign / KOL

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces/:workspaceId/campaign-publications` | `200`；回填 `campaignPublicationId`；`platform/channelName/status` 与请求一致。 |
| 2 | `GET /api/workspaces/:workspaceId/campaign-publications` | `200`；列表包含刚创建的 publication；首次 `latestMetrics === null`。 |
| 3 | `GET /api/workspaces/:workspaceId/campaign-publications/:campaignPublicationId` | `200`；publication 属于当前 workspace。 |
| 4 | `POST /api/workspaces/:workspaceId/campaign-publications/:campaignPublicationId/metrics` | `200`；断言 `impressions/clicks/conversions/spendCents`；`ctr === clicks / impressions`。 |
| 5 | 再次 `GET /api/workspaces/:workspaceId/campaign-publications` | `latestMetrics.clicks` 与上一步一致。 |

## Regression Negative Cases

| 场景 | 请求 | 期望 |
|---|---|---|
| 缺 workspace 标识 | `POST /api/workspaces/status {}` | `400`，message 包含 `workspaceId or directory is required`。 |
| workspace 不存在 | `GET /api/workspaces/not-found/storage` | `404`。 |
| 未绑定 storage 上传素材 | `POST /api/workspaces/materials` | `409 STORAGE_NOT_BOUND`。 |
| 同一目录重复绑定到其他 workspace | `POST /api/workspaces/:workspaceId/storage/bind` | `409 STORAGE_ALREADY_BOUND`。 |
| 上传非法文件名 | `POST /api/workspaces/materials` filename 为 `../x.png` | `400`。 |
| 上传不支持类型 | filename 为 `.exe` | `400 Unsupported material type`。 |
| image propose 传旧字段 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` with `referenceAssetIds` | `400`，message 包含 `referenceAssetIds`。 |
| video propose 传旧字段 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` with `durationSec/useNeighborFrames` | `400`，message 包含旧字段名。 |
| shot N 缺前序 selected image 就 image propose | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | `400 NO_SCENE_ANCHOR`。 |
| 未完成全部选图就 video script | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | `400 IMAGE_SELECTION_INCOMPLETE`。 |
| select 失败候选 | image/video candidate status 为 `FAILED` | `400 CANNOT_SELECT_FAILED_CANDIDATE`。 |
| candidate 不属于 shot | 传其它 shot candidate | `400 INVALID_CANDIDATE`。 |
| final compose 缺视频选择 | `POST /api/workspaces/:workspaceId/final-videos` | `409 MISSING_SELECTIONS`。 |
| campaign publication 跨 workspace 读取 | `GET /api/workspaces/:otherWorkspaceId/campaign-publications/:campaignPublicationId` | `404`。 |
| campaign finalVideoJobId 不属于 workspace | `POST /api/workspaces/:workspaceId/campaign-publications` | `400 FINAL_VIDEO_WORKSPACE_MISMATCH`。 |
| 静态文件 path traversal | `GET /api/workspaces/:id/materials/../../x` | `400`。 |

## Postman Test Script 建议

每个请求至少包含：

```javascript
pm.test("status is successful", function () {
  pm.expect(pm.response.code).to.be.oneOf([200, 201]);
});

pm.test("response is json", function () {
  pm.response.to.have.header("Content-Type");
  pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");
});
```

关键变量回填示例：

```javascript
const json = pm.response.json();
if (json.workspace?.id) pm.collectionVariables.set("workspaceId", json.workspace.id);
if (json.data?.[0]?.id) pm.collectionVariables.set("shotId", json.data[0].id);
if (json.data?.batchId) pm.collectionVariables.set("imageBatchId", json.data.batchId);
```

轮询建议：

- 图片 batch：每 3 秒查询一次，最多 4 分钟。
- 视频 batch：每 8 秒查询一次，mock 最多 2 分钟，real 最多 15 分钟。
- final compose：每 3 秒查询一次，最多 3 分钟。

## Provider Smoke 注意事项

- 真实 provider 测试必须显式设置 `MODEL_MODE=real` 和对应 API key / endpoint。
- provider collection 会消耗模型额度；如果 `USE_REDIS_QUEUE=true`，需要 Redis 和 worker 正常运行。
- Seedance prompt 必须为中文；Postman 可断言 `providerPrompt` 中不包含英文脚手架词，如 `Role:`、`Task:`、`Return strict JSON`。
- video export 阶段不应调用 Ark text provider；该项以 Node provider boundary test 为准，Postman 只检查 trace 中没有 video export text rewrite 事件。
- Seedream / Seedance 返回的 24h URL 应由后端转存；Postman 断言 select 返回的是稳定 workspace URL，而非 provider 临时 URL。

## 交付建议

0530 Postman collection 已拆分输出到：

```text
docs/0530-dev/bytedancehack-0530.local-smoke.postman_collection.json
docs/0530-dev/bytedancehack-0530.provider.postman_collection.json
```

如果继续兼容 `docs/0529-dev/test-api/bytedancehack-api.postman_collection.json`，需要确保补齐：

- workspace-scoped select 路径。
- image/video rounds 查询。
- all-shots image-selected gate 的 negative case。
- approved shotprompt deterministic prompt 的 trace/断言。
- Campaign / KOL 发布记录与 metrics 回填。
