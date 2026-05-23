# 电商场景 AIGC 带货视频生成系统 — 当前实现架构 (Codex r4)

> 核心结论：
>
> ```text
> V0 采用轻量 monorepo：apps/web + apps/server + packages/shared + packages/ai + packages/config。
> Postgres 是唯一业务事实源；不再保留 Memory DB fallback。
> P0/P1 不做分镜级渲染，不做 FFmpeg 拼接。
> StoryboardShot 是剧本结构单元，不是视频渲染切片。
> Ark-backed Seedance 通过单次图生视频调用生成 <=12s 成片。
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
               │ workflows/schemas    │   │ Shot/GenerationJob    │
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
│           │   ├── logger.ts
│           │   └── trace.ts
│           ├── db/
│           │   ├── client.ts
│           │   └── schema/
│           ├── jobs/
│           │   ├── job-state.ts
│           │   ├── queue.ts
│           │   └── processors/
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
│   │       ├── prompts/
│   │       ├── smoke/
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
2. User fills structured creative parameters:
   title / sellingPoints / audience / stylePreference.
3. Web calls POST /api/creative-blueprints.
4. Server calls packages/ai to generate a CreativeBlueprint.
5. Output is validated with Zod; one repair retry is allowed; fallback is explicit.
6. Server persists Product / Asset / Script / StoryboardShot in Postgres.
7. Web displays read-only Script and 2-4 StoryboardShot items.
8. User clicks "一键成片".
9. Web calls POST /api/creation/jobs with scriptId.
10. Server freezes the Script and creates a GenerationJob.
11. Media processor builds one Seedance whole-video prompt.
12. Seedance returns one <=12s final video URL.
13. Server persists final_video Asset and completed GenerationJob state.
14. Web polls GET /api/jobs/:jobId and displays preview/export.
```

Key definition:

```text
StoryboardShot = script/storyboard structure
StoryboardShot != independently rendered video clip
```

The video prompt explicitly tells Seedance that storyboard shots are inspiration only and should not be rendered as separate stitched clips.

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

The current V0 creation path creates video jobs from an existing `scriptId`, so the active async stage is `media_generating`. The legacy script-generation processor remains in the codebase for compatibility, but the V0 UI path uses creative blueprint generation synchronously before job creation.

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
- OpenAI-compatible fallback LLM usage only for Ark text auth/config failure.
- Creative blueprint prompt and repair prompt.
- Zod validation of generated creative blueprint output.
- Ark-backed Seedance image-to-video provider.
- Conservative 12-second whole-video prompt construction.
- Real-provider smoke check.

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

The smoke command is a dependency-interface health check. It sends minimal chat-completion probes to Ark text and the OpenAI-compatible fallback provider. It does not create or read a product image, and it does not call Seedance video.

Full creative-blueprint validation uses the app/API flow with a supported product image. When Ark text config is present, server-side creative blueprint generation sends Doubao-Seed-2.0-pro a multimodal Chat request with text plus `image_url`. App-created local raster uploads are converted to `data:image/<format>;base64,...` before the Ark Chat request, and blueprint trace metadata records `imageReferenceMode`.

Full Seedance validation is separate and requires `ARK_VIDEO_ENDPOINT_ID` plus either a locally uploaded supported raster product image or a public product image URL. Server-side media generation converts app-created local uploads to `data:image/<format>;base64,...` before calling Seedance. Repository-local mock images and fabricated image fixtures are not valid real-provider video inputs.

Optional fallback LLM variables are:

```text
OPENAI_BASE_URL
```

It is used only to route the fallback text probe and creative-blueprint fallback. The fallback provider is not used for video generation.

---

## 8. Frontend State And Review Recovery

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

## 9. Storage And Infrastructure

P0 upload storage:

- uploaded product images are stored under the server upload directory;
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

## 10. Testing And Validation

The current architecture is protected by these test surfaces:

- config test: missing `DATABASE_URL` fails loudly;
- config test: root `.env` loading provides `DATABASE_URL`;
- persistence test: `scriptId` can be read after server process restart;
- creation API tests: job creation, hydration, running state, completion;
- lifecycle tests: frozen blueprint versioning and multiple generation attempts;
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

## 11. Remaining Non-V0 Work

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
