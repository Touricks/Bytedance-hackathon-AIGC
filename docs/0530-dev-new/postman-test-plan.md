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
| `storageKind` | `local` | 本轮 workspace storage binding 类型；0530 先测 local，预留 `s3`。 |
| `workspaceDirectory` | `/Users/carrick/TestWorkspace/Project-AIGC/0526v1` | local storage binding 的绝对工作目录。 |
| `s3Bucket` | 空 | S3 storage binding 预留变量。 |
| `s3Prefix` | 空 | S3 storage binding 预留变量；`bucket+prefix` 全局唯一绑定一个 workspace。 |
| `workspaceId` | 空 | 创建后自动回填 |
| `materialRef` | `demo-product.png` | 上传后的素材 ref |
| `materialAssetId` | 空 | 上传素材创建的 asset row id，供 `referenceAssetIds` 和 `shot_asset_refs` 验证 |
| `materialFileBase64` | 手动填入 | 测试图片 base64 |
| `shotId` | 空 | approve shotprompt 后自动回填 |
| `nextShotId` | 空 | image select 后返回的下一镜头 |
| `imagePromptArtifactId` | 空 | image prompt propose 后自动回填 |
| `imageBatchId` | 空 | image batch 创建后自动回填 |
| `imageCandidateId` | 空 | image batch 查询后自动回填 |
| `selectedImageUrl` | 空 | image select 返回的稳定关键帧 URL |
| `videoScriptArtifactId` | 空 | video script propose 后自动回填 |
| `videoBatchId` | 空 | video batch 创建后自动回填 |
| `videoCandidateId` | 空 | video batch 查询后自动回填 |
| `selectedVideoUrl` | 空 | video select 返回的稳定视频 URL |
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
| 1 | `POST /api/workspaces` | `200`；回填 `workspaceId`、`scriptId`；如果请求未带 `storage`，`workspace.storage.bound === false`。 |
| 2 | `GET /api/workspaces/:workspaceId/storage` | `200`；未绑定时 `data.bound === false`、`data.kind === null`。 |
| 3 | `POST /api/workspaces/:workspaceId/storage/bind` | local body: `{ "kind": "local", "localPath": "{{workspaceDirectory}}" }`；`200`；`data.bound === true`、`data.kind === "local"`、`data.localPath` 是绝对路径。 |
| 4 | `POST /api/workspaces/status` | `200`；storage 已绑定后 `nextAction !== "BIND_STORAGE"`。 |
| 5 | `POST /api/workspaces/materials` | `200`；回填 `materialRef`、`materialAssetId`；URL 可读；asset id 可被后续 reference 使用。 |
| 6 | `POST /api/workspaces/status` | `200`；`materialLibrary` 包含上传素材。 |

### 3. Artifact Pipeline

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces/material-intake` | `200`；`artifact.data.primaryProductRef` 命中 `assets[].ref`。 |
| 2 | `POST /api/workspaces/brief/propose` | `200`；brief schema 关键字段存在。 |
| 3 | `POST /api/workspaces/artifacts/brief/approve` | `200`；status 为 approved/active 语义一致。 |
| 4 | `POST /api/workspaces/storyboard/propose` | `200`；`shots.length >= 1`；`totalDurationSec` 等于 shots 时长和。 |
| 5 | `POST /api/workspaces/artifacts/storyboard/approve` | `200`。 |
| 6 | `POST /api/workspaces/shotprompt/compile` | `200`；每个 `shots[].providerPrompt` 为中文且非空。 |
| 7 | `POST /api/workspaces/artifacts/shotprompt/approve` | `200`；seed 出 `storyboard_shots`；每个 shot 能在详情或 rounds 中看到 `referenceAssetRefs` / `shot_asset_refs`。 |

### 4. Shot Workflow

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `GET /api/workspaces/:workspaceId/shots` | `200`；回填第一个 `shotId`；每个 shot 有 `nextAction`。 |
| 2 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | `200`；回填 `imagePromptArtifactId`；prompt trace 字段存在；response/trace 表明上下文来自 approved brief、material intake、shotprompt 和 scene anchor。 |
| 3 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-batches` | 必带 `Idempotency-Key`；`200`；回填 `imageBatchId`。 |
| 4 | `GET /api/workspaces/:workspaceId/shots/:shotId/image-batches/:imageBatchId` | 轮询到 `SUCCEEDED`/`PARTIAL`；回填第一个 succeeded `imageCandidateId`。 |
| 5 | `GET /api/workspaces/:workspaceId/shots/:shotId/image-rounds` | `200`；包含 artifact、batch、candidates；candidate 与 active artifact/batch 对得上。 |
| 6 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select` | `200`；返回 `selectedImageUrl`、`nextShotId`、`allShotsImageSelected`；URL 是稳定 workspace URL，不是 provider 24h 临时 URL。 |
| 7 | 对所有 shot 重复 2-6 | 最后一张图选择后 `allShotsImageSelected === true`。 |
| 8 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | 所有图已选后才 `200`；回填 `videoScriptArtifactId`；provider prompt 中文；中间 shot 的 trace/request 有 first frame + last frame，最后一个 shot `lastFrameUrl=null`。 |
| 9 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-batches` | 必带 `Idempotency-Key`；回填 `videoBatchId`。 |
| 10 | `GET /api/workspaces/:workspaceId/shots/:shotId/video-batches/:videoBatchId` | 轮询到终态；回填 succeeded `videoCandidateId`。 |
| 11 | `GET /api/workspaces/:workspaceId/shots/:shotId/video-rounds` | `200`；包含 script artifact、batch、candidates、first/last frame 摘要。 |
| 12 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | `200`；返回稳定 `selectedVideoUrl`；最后一个 shot 后 `allShotsVideoSelected === true`。 |

### 5. Final Video

| 请求 | 断言 |
|---|---|
| `POST /api/workspaces/:workspaceId/final-videos` | 必带 `Idempotency-Key`；所有 shot 已选视频时 `200`；回填 `finalVideoJobId`。 |
| `GET /api/workspaces/:workspaceId/final-videos/:finalVideoJobId` | 返回 job 状态。 |
| `GET /api/workspaces/:workspaceId/final-videos` | 列表包含刚创建的 job。 |
| `GET /api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | job 未完成返回 `404 NOT_READY`；完成后返回 `video/mp4`。 |

## Regression Negative Cases

| 场景 | 请求 | 期望 |
|---|---|---|
| 缺 workspace 标识 | `POST /api/workspaces/status {}` | `400`，message 包含 `workspaceId is required`。 |
| workspace 不存在 | `GET /api/workspaces/not-found/storage` | `404`。 |
| storage 未绑定就继续 | 新 workspace 后直接 `POST /api/workspaces/status` | `200`，`nextAction === "BIND_STORAGE"`；随后 `POST /api/workspaces/materials` 返回 `409 STORAGE_NOT_BOUND`。 |
| 同一 workspace 重复绑定不同 storage | 已绑定 local 后再绑定另一个 localPath 或 S3 | `409 WORKSPACE_STORAGE_ALREADY_BOUND`。 |
| 同一本地目录绑定两个 workspace | workspace A 绑定 `workspaceDirectory` 后，workspace B 绑定同一路径 | `409 STORAGE_ALREADY_BOUND`。 |
| 同一 S3 位置绑定两个 workspace | workspace A/B 使用相同 `bucket+prefix` | `409 STORAGE_ALREADY_BOUND`。 |
| 上传非法文件名 | `POST /api/workspaces/materials` filename 为 `../x.png` | `400`。 |
| 上传不支持类型 | filename 为 `.exe` | `400 Unsupported material type`。 |
| image batch 缺 idempotency | `POST /api/workspaces/:workspaceId/shots/:shotId/image-batches` | `400 IDEMPOTENCY_KEY_REQUIRED`。 |
| video batch 使用 STALE script | `POST /api/workspaces/:workspaceId/shots/:shotId/video-batches` | `409 STALE_SCRIPT`。 |
| 未选图片就 video script | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | `400 IMAGE_SELECTION_INCOMPLETE`。 |
| select 失败候选 | image/video candidate status 为 `FAILED` | `400 CANNOT_SELECT_FAILED_CANDIDATE`。 |
| candidate 不属于 shot | 传其它 shot candidate | `400 INVALID_CANDIDATE`。 |
| candidate 不属于 active round | 传 STALE artifact/batch 的 candidate | `400 INVALID_CANDIDATE` 或 `409 STALE_CANDIDATE`。 |
| candidate 与 batch 不匹配 | 传 candidateId + 错误 batchId | `400 INVALID_CANDIDATE`。 |
| 中间 shot 缺下一张 selected image | video script propose | `400 IMAGE_SELECTION_INCOMPLETE`，不允许只靠 prompt 文本生成。 |
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
if (json.material?.assetId) pm.collectionVariables.set("materialAssetId", json.material.assetId);
if (json.data?.[0]?.id) pm.collectionVariables.set("shotId", json.data[0].id);
if (json.data?.batchId) pm.collectionVariables.set("imageBatchId", json.data.batchId);
if (json.selectedImageUrl) pm.collectionVariables.set("selectedImageUrl", json.selectedImageUrl);
if (json.selectedVideoUrl) pm.collectionVariables.set("selectedVideoUrl", json.selectedVideoUrl);
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
- 中间 shot 的 Seedance request 必须包含 `first_frame` 与 `last_frame`；最后一个 shot 只应包含 `first_frame`。Postman 侧可通过 trace metadata / debug response 验证，不要求前端传 URL。

## 用户审阅重点

- 是否接受 workspace 与 storage binding 分离：`POST /api/workspaces` 只创建逻辑 workspace；`POST /api/workspaces/:workspaceId/storage/bind` 绑定 local 或 S3；未绑定时由 `/api/workspaces/status` 返回 `BIND_STORAGE` 阻断后续阶段。
- 是否接受 1:1 唯一性：一个 workspace 只能有一个 active storage；一个 localPath 或一个 S3 `bucket+prefix` 只能被一个 workspace 绑定。
- 是否接受 `POST /api/workspaces/materials` 在 0530 目标契约中返回 `assetId`，以解决素材引用不可解析问题。
- 是否接受 `shotprompt approve` 作为 `shot_asset_refs` 的唯一 seed 时机，后续人工挂素材另走独立接口。
- 是否接受视频链路必须等所有 shot 图片选完再开始，以换取 Seedance first/last frame 一致性。
- 是否要求 Postman Collection 也同步生成 JSON 文件，还是先审阅本文计划和 `openapi.yaml`。

## 交付建议

0530 第一版可以先继续使用 `docs/0529-dev/test-api/bytedancehack-api.postman_collection.json`，按本文补齐：

- workspace-scoped select 路径。
- image/video rounds 查询。
- all-shots image-selected gate 的 negative case。
- approved shotprompt deterministic prompt 的 trace/断言。
