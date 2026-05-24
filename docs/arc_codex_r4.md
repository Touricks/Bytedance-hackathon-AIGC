# 电商场景 AIGC 带货视频生成系统 — 当前实现架构 (Codex r4)

> 核心结论：
>
> ```text
> V0 采用轻量 monorepo：apps/web + apps/server + packages/shared + packages/ai + packages/config。
> Postgres 是唯一业务事实源；不再保留 Memory DB fallback。
> P0/P1 不做分镜级渲染，不做 FFmpeg 拼接。
> StoryboardShot 是剧本结构单元，不是视频渲染切片。
> Ark-backed Seedance 通过单次图生视频调用生成 <=12s 成片。
> Ark text provider 同时承担图生文/创作蓝图生成，必须把商品图作为 image_url 输入。
> 生成链路按 scriptId 记录 JSONL trace；trace 可定位蓝图、图生视频、provider probe 的真实输入输出边界。
> apps/server 物理上仍是模块化单体，HTTP API 与 processors 同进程；需要时可启用 Redis/BullMQ。
> ```

---

## 1. r4 文档定位

本文是当前实现架构记录，取代已归档的 Codex r3 架构草案和 `proposed_architecture.md` 计划文档。

r3 主要回答“应该怎么建”；r4 记录“当前代码已经如何落地”。本轮关键修正是：

- 删除隐式 Memory DB fallback。
- 服务端启动必须具备 `DATABASE_URL`。
- 服务端和 AI smoke 路径会加载仓库根目录 `.env`，且不覆盖 shell 中已显式导出的变量。
- Product / Asset / Script / StoryboardShot / GenerationJob 通过 Postgres 持久化。
- 任务状态机修正为 `queued -> running -> completed/failed`。
- 真实 provider 验收通过 `MODEL_MODE=real` 与 `smoke:real-providers` 显式执行。
- 前端通过 URL query 中的 `scriptId` / `jobId` 支持刷新恢复 review 状态。
- Ark 文本 provider 的创作蓝图生成已从纯文本修正为多模态请求：商品图以 `image_url` 进入 Doubao-Seed-2.0-pro。
- Ark-backed Seedance 图生视频 provider 已修正为 Ark video task contract：`ARK_API_KEY + ARK_VIDEO_ENDPOINT_ID`，文本 prompt + 商品图 `image_url`，轮询任务产出视频 URL。
- 本地上传商品图在进入真实 provider 前会被校验为真实 raster bytes；上传图会按 provider 需要转换为 `data:image/<format>;base64,...`。
- Trace 系统已从 job 内部状态扩展为 script-scoped 文件日志：`{TRACE_LOG_DIR}/users/<scriptId>/events.jsonl`。

---

## 2. 总体拓扑

```text
                 ┌───────────────────────────────────────────┐
                 │ apps/web                                  │
                 │ React + TypeScript 商家工作台              │
                 │ 素材/参数 -> 创作蓝图 -> 一键成片 -> 预览导出 │
                 └─────────────────────┬─────────────────────┘
                                       │ REST + job polling
                 ┌─────────────────────▼─────────────────────┐
                 │ apps/server                               │
                 │ Fastify + TypeScript 模块化单体             │
                 │                                           │
                 │ API modules                               │
                 │ material / creative-blueprint / creation  │
                 │ script                                    │
                 │                                           │
                 │ Embedded processors                       │
                 │ media-generate                            │
                 └─────────────┬─────────────────┬───────────┘
                               │                 │
               ┌───────────────▼─────┐   ┌───────▼──────────────┐
               │ packages/ai          │   │ Postgres              │
               │ providers/prompts/   │   │ Product/Asset/Script/ │
               │ workflows/probes/trace │  │ Shot/GenerationJob    │
               └───────────────┬─────┘   └──────────────────────┘
                               │
               ┌───────────────▼─────────────────────┐
               │ Ark text provider                    │
               │ Ark-backed Seedance video provider   │
               │ OpenAI-compatible fallback LLM       │
               │ mock providers only in explicit local │
               │ or demo fallback modes               │
               └──────────────────────────────────────┘
```

`Redis/BullMQ` remains an optional async transport controlled by `USE_REDIS_QUEUE=true`. Without it, the server still runs the processor in-process, but job facts and progress are persisted in Postgres.

---

## 3. Current Directory Shape

```text
Bytedancehack/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   │   └── mocks/
│   │   └── src/
│   │       ├── features/
│   │       │   ├── material/
│   │       │   ├── script/
│   │       │   └── creation/
│   │       ├── lib/
│   │       │   ├── api/
│   │       │   ├── job/
│   │       │   ├── store/
│   │       │   └── reviewState.ts
│   │       └── routes/
│   │
│   └── server/
│       └── src/
│           ├── common/
│           │   ├── config.ts
│           │   ├── errors.ts
│           │   ├── image-validation.ts
│           │   ├── logger.ts
│           │   └── trace.ts
│           ├── db/
│           │   ├── client.ts
│           │   └── schema/
│           ├── jobs/
│           │   ├── job-state.ts
│           │   ├── queue.ts
│           │   ├── processors/
│           │   └── seedance-image-input.ts
│           └── modules/
│               ├── material/
│               ├── creative-blueprint/
│               ├── creation/
│               └── script/
│
├── packages/
│   ├── shared/
│   ├── ai/
│   │   └── src/
│   │       ├── env.ts
│   │       ├── providers/
│   │       ├── probes/
│   │       ├── prompts/
│   │       ├── smoke/
│   │       ├── trace/
│   │       └── workflows/
│   └── config/
│
├── infra/
│   └── docker-compose.yml
├── docs/
└── mocks/
```

Still intentionally absent:

- `apps/worker`
- `packages/video`
- `packages/ui`
- FFmpeg composition service
- LangGraph runtime

These remain P2-level extraction points, not V0 architecture.

---

## 4. Domain Flow

V0 user-visible flow:

```text
1. User uploads or selects a product image.
   Uploaded product-image bytes are validated before an Asset is created.
2. User fills structured creative parameters:
   title / sellingPoints / audience / stylePreference.
3. Web calls POST /api/creative-blueprints.
4. Server creates or reuses a scriptId-scoped trace log.
5. Server resolves the product image into a provider-safe image reference.
6. Server calls packages/ai to generate a CreativeBlueprint.
   With Ark text config, the request is text + image_url, not text only.
7. Output is validated with Zod; one repair retry is allowed; fallback is explicit.
8. Server persists Product in Postgres.
9. Web displays read-only Script and 2-4 StoryboardShot items.
10. User clicks "一键成片".
11. Web calls POST /api/creation/jobs with scriptId.
12. Server freezes the Script and creates a GenerationJob.
13. Media processor resolves the same product image for Seedance.
14. Media processor builds one Seedance whole-video prompt.
15. Seedance receives text prompt + image_url and returns one <=12s final video URL.
16. Server persists final_video Asset and completed GenerationJob state.
17. Web polls GET /api/jobs/:jobId and displays preview/export.
```

Key definition:

```text
StoryboardShot = script/storyboard structure
StoryboardShot != independently rendered video clip
```

The video prompt explicitly tells Seedance that storyboard shots are inspiration only and should not be rendered as separate stitched clips.

Provider image handoff contract:

```text
app-created local upload -> validate bytes -> store under /uploads/product-images -> data:image/... for real providers
public http(s) URL         -> pass through when provider can fetch it
asset:// provider asset    -> pass through for provider-native references
/mocks/* or fake fixtures  -> local/demo only, not valid real-provider inputs
```

---

## 5. Data Source And Persistence

Postgres is the only V0 business fact source.

The persisted facts are:

```text
Product
Asset
Script
StoryboardShot
GenerationJob
```

Runtime behavior:

- `DATABASE_URL` is required.
- `apps/server/src/common/config.ts` loads the nearest `.env` found by walking up from `process.cwd()`.
- Existing shell variables win over `.env` values.
- Relative `UPLOAD_DIR` values are resolved from the workspace `.env` root, not from the server process cwd.
- If `DATABASE_URL` is missing, config throws during startup.
- There is no Memory DB fallback.
- Server startup initializes the Postgres schema using the SQL in `apps/server/src/db/schema/`.

The important consequence is that stable review identifiers are real:

- `scriptId` survives server restart.
- `jobId` survives server restart.
- frozen blueprint state survives server restart.
- final video asset references survive server restart.

---

## 6. Job State Machine

The V0 job state contract is:

```text
queued
  -> running / media_generating
  -> completed / completed

any stage
  -> failed / failed
```

In type terms:

```text
status: queued | running | completed | failed
stage: queued | script_generating | media_generating | completed | failed
```

The current V0 creation path creates video jobs from an existing `scriptId`, so the active async stage is `media_generating`. Legacy deterministic script generation is no longer exposed as an active provider boundary; the remaining fixture lives under `packages/ai/src/legacy/` for compatibility-only code paths.

Job transitions are centralized in `apps/server/src/jobs/job-state.ts`:

- `markJobMediaGenerating`
- `markJobCompleted`
- `markJobFailed`

This keeps API polling, in-process generation, and Redis/BullMQ generation aligned.

---

## 7. AI Provider Boundaries

`packages/ai` is server-only.

It owns:

- Ark text provider usage for Doubao-Seed-2.0-pro multimodal creative blueprint generation.
- To-text/image-to-text provider probes for validating a local image can be read by Ark text.
- OpenAI-compatible fallback LLM usage only for Ark text auth/config failure.
- Creative blueprint prompt and repair prompt.
- Zod validation of generated creative blueprint output.
- Ark-backed Seedance image-to-video provider.
- Image-to-video provider probes for validating Seedance with a local product image.
- Conservative 12-second whole-video prompt construction.
- Real-provider smoke check.

The active V0 provider modules are:

```text
packages/ai/src/providers/ark-text.provider.ts
packages/ai/src/providers/seedance-video.provider.ts
```

Workflows, probes, smoke checks, and server code must consume provider interfaces instead of directly constructing model SDK clients or hand-writing external model transport payloads. A repo-level guard test enforces this rule and allows direct SDK/transport construction only inside approved provider modules. Legacy deterministic script fixtures and P1-only TTS placeholders are not active providers.

Provider modes:

```text
MODEL_MODE=mock   local fallback allowed
MODEL_MODE=real   missing real credentials fail loudly
```

Real-provider acceptance command:

```bash
pnpm --filter @aigc-video/ai smoke:real-providers
```

The smoke command requires:

```text
ARK_API_KEY
ARK_TEXT_ENDPOINT_ID
OPENAI_API_KEY
OPENAI_MODEL
```

The smoke command is a dependency-interface health check. It sends minimal chat-completion probes through the shared Ark text provider boundary for Ark text and the OpenAI-compatible fallback provider. It does not create or read a product image, and it does not call Seedance video.

Full creative-blueprint validation uses the app/API flow with a supported product image. When Ark text config is present, server-side creative blueprint generation sends Doubao-Seed-2.0-pro a multimodal Chat request with text plus `image_url`. App-created local raster uploads are converted to `data:image/<format>;base64,...` before the Ark Chat request, and blueprint trace metadata records `imageReferenceMode`.

Full Seedance validation is separate and requires `ARK_VIDEO_ENDPOINT_ID` plus either a locally uploaded supported raster product image or a public product image URL. Server-side media generation converts app-created local uploads to `data:image/<format>;base64,...` before calling Seedance. Repository-local mock images and fabricated image fixtures are not valid real-provider video inputs.

Manual image-model probes:

```bash
pnpm --filter @aigc-video/ai probe:to-text -- --image assets_test/display_1.png --prompt "Describe the product image."
pnpm --filter @aigc-video/ai probe:image-to-video -- --image assets_test/display_1.png --prompt "Animate this product as a short ecommerce hero shot."
```

Probe images should live in ignored local storage such as `assets_test/`. The probe trace records image byte size and SHA-256, but redacts raw base64 image data.

Optional fallback LLM variables are:

```text
OPENAI_BASE_URL
```

It is used only to route the fallback text probe and creative-blueprint fallback. The fallback provider is not used for video generation.

---

## 8. Trace And Debuggability

Trace now has two layers:

```text
GenerationJob.trace              compact job progress for API polling
{TRACE_LOG_DIR}/users/<scriptId>/events.jsonl  user-session provider and pipeline event log
{TRACE_LOG_DIR}/tests/<traceId>/events.jsonl   automated-test and provider-probe trace log
```

`packages/ai/src/trace/trace-log.ts` owns file trace logging. The default root is `logs/trace`, or `TRACE_LOG_DIR` when set. Relative trace roots are resolved from the workspace `.env` root, not from the caller process cwd. `TRACE_LOG_SCOPE=users|tests` controls the scope subdirectory; production app/API flows default to `users`, while automated tests and provider probes use `tests`. Every event includes:

```text
at
scriptId
kind
pipeline
status
provider / model
latencyMs
jobId
meta
```

For provider probes, the same field currently carries the probe `traceId`; production creative-blueprint and video events use the real `scriptId`.

Current trace pipelines:

```text
creative_blueprint
one_click_video
probe_to_text
probe_image_to_video
```

Important trace events:

```text
session.started
blueprint.request_prepared
provider.request_started
provider.response_received
blueprint.parsed / blueprint.repaired / blueprint.fallback_used
video.image_prepared
video.task_create_started
video.task_created
video.task_polled
video.completed
*.failed
```

Trace redaction is part of the architecture contract:

- API keys, tokens, secrets, bearer tokens, and raw `data:image/...;base64,...` values are redacted before writing JSONL.
- Image trace metadata keeps `referenceMode`, `mimeType`, `byteSize`, and `sha256` so we can prove which image bytes were sent without storing the raw image payload in trace.
- Creative-blueprint errors include `scriptId` in the HTTP error body, so a failed request can be mapped back to `{TRACE_LOG_DIR}/users/<scriptId>/events.jsonl`.
- Video job trace shares the same `scriptId` directory and adds `jobId` to media-generation events.
- To inspect a local browser/API run, open `{TRACE_LOG_DIR}/users/<scriptId>/events.jsonl`.
- To inspect automated tests or provider probes, open `{TRACE_LOG_DIR}/tests/<traceId>/events.jsonl`.

This is intentionally file-based for V0. A database-backed observability store remains a P1/P2 concern.

---

## 9. Frontend State And Review Recovery

The web app remains a single-screen V0 workstation rather than a marketing landing page.

Current frontend responsibilities:

- material form with product image upload;
- creative blueprint generation request;
- read-only script and storyboard preview;
- one-click video job creation;
- polling generation progress;
- final video preview/export.

Stable review state is encoded in URL query parameters:

```text
?scriptId=<script-id>&jobId=<job-id>
```

On reload:

- `scriptId` hydrates the creative blueprint via `GET /api/creative-blueprints/:scriptId`.
- `jobId` resumes polling via `GET /api/jobs/:jobId`.
- completed jobs can still display script, shots, and final asset as long as Postgres contains the facts.

---

## 10. Storage And Infrastructure

P0 upload storage:

- uploaded product images are stored under the server upload directory;
- `UPLOAD_DIR` defaults to `tmp/uploads` and may be overridden in `.env`;
- upload URLs are served from `/uploads/*`;
- local uploads remain gitignored.

P0 data infrastructure:

```text
Postgres  required business fact source
Redis     optional BullMQ queue transport
MinIO     available in docker-compose, not required by V0 runtime path
```

MinIO/S3 remains a future storage adapter upgrade. P0 intentionally keeps local upload storage to reduce demo complexity.

---

## 11. Testing And Validation

The current architecture is protected by these test surfaces:

- config test: missing `DATABASE_URL` fails loudly;
- config test: root `.env` loading provides `DATABASE_URL` and root-resolved `UPLOAD_DIR`;
- persistence test: `scriptId` can be read after server process restart;
- creation API tests: job creation, hydration, running state, completion;
- lifecycle tests: frozen blueprint versioning and multiple generation attempts;
- material API tests: fake uploaded image bytes are rejected before they become product assets;
- Seedance image-input tests: local uploads become data URLs and unsupported references fail before provider calls;
- provider-config tests: Ark text/video use `ARK_API_KEY` plus endpoint IDs, while OpenAI-compatible config is fallback text only;
- creative-blueprint API/workflow tests: Ark requests include image content and trace records `imageReferenceMode`;
- trace-log and provider-probe tests: JSONL events are script/probe scoped, root-resolved, and raw image data is redacted;
- AI tests: real mode fails loudly without credentials;
- web tests: review URL state helpers.

Validated commands:

```bash
pnpm --filter @aigc-video/web test
pnpm --filter @aigc-video/server test
pnpm --filter @aigc-video/ai test
pnpm typecheck
pnpm lint
pnpm build
pnpm exec turbo typecheck --force
pnpm exec turbo lint --force
pnpm exec turbo build --force
```

Real-provider smoke requires credentials and was intentionally left as an operator-run command, not a default CI/test command.

---

## 12. Remaining Non-V0 Work

Still out of V0 scope:

- Qdrant / bge-m3 retrieval sidecar;
- TTS, subtitles, BGM mixing;
- complex storyboard editing;
- A/B experiments and metrics dashboard;
- FFmpeg composition;
- independent worker deployment;
- production observability.

These are still valid P1/P2 directions, but they should not change the V0 claim:

```text
V0 = durable creative blueprint + one-click Ark-backed Seedance whole-video generation.
```
