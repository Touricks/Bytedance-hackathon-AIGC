# 后端模块测试设计草案：单元测试 + 真实 API 集成测试

> 版本：v0.1  
> 日期：2026-05-28  
> 适用范围：分镜图 → 分镜视频 → 候选视频生成工作流的后端模块测试设计  
> 技术栈假设：Node.js + TypeScript + Fastify/Express + Postgres + Object Storage + Job Queue + OpenAI Agents SDK / 外部图像与视频 Provider

---

## 1. 背景与目标

当前后端设计围绕如下主链路展开：

```txt
workspace
  -> material intake
  -> brief
  -> storyboard
  -> shotprompt
  -> storyboard image prompt
  -> generate 3 storyboard images
  -> user selects image
  -> video shot script
  -> user edits script
  -> generate 5 shot videos
  -> user selects video
  -> final video generate / preview / export
```

测试目标不是只验证“接口能调通”，而是验证以下工程约束：

1. **状态机正确**：前端只依赖服务端返回的 `status` 与 `nextAction` 推进流程。
2. **Artifact 可追踪**：prompt、图片候选、用户选择、视频剧本、视频候选都要有版本和来源。
3. **用户交互断点正确**：`userSelect()`、`userEdit()` 是业务暂停点，不应被 agent 自动跳过。
4. **长任务可恢复**：图片/视频生成任务可轮询、可失败、可重试、刷新后可恢复。
5. **Provider 边界稳定**：文本 agent、图像 provider、视频 provider 的职责清晰，最终视频生成不得偷偷调用文本模型改写已确认的 prompt。
6. **真实 API 集成测试可配置**：集成测试只通过真实 HTTP API 调用系统，不 import 后端模块、不使用 in-memory app；外部 provider 的 endpoint、apiKey、model、timeout 都必须通过配置注入。

---

## 2. 测试分层原则

### 2.1 单元测试 Unit Test

单元测试关注**模块内逻辑**，允许 mock / fake 外部依赖。

适合单元测试的内容：

- 状态机流转规则
- `nextAction` 计算
- artifact versioning 规则
- stale / invalidate 规则
- prompt builder 拼接逻辑
- Zod schema 校验
- workflow service 的步骤编排
- repository mapper / DTO mapper
- provider client 的请求构造
- job worker 的幂等、重试和错误分支
- final prompt compiler 合约

单元测试不做：

- 不调用真实 LLM
- 不调用真实图像生成
- 不调用真实视频生成
- 不依赖真实网络
- 不验证 AI 文本语义，只验证结构、字段、边界和调用参数

---

### 2.2 集成测试 Integration Test

集成测试遵循你的设想：**只做真实 API 调用**。

这意味着：

- 测试进程只通过 `fetch` / `undici` / `axios` 调用后端 HTTP endpoint。
- 不直接 import server app。
- 不使用 `supertest(app)` 这类 in-memory server 测试。
- 不直接调用 service/repository/worker 方法。
- 不 mock provider。
- 所有外部 provider 的 endpoint / apiKey / model 都通过环境变量或 secret 配置。
- 测试断言尽量基于 API response、job detail、trace API、artifact detail API，而不是直接查 DB。

集成测试适合验证：

- API contract
- 真实鉴权/路由/middleware
- 文件上传
- 后端模块协作
- Postgres/Object Storage/Queue 的真实连通
- 真实 provider 调用链路
- job polling 生命周期
- 刷新恢复场景
- trace / provider boundary

---

### 2.3 E2E Test

E2E 通过浏览器覆盖前端主链路，建议后续由 Playwright 实现。本文重点只覆盖后端单元测试与后端集成测试。

---

## 3. 推荐测试命令

```json
{
  "scripts": {
    "test": "pnpm test:unit",
    "test:unit": "vitest run --config vitest.unit.config.ts",
    "test:unit:watch": "vitest --config vitest.unit.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:integration:smoke": "vitest run --config vitest.integration.config.ts --testNamePattern='@smoke'",
    "test:integration:provider": "RUN_REAL_PROVIDER_TESTS=true vitest run --config vitest.integration.config.ts --testNamePattern='@provider'",
    "test:integration:expensive": "RUN_REAL_PROVIDER_TESTS=true ALLOW_EXPENSIVE_TESTS=true vitest run --config vitest.integration.config.ts --testNamePattern='@expensive'",
    "test:ci": "pnpm lint && pnpm typecheck && pnpm test:unit"
  }
}
```

建议约定：

```txt
*.unit.test.ts         单元测试
*.integration.test.ts  真实 HTTP API 集成测试
*.provider.test.ts     真实 provider 冒烟测试，可选且默认跳过
```

---

## 4. 测试目录结构

```txt
apps/server/
  src/
    modules/
      shot/
        shot.state.ts
        shot.workflow.ts
        shot.routes.ts
        shot.repository.ts
      generation/
        image.provider.ts
        video.provider.ts
        generation.worker.ts
      artifact/
        artifact.versioning.ts
      config/
        provider.config.ts
        integration-test.config.ts

  test/
    fixtures/
      product-main.jpg
      reference-style.jpg
      product-demo.mp4

    helpers/
      api-client.ts
      poll.ts
      test-run-id.ts
      multipart.ts
      assert-artifact.ts
      provider-env.ts

    unit/
      shot.state.unit.test.ts
      shot.workflow.unit.test.ts
      artifact.versioning.unit.test.ts
      final-prompt-compiler.unit.test.ts
      provider-config.unit.test.ts
      generation-worker.unit.test.ts

    integration/
      workspace.integration.test.ts
      material-upload.integration.test.ts
      storyboard-image.integration.test.ts
      video-script.integration.test.ts
      video-generation.integration.test.ts
      final-export.integration.test.ts
      trace-boundary.integration.test.ts
```

---

## 5. 集成测试配置设计

### 5.1 核心原则

集成测试必须可以在不同环境运行：

- 本地开发环境
- Docker Compose 本地测试环境
- Staging 环境
- CI 手动触发环境
- Nightly 环境

所以不能硬编码：

- 后端 API base URL
- 外部文本模型 endpoint
- 图像生成 endpoint
- 视频生成 endpoint
- API key
- provider model id
- object storage endpoint
- job polling timeout

---

### 5.2 环境变量建议

```bash
# 被测后端 API
TEST_API_BASE_URL=http://localhost:3000
TEST_API_KEY=dev-test-key
TEST_WORKSPACE_PREFIX=it
TEST_RUN_ID=local-20260528-001

# 是否允许真实 provider 调用
RUN_REAL_PROVIDER_TESTS=false
ALLOW_EXPENSIVE_TESTS=false

# Text / Agent provider
AI_TEXT_PROVIDER=openai
AI_TEXT_BASE_URL=https://api.openai.com/v1
AI_TEXT_API_KEY=***
AI_TEXT_MODEL=gpt-5.5
AI_TEXT_TIMEOUT_MS=60000

# Image provider
IMAGE_PROVIDER=seedream
IMAGE_PROVIDER_BASE_URL=https://example-image-provider/v1
IMAGE_PROVIDER_API_KEY=***
IMAGE_PROVIDER_MODEL=seedream-vx
IMAGE_PROVIDER_TIMEOUT_MS=120000

# Video provider
VIDEO_PROVIDER=seedance
VIDEO_PROVIDER_BASE_URL=https://example-video-provider/v1
VIDEO_PROVIDER_API_KEY=***
VIDEO_PROVIDER_MODEL=seedance-vx
VIDEO_PROVIDER_TIMEOUT_MS=900000
VIDEO_GENERATION_POLL_INTERVAL_MS=5000
VIDEO_GENERATION_MAX_WAIT_MS=900000

# Object storage / media URL
OBJECT_STORAGE_ENDPOINT=http://localhost:9000
OBJECT_STORAGE_BUCKET=daireel-it
OBJECT_STORAGE_ACCESS_KEY=***
OBJECT_STORAGE_SECRET_KEY=***

# 测试清理策略
TEST_CLEANUP_ENABLED=true
TEST_CLEANUP_TTL_HOURS=24
```

---

### 5.3 支持 apiKeyEndpoint / secret endpoint

如果你们不希望在 CI 环境直接暴露 provider apiKey，可以支持 `apiKeyEndpoint` 或 secret manager 拉取。

配置优先级建议：

```txt
1. 直接环境变量：IMAGE_PROVIDER_API_KEY
2. Secret endpoint：IMAGE_PROVIDER_API_KEY_ENDPOINT
3. Secret manager：IMAGE_PROVIDER_SECRET_NAME
4. 本地 .env.integration.local
```

示例：

```bash
IMAGE_PROVIDER_API_KEY_ENDPOINT=https://internal-secret-service/keys/image-provider
VIDEO_PROVIDER_API_KEY_ENDPOINT=https://internal-secret-service/keys/video-provider
```

后端启动时统一解析成 runtime config：

```ts
export interface ProviderRuntimeConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}
```

注意：测试日志中必须屏蔽 key。

```ts
function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
```

---

### 5.4 Zod 配置校验

```ts
// apps/server/test/helpers/provider-env.ts
import { z } from "zod";

export const IntegrationEnvSchema = z.object({
  TEST_API_BASE_URL: z.string().url(),
  TEST_API_KEY: z.string().optional(),

  RUN_REAL_PROVIDER_TESTS: z.enum(["true", "false"]).default("false"),
  ALLOW_EXPENSIVE_TESTS: z.enum(["true", "false"]).default("false"),

  AI_TEXT_BASE_URL: z.string().url().optional(),
  AI_TEXT_API_KEY: z.string().optional(),
  AI_TEXT_MODEL: z.string().optional(),

  IMAGE_PROVIDER_BASE_URL: z.string().url().optional(),
  IMAGE_PROVIDER_API_KEY: z.string().optional(),
  IMAGE_PROVIDER_MODEL: z.string().optional(),

  VIDEO_PROVIDER_BASE_URL: z.string().url().optional(),
  VIDEO_PROVIDER_API_KEY: z.string().optional(),
  VIDEO_PROVIDER_MODEL: z.string().optional(),

  VIDEO_GENERATION_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  VIDEO_GENERATION_MAX_WAIT_MS: z.coerce.number().default(900000),
});

export function loadIntegrationEnv() {
  const env = IntegrationEnvSchema.parse(process.env);

  if (env.RUN_REAL_PROVIDER_TESTS === "true") {
    const required = [
      "AI_TEXT_BASE_URL",
      "AI_TEXT_API_KEY",
      "IMAGE_PROVIDER_BASE_URL",
      "IMAGE_PROVIDER_API_KEY",
      "VIDEO_PROVIDER_BASE_URL",
      "VIDEO_PROVIDER_API_KEY",
    ] as const;

    for (const key of required) {
      if (!env[key]) {
        throw new Error(`Missing required real provider config: ${key}`);
      }
    }
  }

  return env;
}
```

---

## 6. 单元测试设计

## 6.1 状态机测试

目标：验证 shot 状态与 `nextAction` 收敛。

测试文件：

```txt
apps/server/test/unit/shot.state.unit.test.ts
```

覆盖点：

| 场景 | 断言 |
|---|---|
| 初始 shot | `DRAFT -> GENERATE_IMAGE_PROMPT` |
| 图片 prompt 已生成 | `IMAGE_PROMPT_READY -> GENERATE_3_IMAGES` |
| 图片候选生成中 | `IMAGE_GENERATING -> POLL_IMAGE_BATCH` |
| 图片候选已生成 | `IMAGE_CANDIDATES_READY -> SELECT_IMAGE` |
| 用户已选图 | `IMAGE_SELECTED -> GENERATE_VIDEO_SCRIPT` |
| 视频剧本已生成 | `VIDEO_SCRIPT_READY -> EDIT_OR_GENERATE_5_VIDEOS` |
| 用户已编辑视频剧本 | `VIDEO_SCRIPT_EDITED -> GENERATE_5_VIDEOS` |
| 视频生成中 | `VIDEO_GENERATING -> POLL_VIDEO_BATCH` |
| 视频候选已生成 | `VIDEO_CANDIDATES_READY -> SELECT_VIDEO` |
| 用户已选视频 | `VIDEO_SELECTED -> READY_FOR_FINAL_EXPORT` |

示例：

```ts
import { describe, expect, it } from "vitest";
import { getNextAction, canTransition } from "../../src/modules/shot/shot.state";

describe("shot state machine", () => {
  it("maps IMAGE_CANDIDATES_READY to SELECT_IMAGE", () => {
    expect(getNextAction("IMAGE_CANDIDATES_READY")).toBe("SELECT_IMAGE");
  });

  it("disallows skipping image selection", () => {
    expect(canTransition("IMAGE_CANDIDATES_READY", "VIDEO_SCRIPT_READY")).toBe(false);
  });

  it("allows selected image to generate video script", () => {
    expect(canTransition("IMAGE_SELECTED", "VIDEO_SCRIPT_READY")).toBe(true);
  });
});
```

---

## 6.2 Artifact 版本测试

目标：验证每次用户修改都创建新版本，而不是覆盖旧版本。

覆盖点：

1. agent 创建 `image_prompt_artifact v1`
2. 用户编辑 prompt 后创建 `image_prompt_artifact v2`
3. `generate3Images()` 必须读取最新版本
4. 用户重新选图后，旧 video script 标记为 `STALE`
5. 用户编辑 video script 后创建新版本
6. video batch 必须绑定固定的 `scriptId`，不能运行时读取 latest

示例：

```ts
it("creates new video script version when user edits script", () => {
  const base = createVideoScriptArtifact({ version: 1, createdBy: "agent" });

  const edited = createEditedScriptVersion(base, {
    providerPrompt: "new provider prompt",
    durationSec: 5,
  });

  expect(edited.version).toBe(2);
  expect(edited.createdBy).toBe("user");
  expect(edited.baseArtifactId).toBe(base.id);
  expect(base.providerPrompt).not.toBe(edited.providerPrompt);
});
```

---

## 6.3 Workflow Service 单元测试

目标：使用 fake repository、fake agent、fake provider 验证显式串联逻辑。

测试对象：

```txt
ShotWorkflowService
```

### generateImagePrompt()

断言：

- 读取 workspace / product brief / shot / assets
- 调用 `StoryboardImagePromptAgent`
- 保存 `ImagePromptArtifact`
- 状态变为 `IMAGE_PROMPT_READY`
- 返回 `nextAction = GENERATE_3_IMAGES`

### generate3Images()

断言：

- 读取最新 prompt artifact
- 调用 image provider 时 `count = 3`
- 保存 batch 与 3 个 candidate
- 状态变为 `IMAGE_CANDIDATES_READY`
- 部分失败时 batch 为 `PARTIAL`

### userSelect()

断言：

- 保存 selected image
- 状态变为 `IMAGE_SELECTED`
- downstream video scripts / video batches 被标记为 `STALE`
- 返回 `nextAction = GENERATE_VIDEO_SCRIPT`

### generateVideoScript()

断言：

- 读取当前选中图
- 尝试读取相邻选中图
- 把 `durationSec` 传给 agent
- 保存 `VideoScriptArtifact`
- `basedOnImageId`、`basedOnPrevImageId`、`basedOnNextImageId` 正确

### userEdit()

断言：

- 不覆盖 agent 生成的旧剧本
- 创建 user edited 新版本
- 保留 basedOn image ids
- 状态变为 `VIDEO_SCRIPT_EDITED`

### generate5Videos()

断言：

- 使用显式 `scriptId`
- 创建 video batch
- 并发触发 5 个视频生成任务
- 使用 `Promise.allSettled` 处理部分失败
- 不因一个 candidate 失败导致整个 batch 丢失

---

## 6.4 Provider Config 单元测试

目标：保证 endpoint / apiKey / model 配置可注入、可覆盖、缺失时报错。

覆盖点：

| 场景 | 期望 |
|---|---|
| 有直接 API key | 正常启动 |
| 有 apiKeyEndpoint | 通过 secret resolver 获取 key |
| key 缺失且 real mode | 抛错 |
| mock mode | 允许 key 为空 |
| endpoint 非 URL | 抛错 |
| 日志打印 config | key 被 mask |

示例：

```ts
it("requires provider api key in real provider mode", () => {
  expect(() =>
    parseProviderConfig({
      RUN_REAL_PROVIDER_TESTS: "true",
      IMAGE_PROVIDER_BASE_URL: "https://provider.example/v1",
      IMAGE_PROVIDER_API_KEY: "",
    }),
  ).toThrow(/IMAGE_PROVIDER_API_KEY/);
});
```

---

## 6.5 Final Prompt Contract 单元测试

目标：保证最终成片 prompt 只来自 approved / selected artifact。

断言：

1. final prompt 包含所有 selected shot 的 `providerPrompt`
2. final prompt 不读取 stale script
3. final prompt 不调用 text provider 改写
4. 如果任一 shot 缺少 selected video 或 approved script，应拒绝 final export

示例：

```ts
it("builds final prompt from selected video script provider prompts only", () => {
  const result = compileFinalVideoPrompt({
    shots: [
      { id: "s1", providerPrompt: "prompt one", status: "APPROVED" },
      { id: "s2", providerPrompt: "prompt two", status: "APPROVED" },
    ],
  });

  expect(result).toContain("prompt one");
  expect(result).toContain("prompt two");
});
```

---

## 6.6 Job Worker 单元测试

目标：验证异步任务的正确行为。

覆盖点：

- 创建 job 时携带 `scriptId`、`batchId`、`idempotencyKey`
- worker 不读取 latest script，而读取 payload 里的 scriptId
- provider timeout 后写入 FAILED
- 一部分 candidate 成功时 batch 为 PARTIAL 或 SUCCEEDED_WITH_PARTIAL_FAILURE
- retry 不重复创建已成功 candidate
- worker 重入时通过 idempotency key 跳过重复执行

---

## 7. 集成测试设计：真实 API 调用

## 7.1 集成测试运行前置条件

集成测试运行前，需要启动完整后端依赖：

```txt
Postgres
Object Storage
Redis / Queue
API Server
Worker Process
External Provider Endpoint
```

本地可用：

```bash
pnpm docker:up:test
pnpm db:migrate:test
pnpm server:start:test
pnpm worker:start:test
pnpm test:integration
```

Staging / CI 可用：

```bash
TEST_API_BASE_URL=https://staging-api.example.com \
RUN_REAL_PROVIDER_TESTS=true \
pnpm test:integration
```

---

## 7.2 API Client Helper

```ts
// apps/server/test/helpers/api-client.ts
import { loadIntegrationEnv } from "./provider-env";

const env = loadIntegrationEnv();

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${env.TEST_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(env.TEST_API_KEY ? { Authorization: `Bearer ${env.TEST_API_KEY}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      `API ${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`,
    );
  }

  return body as T;
}
```

---

## 7.3 Poll Helper

```ts
// apps/server/test/helpers/poll.ts
export async function pollUntil<T>(input: {
  label: string;
  intervalMs: number;
  timeoutMs: number;
  fetcher: () => Promise<T>;
  isDone: (value: T) => boolean;
}): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    const value = await input.fetcher();
    if (input.isDone(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, input.intervalMs));
  }

  throw new Error(`Timeout while polling ${input.label}`);
}
```

---

## 7.4 集成测试场景一：Workspace 与素材上传 @smoke

目标：验证基础工作区和上传链路。

步骤：

1. `POST /api/workspaces`
2. `GET /api/workspaces/:workspaceId/status`
3. `POST /api/workspaces/:workspaceId/materials` multipart 上传商品主图
4. `GET /api/workspaces/:workspaceId/materials`
5. 断言素材状态为 `READY`

断言：

- workspace id 存在
- status response 包含 `nextAction`
- material id 存在
- material url 可访问或可签名访问
- 失败时错误结构稳定

---

## 7.5 集成测试场景二：分镜图 prompt → 3 图候选 @provider

目标：验证图 prompt agent 与图像 provider 的真实 HTTP 链路。

步骤：

1. 创建 workspace
2. 上传商品主图与参考图
3. 创建 / 获取 shot
4. `POST /workspaces/:workspaceId/shots/:shotId/image-prompt`
5. `POST /shots/:shotId/image-batches`
6. 轮询 `GET /shots/:shotId/image-batches/:batchId`
7. 断言返回 3 个 image candidates

断言：

- `imagePromptArtifact.prompt` 非空
- `referenceImageIds` 正确保存
- batch status 最终为 `SUCCEEDED` 或 `PARTIAL`
- candidates 数量为 3
- 每个 candidate 有 `imageUrl`
- shot status 为 `IMAGE_CANDIDATES_READY`
- nextAction 为 `SELECT_IMAGE`

示例：

```ts
import { describe, expect, it } from "vitest";
import { apiFetch } from "../helpers/api-client";
import { pollUntil } from "../helpers/poll";
import { loadIntegrationEnv } from "../helpers/provider-env";

const env = loadIntegrationEnv();
const runProviderTests = env.RUN_REAL_PROVIDER_TESTS === "true";

describe.skipIf(!runProviderTests)("storyboard image flow @provider", () => {
  it("generates image prompt and 3 real image candidates", async () => {
    const workspace = await apiFetch<{ id: string }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: `it-image-${Date.now()}` }),
    });

    const shot = await apiFetch<{ id: string }>(
      `/api/workspaces/${workspace.id}/shots`,
      {
        method: "POST",
        body: JSON.stringify({
          title: "产品展示首镜",
          objective: "展示商品外观和使用场景",
          order: 1,
        }),
      },
    );

    const promptResult = await apiFetch<{ artifact: { id: string; prompt: string } }>(
      `/api/workspaces/${workspace.id}/shots/${shot.id}/image-prompt`,
      {
        method: "POST",
        body: JSON.stringify({ referenceImageIds: [] }),
      },
    );

    expect(promptResult.artifact.prompt.length).toBeGreaterThan(20);

    const batch = await apiFetch<{ batchId: string }>(
      `/api/shots/${shot.id}/image-batches`,
      { method: "POST", body: JSON.stringify({}) },
    );

    const finalBatch = await pollUntil({
      label: "image batch",
      intervalMs: 3000,
      timeoutMs: 180000,
      fetcher: () =>
        apiFetch<{
          status: string;
          candidates: Array<{ id: string; imageUrl: string }>;
        }>(`/api/shots/${shot.id}/image-batches/${batch.batchId}`),
      isDone: (value) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(value.status),
    });

    expect(finalBatch.status).not.toBe("FAILED");
    expect(finalBatch.candidates).toHaveLength(3);
    for (const candidate of finalBatch.candidates) {
      expect(candidate.imageUrl).toMatch(/^https?:\/\//);
    }
  });
});
```

---

## 7.6 集成测试场景三：选图 → 视频剧本 → 用户编辑 @smoke

目标：验证用户选择断点和视频剧本 artifact 版本。

步骤：

1. 准备已有 3 张图片候选的 shot
2. `POST /shots/:shotId/selected-image`
3. `POST /workspaces/:workspaceId/shots/:shotId/video-script`
4. `PATCH /shots/:shotId/video-script/:scriptId`
5. `GET /shots/:shotId/artifacts/video-scripts`

断言：

- selected image 正确保存
- nextAction 为 `GENERATE_VIDEO_SCRIPT`
- video script 中 `durationSec` 与请求一致或在合法范围
- `providerPrompt` 非空
- 用户编辑后产生新版本
- 新版本 `createdBy = user`
- 旧版本未被覆盖

---

## 7.7 集成测试场景四：并行生成 5 个视频 @expensive

目标：验证真实视频 provider 长任务链路。此测试成本高，建议默认跳过，只在 nightly 或手动触发。

步骤：

1. 准备 selected image 与 approved / latest video script
2. `POST /shots/:shotId/video-batches`
3. 轮询 `GET /shots/:shotId/video-batches/:batchId`
4. 等待最终状态
5. `POST /shots/:shotId/selected-video`

断言：

- video batch 被创建
- worker 正常消费任务
- 最终候选数量为 5
- 至少 1 个 candidate 成功
- 成功 candidate 有 `videoUrl`
- 失败 candidate 有 `errorMessage`
- batch 可返回 `SUCCEEDED` / `PARTIAL` / `FAILED`
- nextAction 为 `SELECT_VIDEO` 或 `RETRY_GENERATE_5_VIDEOS`

注意：

- 如果 provider 成本高，可以把完整 5 个候选测试放在 nightly。
- PR / 本地默认只跑轻量 smoke。
- 不建议为了省成本把 production endpoint 的 5 改成 1；如需测试 1 个候选，应设计单独的 internal test endpoint 或 provider probe endpoint，不要污染生产行为。

---

## 7.8 集成测试场景五：Final Export Contract

目标：验证最终导出阶段不漂移 prompt。

步骤：

1. 准备多个 shot，每个 shot 有 selected video script / providerPrompt
2. 调用 `POST /workspaces/:workspaceId/final-video-jobs`
3. 查询 `GET /jobs/:jobId`
4. 查询 `GET /workspaces/:workspaceId/final-prompt-preview` 或 job detail 中的 prompt hash / prompt preview

断言：

- final prompt 包含每个 shot 的 `providerPrompt`
- final prompt 的来源 artifact id 与 selected / approved script id 一致
- export job payload 中不出现 stale artifact
- export 阶段 trace 中不出现 text provider 调用

如果生产环境不允许直接返回完整 prompt，可返回：

```json
{
  "compiledPromptHash": "sha256:...",
  "sourceArtifactIds": ["script-1", "script-2"],
  "sourceProviderPromptHashes": ["sha256:...", "sha256:..."]
}
```

---

## 7.9 集成测试场景六：Provider Boundary / Trace

目标：验证 provider 调用边界。

步骤：

1. 运行 final export API
2. 查询 trace API：`GET /api/traces?workspaceId=...&jobId=...`
3. 过滤 provider call events

断言：

- storyboard image prompt 阶段允许 text provider
- video script 阶段允许 text provider
- image generation 阶段只出现 image provider
- video generation 阶段只出现 video provider
- final export 阶段不得出现 text provider prompt rewrite

建议 trace event schema：

```ts
interface TraceEvent {
  id: string;
  workspaceId: string;
  shotId?: string;
  jobId?: string;
  stage:
    | "IMAGE_PROMPT_AGENT"
    | "IMAGE_GENERATION"
    | "VIDEO_SCRIPT_AGENT"
    | "VIDEO_GENERATION"
    | "FINAL_EXPORT";
  providerType: "text" | "image" | "video" | "storage" | "queue";
  providerName: string;
  artifactId?: string;
  requestHash?: string;
  responseHash?: string;
  createdAt: string;
}
```

---

## 8. 集成测试的测试数据与清理

### 8.1 测试数据命名

所有集成测试资源必须带 run id，避免污染环境。

```ts
const runId = process.env.TEST_RUN_ID ?? `local-${Date.now()}`;
const workspaceName = `it-${runId}-storyboard-video`;
```

### 8.2 Fixtures

建议准备小文件：

```txt
apps/server/test/fixtures/
  product-main.jpg       100-300KB
  reference-style.jpg    100-300KB
  product-demo.mp4       小于 5MB
```

### 8.3 清理策略

优先级：

1. API 清理：`DELETE /api/test-runs/:runId`
2. TTL 清理：定时删除 `it-*` workspace
3. 手动清理脚本：`pnpm test:cleanup --runId xxx`

注意：生产环境不应暴露 test cleanup API。只允许在 `NODE_ENV=test` 或 staging 白名单环境启用。

---

## 9. AI / Provider 集成测试断言原则

真实 AI 输出不稳定，所以不要断言完全相等文本。

推荐断言：

- JSON schema 合法
- 字段存在
- 字符串长度范围合理
- `durationSec` 在请求或业务范围内
- 图片/视频 URL 存在
- candidate 数量正确
- 状态机正确
- artifact 版本正确
- trace 阶段正确
- provider boundary 正确

不推荐断言：

- AI 输出文本逐字等于 snapshot
- 文案包含某个非常具体的形容词
- 图像内容肉眼语义完全正确
- 视频内容逐帧一致

对 AI 质量可以单独做人工评测或离线 eval，不应混入后端集成测试的主断言。

---

## 10. 幂等与并发测试

### 10.1 幂等测试

每个生成 endpoint 建议支持 `Idempotency-Key` header。

测试：

```txt
POST /shots/:shotId/video-batches
Idempotency-Key: it-run-xxx-shot-1-video-batch
```

断言：

- 同一个 idempotency key 重复请求返回同一个 batchId
- 不重复创建 5 个新任务
- worker 重试不重复生成已完成 candidate

---

### 10.2 并发测试

场景：用户在 A 分镜视频生成时继续操作 B 分镜。

步骤：

1. shot A 调用 `POST /video-batches`
2. 不等待 A 完成
3. shot B 调用 `POST /image-prompt`
4. shot B 调用 `POST /image-batches`
5. 查询 A 的 video batch 仍在运行或已完成
6. 查询 B 的状态独立推进

断言：

- A/B shot 的 status 互不覆盖
- A/B batch 独立
- workspace status 能聚合多个 active jobs
- 前端可从 status API 恢复当前任务列表

---

## 11. 错误与重试测试

单元测试中通过 fake provider 模拟错误；集成测试中不建议故意让真实 provider 失败，但可以通过非法输入验证 4xx。

### 11.1 单元测试错误分支

覆盖：

- provider timeout
- provider 500
- provider 返回空 URL
- agent 输出 schema invalid
- 用户选了不存在的 image candidate
- 用户编辑 stale script
- 缺少 selected image 时生成视频剧本
- 缺少 scriptId 时生成视频 batch

### 11.2 集成测试错误分支

覆盖：

- 上传非法文件类型返回 400
- 不存在 workspace 返回 404
- 未选图时生成视频剧本返回 409
- stale script 生成视频返回 409
- 无权限访问 workspace 返回 403
- 未配置 provider 且 real mode 返回明确错误

---

## 12. CI 策略

### 12.1 PR 阶段

每个 PR 必跑：

```txt
lint
prettier check
typecheck
unit tests
build
```

不建议 PR 默认跑真实 provider 集成测试，因为：

- 成本高
- 时间长
- 外部服务不稳定会造成 flaky
- 需要 secret

---

### 12.2 Merge / Staging 阶段

合入 main 后跑：

```txt
integration smoke
workspace API
material upload API
artifact API
job polling API
```

如果 staging 配有 provider key，可以跑轻量 provider smoke。

---

### 12.3 Nightly 阶段

每天或每周跑：

```txt
real image provider test
real video provider test
full 5 video candidates test
final export contract test
trace boundary test
cleanup stale test resources
```

---

## 13. GitHub Actions 示例

```yaml
name: backend-tests

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      run_real_provider_tests:
        description: "Run real provider integration tests"
        required: false
        default: "false"

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:unit

  integration:
    if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    env:
      TEST_API_BASE_URL: ${{ secrets.STAGING_API_BASE_URL }}
      TEST_API_KEY: ${{ secrets.STAGING_API_KEY }}
      RUN_REAL_PROVIDER_TESTS: ${{ github.event.inputs.run_real_provider_tests || 'false' }}
      AI_TEXT_BASE_URL: ${{ secrets.AI_TEXT_BASE_URL }}
      AI_TEXT_API_KEY: ${{ secrets.AI_TEXT_API_KEY }}
      IMAGE_PROVIDER_BASE_URL: ${{ secrets.IMAGE_PROVIDER_BASE_URL }}
      IMAGE_PROVIDER_API_KEY: ${{ secrets.IMAGE_PROVIDER_API_KEY }}
      VIDEO_PROVIDER_BASE_URL: ${{ secrets.VIDEO_PROVIDER_BASE_URL }}
      VIDEO_PROVIDER_API_KEY: ${{ secrets.VIDEO_PROVIDER_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration:smoke
```

---

## 14. 推荐测试清单

### 14.1 Unit Test Checklist

- [ ] 状态机与 `nextAction`
- [ ] artifact versioning
- [ ] stale / invalidate 规则
- [ ] prompt builder
- [ ] Zod schema
- [ ] workflow service 六步串联
- [ ] image provider request builder
- [ ] video provider request builder
- [ ] job worker retry / timeout / partial success
- [ ] final prompt compiler
- [ ] provider config parser
- [ ] secret masking
- [ ] idempotency key

### 14.2 Integration Test Checklist

- [ ] Workspace create / status / restore
- [ ] Material upload multipart
- [ ] Image prompt API
- [ ] Image batch API + polling
- [ ] User select image API
- [ ] Video script API
- [ ] User edit video script API
- [ ] Video batch API + polling
- [ ] User select video API
- [ ] Final export API
- [ ] Job detail / polling API
- [ ] Trace API
- [ ] Provider boundary
- [ ] Error response contract
- [ ] Refresh recovery
- [ ] Cleanup / TTL

---

## 15. 建议的落地顺序

第一阶段：单元测试先补齐核心不变量。

```txt
1. shot.state.unit.test.ts
2. artifact.versioning.unit.test.ts
3. final-prompt-compiler.unit.test.ts
4. shot.workflow.unit.test.ts
5. provider-config.unit.test.ts
```

第二阶段：集成测试先跑 API smoke，不接真实高成本 provider。

```txt
1. workspace.integration.test.ts
2. material-upload.integration.test.ts
3. video-script.integration.test.ts
4. job-polling.integration.test.ts
```

第三阶段：接入真实 provider 冒烟测试。

```txt
1. image-provider.integration.test.ts
2. video-provider.integration.test.ts，默认跳过
3. final-export-contract.integration.test.ts
4. trace-boundary.integration.test.ts
```

第四阶段：CI 分层。

```txt
PR: lint + typecheck + unit
main: integration smoke
manual/nightly: real provider + expensive full generation
```

---

## 16. 最小可执行测试集 MVP

如果只想先快速落地，建议优先实现下面 8 个测试。

### Unit

1. `shot.state.unit.test.ts`：验证状态机与 nextAction
2. `artifact.versioning.unit.test.ts`：验证用户编辑创建新版本
3. `shot.workflow.unit.test.ts`：验证六步串联与 provider 调用参数
4. `final-prompt-compiler.unit.test.ts`：验证最终 prompt 只来自 approved / selected scripts
5. `provider-config.unit.test.ts`：验证 endpoint / apiKey 可配置

### Integration

6. `workspace.integration.test.ts`：真实 API 创建 workspace 并恢复状态
7. `storyboard-image.integration.test.ts`：真实 API 生成 image prompt 与 3 图候选，可按 provider 开关跳过真实图生成
8. `video-generation.integration.test.ts`：真实 API 提交 5 视频任务并轮询，默认只在 nightly / manual 跑

---

## 17. 关键结论

1. **单元测试要测规则和编排，不调用真实 provider。**
2. **集成测试只通过真实 HTTP API 调用后端，不 import app，不 supertest in-memory app。**
3. **provider endpoint / apiKey / model / timeout 必须全部可配置。**
4. **真实视频生成测试必须分级：smoke 默认跑，expensive 手动或 nightly 跑。**
5. **AI 输出不要做逐字断言，只断言 schema、状态、版本、数量、URL、trace 与 provider boundary。**
6. **最终 prompt contract 和 provider boundary 是最高优先级测试，必须避免 prompt 漂移。**
7. **集成测试必须支持 cleanup / TTL，避免真实环境被测试数据污染。**
