# Postman Test Plan

更新时间：2026-05-30

## 目标

Postman 用于验证后端公开契约和真实服务联调，不替代 Node test。建议分三套运行：

| 套件 | 目的 | Provider |
|---|---|---|
| Contract Smoke | 快速确认 API path、schema、状态码和变量回填 | `MODEL_MODE=mock` |
| Regression Negative | 校验关键失败场景和错误码 | `MODEL_MODE=mock` |
| Provider Smoke | 小批量真实模型联调，确认 Ark/Seedream/Seedance 边界 | `MODEL_MODE=real` |

## 运行前准备

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
/Users/carrick/TestWorkspace/Project-AIGC/0526v1
```

4. Postman 环境变量：

| 变量 | 默认值 | 用途 |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | 后端服务地址 |
| `workspaceName` | `0530-postman-demo` | 托管 workspace 名称 |
| `workspaceDirectory` | `/Users/carrick/TestWorkspace/Project-AIGC/0526v1` | 目录初始化/恢复 |
| `workspaceId` | 空 | 创建后自动回填 |
| `materialRef` | `demo-product.png` | 上传后的素材 ref |
| `materialFileBase64` | 手动填入 | 测试图片 base64 |
| `shotId` | 空 | approve shotprompt 后自动回填 |
| `imagePromptArtifactId` | 空 | image prompt propose 后自动回填 |
| `imageBatchId` | 空 | image batch 创建后自动回填 |
| `imageCandidateId` | 空 | image batch 查询后自动回填 |
| `videoScriptArtifactId` | 空 | video script propose 后自动回填 |
| `videoBatchId` | 空 | video batch 创建后自动回填 |
| `videoCandidateId` | 空 | video batch 查询后自动回填 |
| `finalVideoJobId` | 空 | final compose 创建后自动回填 |

## Collection 结构

### 1. System

| 请求 | 断言 |
|---|---|
| `GET /api/health` | `200`；`ok === true`；`runtime` 存在。 |
| `GET /api/config/limits` | `200`；`defaultImageBatchSize`、`defaultVideoBatchSize`、`aspectRatios` 存在。 |

### 2. Workspace Pipeline

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces` | `200`；回填 `workspaceId`、`scriptId`。 |
| 2 | `GET /api/workspaces/:workspaceId/directory` | `200`；`data.directory` 是绝对路径。 |
| 3 | `POST /api/workspaces/materials` | `200`；回填 `materialRef`；URL 可读。 |
| 4 | `POST /api/workspaces/status` | `200`；`materialLibrary` 包含上传素材。 |

### 3. Artifact Pipeline

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces/material-intake` | `200`；`artifact.data.primaryProductRef` 命中 `assets[].ref`。 |
| 2 | `POST /api/workspaces/brief/propose` | `200`；brief schema 关键字段存在。 |
| 3 | `POST /api/workspaces/artifacts/brief/approve` | `200`；status 为 approved/active 语义一致。 |
| 4 | `POST /api/workspaces/storyboard/propose` | `200`；`shots.length >= 1`；`totalDurationSec` 等于 shots 时长和。 |
| 5 | `POST /api/workspaces/artifacts/storyboard/approve` | `200`。 |
| 6 | `POST /api/workspaces/shotprompt/compile` | `200`；每个 `shots[].providerPrompt` 为中文且非空。 |
| 7 | `POST /api/workspaces/artifacts/shotprompt/approve` | `200`；seed 出 `storyboard_shots`。 |

### 4. Shot Workflow

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `GET /api/workspaces/:workspaceId/shots` | `200`；回填第一个 `shotId`；每个 shot 有 `nextAction`。 |
| 2 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | `200`；回填 `imagePromptArtifactId`；prompt trace 字段存在。 |
| 3 | `POST /api/shots/:shotId/image-batches` | 必带 `Idempotency-Key`；`200`；回填 `imageBatchId`。 |
| 4 | `GET /api/shots/:shotId/image-batches/:imageBatchId` | 轮询到 `SUCCEEDED`/`PARTIAL`；回填第一个 succeeded `imageCandidateId`。 |
| 5 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select` | `200`；返回 `allShotsImageSelected`；兼容路径 `/api/shots/:shotId/selected-image` 也要可用。 |
| 6 | 对所有 shot 重复 2-5 | 最后一张图选择后 `allShotsImageSelected === true`。 |
| 7 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | 所有图已选后才 `200`；回填 `videoScriptArtifactId`；provider prompt 中文。 |
| 8 | `POST /api/shots/:shotId/video-batches` | 必带 `Idempotency-Key`；回填 `videoBatchId`。 |
| 9 | `GET /api/shots/:shotId/video-batches/:videoBatchId` | 轮询到终态；回填 succeeded `videoCandidateId`。 |
| 10 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | `200`；最后一个 shot 后 `allShotsVideoSelected === true`。 |

### 5. Final Video

| 请求 | 断言 |
|---|---|
| `POST /api/workspaces/:workspaceId/final-videos` | 必带 `Idempotency-Key`；所有 shot 已选视频时 `200`；回填 `finalVideoJobId`。 |
| `GET /api/final-videos/:finalVideoJobId` | 返回 job 状态。 |
| `GET /api/workspaces/:workspaceId/final-videos` | 列表包含刚创建的 job。 |
| `GET /api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | job 未完成返回 `404 NOT_READY`；完成后返回 `video/mp4`。 |

## Regression Negative Cases

| 场景 | 请求 | 期望 |
|---|---|---|
| 缺 workspace 标识 | `POST /api/workspaces/status {}` | `400`，message 包含 `workspaceId or directory is required`。 |
| workspace 不存在 | `GET /api/workspaces/not-found/directory` | `404`。 |
| 上传非法文件名 | `POST /api/workspaces/materials` filename 为 `../x.png` | `400`。 |
| 上传不支持类型 | filename 为 `.exe` | `400 Unsupported material type`。 |
| image batch 缺 idempotency | `POST /api/shots/:shotId/image-batches` | `400 IDEMPOTENCY_KEY_REQUIRED`。 |
| video batch 使用 STALE script | `POST /api/shots/:shotId/video-batches` | `409 STALE_SCRIPT`。 |
| 未选图片就 video script | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | 0530 目标：`400 IMAGE_SELECTION_INCOMPLETE`；兼容现状可能是 `409 NO_SELECTED_IMAGE`。 |
| select 失败候选 | image/video candidate status 为 `FAILED` | `400 CANNOT_SELECT_FAILED_CANDIDATE`。 |
| candidate 不属于 shot | 传其它 shot candidate | `400 INVALID_CANDIDATE`。 |
| final compose 缺视频选择 | `POST /api/workspaces/:workspaceId/final-videos` | `409 MISSING_SELECTIONS`。 |
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
- Seedance prompt 必须为中文；Postman 可断言 `providerPrompt` 中不包含英文脚手架词，如 `Role:`、`Task:`、`Return strict JSON`。
- video export 阶段不应调用 Ark text provider；该项以 Node provider boundary test 为准，Postman 只检查 trace 中没有 video export text rewrite 事件。
- Seedream / Seedance 返回的 24h URL 应由后端转存；Postman 断言 select 返回的是稳定 workspace URL，而非 provider 临时 URL。

## 交付建议

0530 第一版可以先继续使用 `docs/0529-dev/test-api/bytedancehack-api.postman_collection.json`，按本文补齐：

- workspace-scoped select 路径。
- image/video rounds 查询。
- all-shots image-selected gate 的 negative case。
- approved shotprompt deterministic prompt 的 trace/断言。
