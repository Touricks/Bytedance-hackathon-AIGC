# Postman / Newman Test Plan

更新时间：2026-06-02

## 目标

Postman collection 是后端公开契约的可读测试定义。当前真实 provider 自动测试策略已经收敛：只保留后端图像链路和视频链路 smoke，不再运行完整 real provider agent-chain、多 shot 并行验收、direct-provider one-off runner 或 final compose 联调。

| 测试 | 入口 | Provider | 目的 |
|---|---|---|---|
| 后端图像/视频链路 smoke | `pnpm --filter @aigc-video/server test:integration:smoke` | real | 仅验证后端 `image-flow` 与 `video-flow` 两条链路；图像/视频候选数固定为 1。 |
| V2 agent-chain | package script removed | removed | 关闭完整多真实模型联调，Postman 资产仅作为契约参考保留。 |
| 多 shot 并行验收 | package script removed | removed | 关闭 4-shot image/video/final compose 联调，历史 runner 已删除。 |

V2 collection 建议放在：

```text
docs/test/agent-chain/agent-chain.postman.json
docs/test/agent-chain/agent-chain.env.json
docs/test/agent-chain/agent-chain.data.json
```

provider secrets 继续来自 `.env` 与现有 `docs/test/provider.env.json`。`agent-chain.env.json` 只保存非敏感的测试路径、轮询参数和 collection 变量。

---

## 运行方式

推荐脚本形态：

```bash
pnpm --filter @aigc-video/server test:integration:smoke
```

脚本职责：

1. 连接已运行的后端服务，默认 `TEST_API_BASE_URL=http://localhost:3000`。
2. 以 `DEFAULT_IMAGE_CANDIDATES=1` / `MAX_IMAGE_CANDIDATES_PER_SHOT=1` 执行 `apps/server/test/integration/image-flow.integration.test.ts`。
3. 以 `DEFAULT_VIDEO_CANDIDATES=1` / `MAX_VIDEO_CANDIDATES_PER_SHOT=1` 执行 `apps/server/test/integration/video-flow.integration.test.ts`。
4. 不执行 Newman agent-chain、final compose、direct-provider one-off runner 或前端 real-provider E2E。

---

## 环境变量

| 变量 | 默认值 | 用途 |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | 后端服务地址。 |
| `workspaceName` | `agent-chain-v2` | 测试工作区名。 |
| `workspaceDirectory` | `/Users/carrick/TestWorkspace/Project-AIGC/IntegrationTest_v0/onePicture/` | 本地 workspace 目录。 |
| `workspaceId` | 空 | 创建后回填。 |
| `shotSetId` | 空 | apply shotprompt 后回填。 |
| `shotIds` | 空 | active shot set 创建后回填 JSON 数组。 |
| `imageCandidateIds` | 空 | 图像候选选择前回填 JSON map。 |
| `videoCandidateIds` | 空 | 视频候选选择前回填 JSON map。 |
| `finalVideoJobId` | 空 | 成片任务创建后回填。 |
| `pollMaxAttempts` | `100` | provider 轮询最大次数。 |
| `pollIntervalMs` | `3000` | provider 轮询间隔。 |
| `imageCandidateCount` | `3` | 每个 shot 图像候选数。 |
| `videoCandidateCount` | `1` | 每个 shot 视频候选数，real provider 第一版建议为 1。 |
| `REALITEST_PARALLEL_IMAGE_CANDIDATES` | disabled | 旧 parallel 联调变量；当前不使用。 |
| `REALITEST_PARALLEL_VIDEO_CANDIDATES` | disabled | 旧 parallel 联调变量；当前不使用。 |

---

## Collection 结构

### 1. System

| 顺序 | 请求 | 断言 |
|---|---|---|
| 1 | `GET /api/health` | `200`；`ok === true`；`runtime` 存在。 |
| 2 | `GET /api/config/limits` | `200`；图像/视频候选数限制与 `aspectRatios` 存在。 |
| 3 | `GET /api/pipeline/contracts` | `200`；包含 module id、prompt template、input/output schema 信息。 |

### 2. Workspace / Storage / Material

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces/directory/select` | `200`；返回 `{ directory, cancelled, method }`；取消选择时 `directory=null`。 |
| 2 | `POST /api/workspaces` | `200`；回填顶层 `workspace.id` 与 `manifest.workspaceId`。 |
| 3 | `POST /api/workspaces/:workspaceId/storage/bind` | `200`；绑定 `workspaceDirectory`。 |
| 4 | `GET /api/workspaces/:workspaceId/storage` | `200`；`kind` 为 `LOCAL` 或等价小写值。 |
| 5 | `POST /api/workspaces/:workspaceId/materials` | `200`；上传测试素材并返回 stable workspace URL。 |
| 6 | `POST /api/workspaces/:workspaceId/materials` 上传 10MB+ image | `400 IMAGE_TOO_LARGE_FOR_MODEL`；不得创建 asset。 |
| 7 | `DELETE /api/workspaces/:workspaceId/materials/:ref` | `200`；删除素材文件与 asset 记录；路径穿越 ref 返回 `400 INVALID_MATERIAL_REF`。 |
| 8 | `GET /api/workspaces/:workspaceId/status` | `200`；`modules`、`storage`、`activeShotSet` 字段存在。 |
| 9 | `DELETE /api/workspaces/:workspaceId` | `200`；仅删除 LOCAL 工作目录下 `.daireel/` 与该 workspace 的业务记录；普通用户文件保留；`GET /api/workspaces` 不再列出该 workspace。 |

工作区删除当前是同步 MVP，不是跨 DB + 文件系统真事务；S3 active binding 只验证接口边界，返回 `501 S3_WORKSPACE_DELETE_NOT_IMPLEMENTED`，不声明已经执行对象存储 prefix 物理删除。

### 3. Prompt Requirements

| 顺序 | 请求 | 断言 |
|---|---|---|
| 1 | `POST /api/workspaces/:workspaceId/prompt-requirements/propose` | `200`；`moduleId === "prompt-requirements"`；`status === "proposed"`。 |
| 2 | `POST /api/workspaces/:workspaceId/prompt-requirements/approve` | `200`；`status === "approved"`；`isCurrent === true`。 |
| 3 | `GET /api/workspaces/:workspaceId/prompt-requirements` | `current.id` 等于 approve 返回 id。 |

测试 payload 必须覆盖：

- `image`：整体图像风格要求。
- `script`：剧本语气和营销表达要求。
- `storyboard`：节奏和镜头结构要求。
- `shotImage`：分镜图全局要求。
- `shotVideo`：分镜视频全局要求。

### 4. Workspace Module Artifacts

对以下模块重复 `propose -> approve -> get`：

| 模块 | Propose | Approve | 关键断言 |
|---|---|---|---|
| `material-intake` | `POST /api/workspaces/:workspaceId/material-intake/propose` | `POST /api/workspaces/:workspaceId/material-intake/approve` | 读取 workspace materials 与 prompt requirements。 |
| `product-brief` | `POST /api/workspaces/:workspaceId/product-brief/propose` | `POST /api/workspaces/:workspaceId/product-brief/approve` | brief 字段完整；`sourceFingerprint.materialIntakeArtifactId` 存在。 |
| `storyboard` | `POST /api/workspaces/:workspaceId/storyboard/propose` | `POST /api/workspaces/:workspaceId/storyboard/approve` | 固定 P0 15 秒三镜；`purpose` 顺序为 `hook/proof/cta`；每段口播有效字数不超过 `durationSec * 5`。 |
| `storyboard voiceover rewrite` | `POST /api/workspaces/:workspaceId/storyboard/voiceover/propose` | `POST /api/workspaces/:workspaceId/storyboard/approve` | 请求体带当前 storyboard draft；返回新的 proposed storyboard，只改 `shots[].voiceover`，`sourceFingerprint.rewriteKind=voiceover` 且 current 不变。 |
| `shotprompt` | `POST /api/workspaces/:workspaceId/shotprompt/propose` | `POST /api/workspaces/:workspaceId/shotprompt/approve` | `shots.length`、顺序和 index 与 approved storyboard 一致；每个 `shots[]` 都有 `shotImage` 和 `shotVideo` dict。 |

公共断言：

- propose 只返回 `status=proposed`，不改变 current。
- approve 返回 `status=approved` 且 `isCurrent=true`。
- 响应包含 `promptAssembly.subjectTemplateId`、`promptAssembly.contractTemplateId`、`subjectHash` 与 `contractHash`。
- 下游模块响应的 `sourceFingerprint` 指向当前上游 artifact。

### 5. Shot Set Apply

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `GET /api/workspaces/:workspaceId/shots` | 在 apply 前返回 `400 NO_ACTIVE_SHOT_SET` 或空 active 语义。 |
| 2 | `POST /api/workspaces/:workspaceId/shot-sets` | `200`；创建 active shot set；回填 `shotSetId`。 |
| 3 | `GET /api/workspaces/:workspaceId/shots` | 只返回 active shot set 的 shots；`shots.length === approvedShotPrompt.shots.length`；每个 shot 有 `requirements.shotImage` 与 `requirements.shotVideo`。 |
| 4 | `GET /api/workspaces/:workspaceId/shot-sets` | 只返回 active shot set；每条记录包含 `shotCount` 与 `upstream`。 |
| 5 | `GET /api/shots/:shotId/asset-refs` | `200`；返回 shot 当前素材引用，包含 `assetId`、`role`、`weight`、`position`。 |
| 6 | `PATCH /api/shots/:shotId/asset-refs` | `200`；按请求体顺序替换素材引用；返回更新后的 refs；不重跑图像/视频链路。 |

负向断言：

- `shotprompt approve` 之后、`shot-sets` apply 之前，DB 中不应出现新 `storyboard_shots`。
- `GET /api/workspaces/:workspaceId/shot-sets/:shotSetId/shots` 不再是业务接口；请求旧归档实例路径应返回不可用响应。
- 重新 propose/approve shotprompt 不应归档当前 active shot set，只应让 `/status.activeShotSet.upstream.upstreamChanged === true`。
- 重新 apply 新 shotprompt 后，`shot-workflow-status.data.shots.length` 等于新 active shot set shot 数，不混入 archived rows。
- `PATCH /api/shots/:shotId/asset-refs` 传不存在或跨 workspace asset 时返回 `400 INVALID_ASSET_REF`；对 archived shot 返回 `400 SHOT_NOT_IN_ACTIVE_SET`。

### 6. Image Chain

对 active shot set 的每个 shot 顺序执行：

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose` | `200`；返回 image prompt artifact 与 batch；artifact 有 prompt assembly metadata。 |
| 2 | `GET /api/workspaces/:workspaceId/shots/:shotId/image-rounds` | 轮询到 batch `SUCCEEDED`；候选数达到 `imageCandidateCount`。 |
| 3 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-candidates/select` | `200`；返回 `imageSelectArtifact.imageCandidateId`；重复选择可覆盖。 |
| 4 | `POST /api/workspaces/:workspaceId/shots/:shotId/image-prompts/regenerate` | `200`；请求必须包含 `baseArtifactId`、最新轮成功候选 `feedbackImageCandidateId` 与非空 `userDirection`；新 artifact `createdBy === "user"`，`baseArtifactId` 等于旧 artifact；`promptJson.context/source_fingerprint` 包含 `shotGoal`、`shotImage`、`feedbackImageCandidateId`、`userDirection`；Seedream 参考图第一位为反馈候选图；原 `selectedImageId` 保留。 |

选择断言：

- select 不会将未选候选标记为 stale。
- DB 中每个 shot 在 `image_select_artifacts` 只有一条 selection。
- 前端可继续从旧候选中重新选择。
- image rounds 在新轮次中仍返回 current selection，供 UI 显示“当前选择仍保留”。

### 7. Video Chain

全部 shot 已完成 image selection 后执行：

| 顺序 | 请求 | 断言 / 变量 |
|---|---|---|
| 1 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose` | `200`；输入使用当前 selected image 和下一镜 selected image；artifact 有 prompt assembly metadata。 |
| 2 | `GET /api/workspaces/:workspaceId/shots/:shotId/video-rounds` | 轮询到 batch `SUCCEEDED`；候选数达到 `videoCandidateCount`。 |
| 3 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-candidates/select` | `200`；返回 `videoSelectArtifact.videoCandidateId`；重复选择可覆盖。 |
| 4 | `POST /api/workspaces/:workspaceId/shots/:shotId/video-scripts/regenerate` | `200`；请求必须包含 `baseArtifactId`、最新轮成功候选 `feedbackVideoCandidateId` 与非空 `userDirection`；新 artifact `createdBy === "user"`；providerRequest 记录 `feedbackVideoCandidateId`、首尾帧、voiceover、voiceProfileHash；原 `selectedVideoId` 保留。 |

负向断言：

- 未完成全部 image selection 时 propose video script 返回 `IMAGE_SELECTION_INCOMPLETE`。
- storyboard shot 低于 4 秒时，server 创建 video script 会夹到 Seedance 允许的 4 秒下限，避免真实 provider 返回 duration boundary error。
- first/last frame 查询只读 active shot set；archived selected images 不参与 next frame。
- `video_script_artifacts.source_fingerprint` 包含 `firstFrameCandidateId`、`lastFrameCandidateId`、`voiceProfileHash` 和本镜 `voiceover`。
- Seedance provider prompt 包含统一 narrator / voice profile、只朗读本镜口播，并明确旁白只进入音频，禁止将口播文案/旁白文字复制、叠加或渲染到视频画面内。

### 8. Final Compose

| 顺序 | 请求 | 断言 |
|---|---|---|
| 1 | `POST /api/workspaces/:workspaceId/final-videos` | 必带 `Idempotency-Key`；`200`；返回 `shotSetId` 和有序 `sourceVideoCandidateIds`。 |
| 2 | `GET /api/final-videos/:finalVideoJobId` | 轮询到 `SUCCEEDED`。 |
| 3 | `GET /api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file` | 成功后返回 `video/mp4`。 |

DB 断言：

- `sourceVideoCandidateIds.length === activeShotSet.shots.length`。
- `final_video_jobs.shot_set_id === shotSetId`。

### 9. Trace

| 请求 | 断言 |
|---|---|
| `GET /api/workspaces/:workspaceId/traces` | 包含 module agent run、provider call、state transition。 |
| `GET /api/shots/:shotId/traces` | 包含 image/video prompt assembly、batch events、provider request/response 摘要。 |

本地文件断言：直接读取 `<workspaceDirectory>/.daireel/trace/events.jsonl` 与 `<workspaceDirectory>/.daireel/trace/provider_call.jsonl`。

trace 中不应出现：

- `provider.failed`
- `batch.failed`
- 缺失 `subjectTemplateId` 或 `contractTemplateId` 的 agent event

---

## Regression Negative Cases

| 场景 | 请求 | 期望 |
|---|---|---|
| 下游缺上游 current | 直接 `product-brief/propose` | `400 NO_CURRENT_APPROVED_ARTIFACT`。 |
| 未 apply shot set | `GET /api/workspaces/:workspaceId/shots` | `400 NO_ACTIVE_SHOT_SET` 或空 active 语义。 |
| candidate 不属于 shot | image/video select 传其他 shot candidate | `409 CANDIDATE_NOT_SELECTABLE`。 |
| select 失败候选 | image/video candidate status 为 `FAILED` | `409 CANDIDATE_NOT_SELECTABLE`。 |
| 未完成选图就视频脚本 | `video-scripts/propose` | `400 IMAGE_SELECTION_INCOMPLETE`。 |
| 缺视频选择就成片 | `final-videos` | `409 MISSING_SELECTIONS`。 |
| 成片缺幂等头 | `final-videos` | `400 IDEMPOTENCY_KEY_REQUIRED`。 |
| 重复绑定 storage | `storage/bind` | `409 STORAGE_ALREADY_BOUND`。 |
| 静态文件 path traversal | `/materials/../../x` | `400`。 |
| 10MB+ 图片素材 | `POST /workspaces/:workspaceId/materials` | `400 IMAGE_TOO_LARGE_FOR_MODEL`。 |
| 删除不存在素材 | `DELETE /workspaces/:workspaceId/materials/:ref` | `404 MATERIAL_NOT_FOUND`。 |
| 删除 busy 工作区 | `DELETE /workspaces/:workspaceId` 且存在 `PENDING/RUNNING` generation 或 final video job | `409 WORKSPACE_DELETE_BUSY`，DB workspace 和 `.daireel/` 均保留。 |
| 删除 S3 工作区 | `DELETE /workspaces/:workspaceId` 且 active storage 为 S3 | `501 S3_WORKSPACE_DELETE_NOT_IMPLEMENTED`，DB workspace 保留；MVP 不做 S3 object cleanup。 |
| archived shot 操作 | 对 archived shot select/propose/list rounds | `400 SHOT_NOT_IN_ACTIVE_SET`。 |
| invalid shot 素材引用 | `PATCH /api/shots/:shotId/asset-refs` 传不存在或跨 workspace asset | `400 INVALID_ASSET_REF`。 |
| 用户编辑 image prompt base artifact 不属于 shot | `image-prompts/regenerate` | `400 INVALID_BASE_IMAGE_PROMPT`。 |

---

## Newman 断言建议

公共响应：

```javascript
pm.test("status is successful", function () {
  pm.expect(pm.response.code).to.be.oneOf([200, 201]);
});

pm.test("response is json", function () {
  pm.response.to.have.header("Content-Type");
  pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");
});
```

artifact current 断言：

```javascript
const json = pm.response.json();
const artifact = json.data?.artifact || json.data;
pm.expect(artifact.status).to.eql("approved");
pm.expect(artifact.isCurrent).to.eql(true);
pm.expect(artifact.promptAssembly.subjectTemplateId).to.be.a("string");
pm.expect(artifact.promptAssembly.contractTemplateId).to.be.a("string");
pm.expect(artifact.promptAssembly.subjectHash).to.match(/^[a-f0-9]{64}$/);
pm.expect(artifact.promptAssembly.contractHash).to.match(/^[a-f0-9]{64}$/);
```

shot requirement 断言：

```javascript
const shots = pm.response.json().data;
pm.expect(shots.length).to.be.above(0);
for (const shot of shots) {
  pm.expect(shot.requirements.shotImage).to.be.an("object");
  pm.expect(shot.requirements.shotVideo).to.be.an("object");
}
```

---

## 与旧 collection 的差异

- 不再使用 `/api/workspaces/status` POST；状态查询改为 `GET /api/workspaces/:workspaceId/status`。
- 不再使用 `/api/workspaces/materials` 全局上传；素材上传改为 `POST /api/workspaces/:workspaceId/materials`。
- 不再使用 `/api/workspaces/artifacts/*/approve`；每个模块有自己的 `/approve`。
- 不再使用 `shotprompt approve` seed shots；必须显式 `POST /api/workspaces/:workspaceId/shot-sets`。
- 不再把主链路 artifact 写入 `workspace_artifact`。
- 不再使用 `selected_shot_images` / `selected_shot_videos` 语义；选择由 `image_select_artifacts` / `video_select_artifacts` 表达。
