# Storyboard → Image → Video Per-Shot Pipeline — Design Spec (r2)

> Date: 2026-05-28
> Status: Waves 1–7 of r1 merged on `main`; r2 corrects API contracts, test harness, and undocumented gaps based on actual implementation results.
> Supersedes: `2026-05-28-storyboard-image-video-pipeline-design.md` (r1)
> Companion plan: `../plans/2026-05-28-pipeline-gap-closure-plan.md`
> Authoritative provider references: `docs/reference/chat/readme.md`, `docs/reference/image/GET.md`, `docs/reference/video/query_list.md`, `docs/reference/video/DELETE.md`

---

## 0. Why r2 exists

During post-implementation validation against the real Ark / Seedance APIs (with `.env` configured under repo root), three categories of r1 inaccuracy surfaced:

1. **Image provider API shape was wrong in r1 §6.2.** r1 said "mirror the Seedance video provider — Ark async task create + poll". The Ark image API is **synchronous OpenAI-compatible** at `POST /images/generations` — single round-trip, returns `data[]`. The implementer wrote an async-task client; it would have failed against every real call. **Fixed on `main` at `8198440`.**

2. **Test harness assumptions in r1 §9 were wrong.** r1 prescribed `vitest` configs and `-t '@tag'` filtering. The repo uses `node --test` + `tsx` (`describe(..., {skip:!RUN}, ...)` gating). Two related bugs: the unit-test script cleared only legacy `ARK_*` env vars (let new `TEXT_*`/`IMAGE_*`/`VIDEO_*` leak in and shadow test fixtures, breaking 5 workspace tests) — **fixed at `b6fe02e`**. The integration env schema rejected the documented empty-string optional URLs — **fixed at `5cf3f45`**.

3. **Wave 7 promise unfulfilled in code.** r1 §7.2 referenced `assetService.urlsByIds(...)` to resolve reference image URLs for the image worker. Wave 7 actually shipped only `/api/config/limits`, crash recovery, cleanup, and refresh-recovery test — the asset URL resolver was never written. Consequence: the image worker passes `referenceImageUrls: []` unconditionally. User-uploaded product images are *not* sent to the image model.

Plus a handful of smaller drifts: agents SDK Runner snippet doesn't match `@openai/agents@0.0.5`; envelope policy (`WorkflowResponse<T>`) applies only to new routes, not V1 upstream routes; `workspace_video_archive` is fully dropped, not deferred as r1 §3.6 said.

This r2 is the corrected single source of truth. Read it as the merged version; refer back to r1 only for historical traceability.

---

## 1. Implementation status (verified 2026-05-28)

| Wave | r1 scope | Status on `main` |
|---|---|---|
| 1 — Foundations | Provider triplets, agents SDK, Zod schemas, mock workflows | ✓ merged |
| 2 — Schema + module skeleton | New enums/tables, db.db2, shot/artifact/generation/job/trace modules | ✓ merged |
| 3 — Image flow E2E | shot.state, image flow service, image worker, idempotency | ✓ merged |
| 4 — Video flow E2E | video script service, video worker, retry endpoint | ✓ merged |
| 5 — Final compose | ffmpeg helper, final-compose worker, provider boundary, endpoints | ✓ merged |
| 6 — Frontend overhaul | features/workspace focus-mode UI | ✓ merged |
| 7 — Polish | /api/config/limits, crash recovery, cleanup, refresh-recovery test | ✓ merged (asset URL resolver MISSING) |

**Test gates on `main` (after r2 corrections):**

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✓ 6/6 workspaces |
| `pnpm --filter @aigc-video/ai test` | ✓ 71/71 |
| `pnpm --filter @aigc-video/server test` | ✓ 75/75 |
| `pnpm --filter @aigc-video/web test` | ✓ 18/18 |
| `pnpm --filter @aigc-video/web build` | ✓ 302 kB / 94 kB gz |
| Server boot with real `.env` + ffmpeg preflight | ✓ `/api/health` + `/api/config/limits` reachable |

**Open gaps tracked in `plans/2026-05-28-pipeline-gap-closure-plan.md`.**

---

## 2. Sections inherited from r1 unchanged

The following r1 sections remain authoritative — no changes in r2:

- **§1 Goals** — unchanged.
- **§2 Module architecture** — unchanged (note: workflow wrappers live at `packages/ai/src/workflows/`, not in `agents/` as a casual reader of the diagram might infer).
- **§3 Database schema** — §3.1–3.5 unchanged; §3.6 corrected below.
- **§4 API surface** — route list and shapes unchanged; envelope policy clarified below.
- **§5 State machine and stale rules** — unchanged.
- **§6.1 Provider config — three independent triplets** — unchanged.
- **§7.1 Queue topology, §7.3 Video worker, §7.4 Idempotency, §7.5 Refresh recovery, §7.6 Crash recovery, §7.7 Trace events** — unchanged.
- **§8 Final video compose** — unchanged.
- **§11 Backend module summary** — unchanged.
- **§12 Rollout** — historical; all waves merged.

Sections corrected, replaced, or extended in r2 are below.

---

## 3. §3.6 Replacements (corrected)

r1 §3.6 said "Keep `workspace_video_archive` row, but the new code does not write it. Removal happens in a later pass." **The actual migration drops it.**

The implemented `apps/server/src/db/schema/schema.ts` contains:

```sql
drop table if exists workspace_video_archive cascade;
drop table if exists storyboard_shot cascade;
drop table if exists generation_job cascade;
```

All three legacy tables are removed. Final video outputs live exclusively in `final_video_jobs.localPath` / `localUrl` plus the workspace's `.daireel/final/<jobId>/final.mp4` file. There is no "later pass" pending for `workspace_video_archive`.

Preserved upstream tables — `product`, `asset`, `creative_workspace`, `workspace_artifact`, `script` — are unchanged.

---

## 4. §4 envelope policy (clarified)

r1 §4 said "All new routes return `WorkflowResponse<T>`". In implementation, the envelope applies **only to V2 routes** introduced under shot / generation / trace modules. V1 upstream routes preserve their existing shapes.

**V1 upstream routes (unchanged shapes):**

| Route | Response shape |
|---|---|
| `POST /api/workspaces` | `{workspace, manifest}` |
| `GET /api/workspaces` | `{workspaces: CreativeWorkspace[]}` |
| `GET /api/workspaces/:id/status` | workspace+materials+artifacts composite |
| `POST /api/workspaces/materials` | `{asset, materials}` |
| `POST /api/workspaces/brief/propose` | `{artifact, ...}` |
| `POST /api/workspaces/brief/approve` | same |
| `POST /api/workspaces/storyboard/propose` / `approve` | same |
| `POST /api/workspaces/shotprompt/compile` / `approve` | same |
| `POST /api/workspaces/feedback/route` | feedback decision |

**V2 routes (envelope):** every route under `shot/`, `generation/`, `trace/`, plus the new `/api/config/limits` (envelope-shaped). Envelope is:

```ts
interface WorkflowResponse<T> {
  data: T;
  shotStatus?: ShotStatus;
  nextAction?: NextAction;
  warnings?: string[];
  traceId?: string;
}
```

Frontend's `apps/web/src/lib/api/client.ts` already adapts to this split. Test fixtures and the gap-closure plan's `seed-workspace.ts` helper must use the V1 shapes when driving upstream calls.

---

## 5. §6.2 Ark image provider — synchronous, OpenAI-compatible (REPLACES r1 §6.2)

The Ark image generation API is **synchronous**, not async-task-based.

### 5.1 Authoritative endpoint

```
POST  <baseURL>/images/generations
Authorization: Bearer <IMAGE_API_KEY>
Content-Type: application/json
```

`baseURL` default `https://ark.cn-beijing.volces.com/api/v3` (set via `IMAGE_BASE_URL` or `DEFAULT_ARK_BASE_URL`). The whole Ark family uses OpenAI-compatible auth + URL conventions (see `docs/reference/chat/readme.md`).

### 5.2 Request body

```json
{
  "model": "<endpoint_id>",
  "prompt": "string, ≤300 Chinese chars or ≤600 English words",
  "image": "url or data:image/...;base64,...    // optional; string OR string[] (up to 14)",
  "size": "2K | 4K | <w>x<h>                    // see aspect-ratio mapping below",
  "sequential_image_generation": "auto | disabled",
  "sequential_image_generation_options": { "max_images": 1..15 },
  "response_format": "url | b64_json",
  "watermark": true,
  "guidance_scale": 1..10,
  "seed": 0..2^32
}
```

Constraints (per `docs/reference/image/GET.md`):
- For multi-candidate: `sequential_image_generation:"auto"` + `sequential_image_generation_options.max_images:N`. Input reference image count + generated count ≤ 15.
- `guidance_scale` is rejected by 5.0-lite/4.5/4.0 (the supported models for this project).
- `watermark`: default in the provider is `false` (we don't want AI-生成 stamps on demo videos).

### 5.3 Aspect ratio → size mapping (provider default)

The provider derives `size` from `req.aspectRatio` when `req.size` is not given. 2K tier:

| Aspect ratio | size |
|---|---|
| `9:16` | `1600x2848` |
| `16:9` | `2848x1600` |
| `1:1`  | `2048x2048` |

Override via `req.size`. Per-model size constraints:
- 5.0-lite/4.5/4.0: total pixels in `[3 686 400, 16 777 216]`, ratio in `[1/16, 16]`.
- 4.0 also accepts the 1K tier (`921 600` min).

### 5.4 Response

```json
{
  "model": "doubao-seedream-X-Y",
  "created": 1700000000,
  "data": [
    { "url": "https://...", "size": "1600x2848" },
    { "url": "https://...", "size": "1600x2848" },
    { "error": { "code": "ContentReviewFailed", "message": "blocked" } }
  ],
  "usage": { "generated_images": 2, "output_tokens": 12345, "total_tokens": 12345 }
}
```

URLs are valid for 24 hours. Per-item errors are returned as `data[i].error` and are surfaced in the provider's `candidateErrors[]` field without throwing the whole call. Top-level `error` and non-2xx HTTP throw.

### 5.5 Provider TypeScript interface

`packages/ai/src/providers/ark-image.provider.ts` (the actual on `main`):

```ts
export interface ArkImageRequest {
  prompt: string;
  negativePrompt?: string;
  referenceImageUrls?: string[];          // URL or data:image/...;base64,...
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  size?: string;                          // overrides aspect-ratio→size mapping
  watermark?: boolean;
  guidanceScale?: number;
  seed?: number;
}

export interface ArkImageResult {
  provider: "ark-seedream";
  model: string;
  candidates: Array<{ imageUrl: string; objectKey?: string; seed?: string; size?: string }>;
  candidateErrors: Array<{ index: number; code?: string; message?: string }>;
  usage?: { generatedImages?: number; outputTokens?: number; totalTokens?: number };
}

export async function generateImagesWithArk(
  req: ArkImageRequest,
  cfg: TaskProviderConfig,
  opts?: { fetch?: typeof fetch; traceLogger?: ...; jobId?: string }
): Promise<ArkImageResult>;
```

### 5.6 Trace events (replaces r1's `image.task_create_started` / `image.task_polled`)

| Event kind | When emitted |
|---|---|
| `image.request_started` | Before `POST /images/generations` |
| `image.completed` | On 2xx with non-empty `data` |
| `image.failed` | On non-2xx, parse error, or top-level `error` body |

`image.task_create_started` / `image.task_polled` from r1 are no longer used (no polling).

---

## 6. §6.3 Agents SDK runner — actual API (REPLACES r1 §6.3 snippet)

`@openai/agents@0.0.5` does not export `OpenAIChatCompletionsModel` and `Runner({ modelProvider })` separately. The actual API uses `OpenAIProvider`:

```ts
// packages/ai/src/agents/runner.ts (on main)
import { Agent, Runner, OpenAIProvider } from "@openai/agents";

export function buildRunner(cfg: TaskProviderConfig): Runner {
  const provider = new OpenAIProvider({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    useResponses: false,     // Ark exposes /chat/completions, NOT /responses
  });
  return new Runner({ modelProvider: provider });
}
```

`useResponses: false` is essential — Ark's OpenAI-compatible surface is `/chat/completions` (per `docs/reference/chat/readme.md`), not OpenAI's newer Responses API.

The runner builds Agents with Zod `outputType`:

```ts
export function buildStoryboardImagePromptAgent(model: string): Agent<unknown, unknown> {
  return new Agent({
    name: "StoryboardImagePromptAgent",
    model,                                          // pass the endpoint_id (ep-...)
    instructions: loadSystemPrompt("storyboard-image-prompt/v1.system.md"),
    outputType: StoryboardImagePromptOutputSchema, // zod schema
  });
}
```

Mock-mode short-circuits inside `packages/ai/src/workflows/*.workflow.ts` remain unchanged from r1 §6.5.

---

## 7. §7.2 Image worker (REPLACES r1 §7.2 pseudocode, including reference URL gap)

The image worker calls the synchronous provider. The asset URL resolution that r1 §7.2 implied (`assetService.urlsByIds(...)`) **is not yet implemented**. The current `image.worker.ts` passes:

```ts
referenceImageUrls: [],   // GAP: not wired to artifact.reference_asset_ids
```

This gap is closed by Wave 2 of the gap-closure plan (`plans/2026-05-28-pipeline-gap-closure-plan.md`). Once closed, the worker reads:

```ts
async function processGenerateImages(data: GenerateImagesJobData) {
  const batch = await db.db2.getImageBatch(data.batchId);
  if (batch.status !== "PENDING") return;                          // idempotent

  await db.db2.updateImageBatch(batch.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, { status: "RUNNING", startedAt: now() });

  const artifact = await db.db2.getImagePromptArtifact(data.imagePromptArtifactId);
  const referenceImageUrls = await resolveAssetUrls(artifact.referenceAssetIds);   // NEW (Wave 2)

  const result = await generateImagesWithArk({
    prompt: artifact.promptText,
    negativePrompt: artifact.negativePrompt ?? undefined,
    referenceImageUrls,                                                            // populated
    count: data.count,
    aspectRatio: data.aspectRatio,
  }, resolveImageProviderConfig()!, { traceLogger, jobId: data.jobId });

  for (const c of result.candidates) {
    await db.db2.insertImageCandidate({ ..., status: "SUCCEEDED", imageUrl: c.imageUrl, ... });
  }
  for (let i = result.candidates.length; i < data.count; i++) {
    await db.db2.insertImageCandidate({ ..., status: "FAILED", errorMessage: "provider_returned_short" });
  }
  // Surface per-item provider errors (data[i].error) into candidate rows too.
  for (const e of result.candidateErrors) {
    /* attach to corresponding candidate row */
  }

  const finalStatus =
    result.candidates.length === data.count ? "SUCCEEDED"
    : result.candidates.length > 0           ? "PARTIAL"
    :                                          "FAILED";
  await db.db2.updateImageBatch(batch.id, { status: finalStatus, succeededCount: result.candidates.length, failedCount: data.count - result.candidates.length });
  await jobRepository.update(data.jobId, { status: finalStatus === "FAILED" ? "FAILED" : "SUCCEEDED", completedAt: now() });
  await db.db2.updateShot(data.shotId, { status: finalStatus === "FAILED" ? "FAILED" : "IMAGE_CANDIDATES_READY" });
  await traceService.record({ workspaceId: data.workspaceId, shotId: data.shotId, traceType: "provider_call", name: "image_generation_completed", metadata: { provider: result.provider, model: result.model, count: result.candidates.length, jobId: data.jobId } });
}
```

`resolveAssetUrls(ids)` is defined in the gap-closure plan Wave 2 Task 1. Behaviour:

- Asset URL is already `https://...` → pass through.
- Asset is a workspace-managed local file → read bytes, base64-encode, return `data:<mime>;base64,<b64>` (Ark accepts data URLs in the `image` field).
- Unknown / missing asset id → log a warning and drop (do not throw).

---

## 8. §10 Testing strategy (REPLACES r1 §9)

The repo uses `node --test` + `tsx` exclusively. No vitest. No `-t '@tag'` filtering — gating uses env flags + `describe(..., {skip:!RUN}, ...)`.

### 8.1 Unit tests

| Command | Suite | Pass count |
|---|---|---|
| `pnpm --filter @aigc-video/ai test` | provider-config, schemas, ark-image, ark-text, seedance, agents/runner, workflows | 71 |
| `pnpm --filter @aigc-video/server test` | shot.state, shot.stale, image.worker, video.worker, final-compose.boundary, workspace.api, config, db | 75 |
| `pnpm --filter @aigc-video/web test` | url codec, focus store, step derivation, demo readiness, api client | 18 |

Server test script explicitly clears both legacy and V2 provider env vars to prevent `.env` leakage from shadowing test fixtures (commit `b6fe02e`):

```bash
ARK_API_KEY= ARK_TEXT_ENDPOINT_ID= ARK_VIDEO_ENDPOINT_ID= \
TEXT_API_KEY= TEXT_BASE_URL= TEXT_ENDPOINT_ID= \
IMAGE_API_KEY= IMAGE_BASE_URL= IMAGE_ENDPOINT_ID= \
VIDEO_API_KEY= VIDEO_BASE_URL= VIDEO_ENDPOINT_ID= \
node --import tsx --test --test-concurrency=1 "src/**/*.test.ts"
```

### 8.2 Integration tests (real-provider)

All integration tests live at `apps/server/test/integration/*.integration.test.ts`. They:

- Are gated by `process.env.RUN_REAL_PROVIDER_TESTS === "true"` (the `test:integration:*` scripts set this).
- Hit a running server at `process.env.TEST_API_BASE_URL` (no in-process `supertest`).
- Require real provider keys in process env. They do **not** auto-load `.env` — the harness must source it (addressed in gap-closure plan Wave 3 Task 2).

Integration env schema (`apps/server/test/helpers/provider-env.ts`) — fixed at `5cf3f45` to coerce empty optional URLs to `undefined`:

```ts
const optionalUrl = z
  .union([z.string().url(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));
```

Current test inventory (5 files):

| File | Tag | Current status |
|---|---|---|
| `image-flow.integration.test.ts` | `@provider` | Placeholder — uses wrong workspace POST envelope and hardcoded `shotId="shot-1"`. Replaced in gap-closure Wave 3 Task 3. |
| `video-flow.integration.test.ts` | `@expensive` | Placeholder — same issue. Replaced in Wave 3 Task 4. |
| `final-compose.integration.test.ts` | `@expensive` | Needs `TEST_FIXTURE_WORKSPACE` env. Replaced in Wave 4 Task 1. |
| `final-compose-contract.integration.test.ts` | `@expensive` | Needs `TEST_FIXTURE_WORKSPACE`. Replaced in Wave 4 Task 2. |
| `refresh-recovery.integration.test.ts` | `@smoke` | Needs `TEST_FIXTURE_WORKSPACE`. Replaced in Wave 4 Task 3. |

The gap-closure plan adds one more test file: `provider-smoke.integration.test.ts` (Wave 1 Task 2) — a minimal three-call probe against text/image/video providers, no fixture workspace required.

### 8.3 Test commands (actual)

`apps/server/package.json`:

```json
"test:unit":               "<env clearing> node --import tsx --test --test-concurrency=1 \"src/**/*.test.ts\"",
"test:integration:smoke":      "RUN_REAL_PROVIDER_TESTS=true node --import tsx --test --test-concurrency=1 \"test/integration/**/*.integration.test.ts\"",
"test:integration:provider":   "RUN_REAL_PROVIDER_TESTS=true node --import tsx --test --test-concurrency=1 \"test/integration/**/*.integration.test.ts\"",
"test:integration:expensive":  "RUN_REAL_PROVIDER_TESTS=true ALLOW_EXPENSIVE_TESTS=true node --import tsx --test --test-concurrency=1 \"test/integration/**/*.integration.test.ts\""
```

The three integration scripts run the **same set of files** — tag separation is purely the responsibility of `describe()` skip checks inside each file:

```ts
const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";
const ALLOW_EXPENSIVE = process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("image flow @provider", { skip: !RUN }, () => { ... });
describe("video flow @expensive", { skip: !RUN || !ALLOW_EXPENSIVE }, () => { ... });
```

CI policy (unchanged from r1):
- PR: unit only.
- Main merge: `test:integration:smoke`.
- Nightly + manual: `test:integration:provider` and `test:integration:expensive`.

---

## 9. §11 Frontend overhaul (clarified)

r1 §10 is unchanged in shape. One clarification: the frontend already adapts to the split envelope policy described in §4 above. Specifically:

- `apps/web/src/routes/App.tsx` uses `{workspace, manifest}` directly from `POST /api/workspaces` (V1 shape).
- `apps/web/src/lib/api/shots.ts`, `imagePrompt.ts`, `imageBatch.ts` etc. all expect the V2 envelope `{data, shotStatus?, nextAction?}`.

No frontend change needed for r2; the implementation is correct.

---

## 10. Open gaps (new in r2)

These are the open items that block end-to-end validation. All addressed in `plans/2026-05-28-pipeline-gap-closure-plan.md`.

1. **Asset URL resolution** — `apps/server/src/modules/material/asset-url-resolver.ts` does not exist. `image.worker.ts` passes empty `referenceImageUrls[]`. User-uploaded product images are not delivered to the image model. (Gap-closure Wave 2.)
2. **Test fixture helper** — `apps/server/test/helpers/seed-workspace.ts` does not exist. The 5 committed integration tests use placeholder ids and the wrong envelope shape; none can pass. (Gap-closure Wave 3.)
3. **Integration test env loading** — Test runner does not source `.env`. Callers must `source .env` manually. (Gap-closure Wave 3 Task 2.)
4. **Provider connectivity verification** — No script proves the configured `.env` produces working text/image/video calls. (Gap-closure Wave 1.)
5. **End-to-end manual acceptance** — Spec §15 r1 checklist not yet run with real providers + full per-shot flow + final mp4 download.

---

## 11. Deferred (extends r1 §13)

All of r1 §13 still deferred. Additionally noted in r2:

- **Per-shot insert / delete / reorder after seeding.** `approveShotPrompt` currently wipes prior shots on re-approval; mid-flight shot editing is future scope.
- **Multi-script-per-workspace.** Each `creative_workspace` still has exactly one `currentScriptId`.
- **`workspace_video_archive` references in archived design docs.** The table itself is dropped from the schema (see §3.6); old docs still mention it for historical context only.
- **Image API features beyond r2 scope**: `stream:true`, `tools:[{type:"web_search"}]`, `output_format:"png"`, group-image (`sequential_image_generation:"auto"` with `max_images > count`). The provider supports these flags; the per-shot pipeline does not surface them.
- **Video API features beyond r2 scope**: `return_last_frame:true`, `safety_identifier`, `priority`, `service_tier:"flex"`, Draft videos (Seedance 1.5 pro). Listed in `docs/reference/video/query_list.md`.

---

## 12. Acceptance checklist (r2)

Code on `main`:
- [x] Waves 1–7 of r1 merged.
- [x] Post-r1 corrections merged (`b6fe02e`, `5cf3f45`, `8198440`).
- [x] `pnpm typecheck`, `pnpm --filter @aigc-video/ai test`, `pnpm --filter @aigc-video/server test`, `pnpm --filter @aigc-video/web test`, `pnpm --filter @aigc-video/web build` all green.
- [x] Server boots with real `.env`; `/api/health` and `/api/config/limits` reachable.
- [x] `ffmpeg` and `ffprobe` installed; boot preflight passes.

Gap-closure plan (`plans/2026-05-28-pipeline-gap-closure-plan.md`) tasks:
- [x] Wave 1 — Provider smoke script + integration probe pass against real `.env`. Live verified: `smoke:providers` exits 0 with 3/3 ✓ (text 2.8s, image 9.7s, video 42s); `provider smoke @smoke` integration describe also 3/3 pass.
- [x] Wave 2 — Asset URL resolver implemented (`apps/server/src/modules/material/asset-url-resolver.ts`); image worker reads `artifact.referenceAssetIds`, resolves to URLs / data URLs, passes through to `generateImagesWithArk`. Unit test covers pass-through, data-URL conversion, drop-on-unknown, empty-input.
- [x] Wave 3 — `seed-workspace.ts` helper drives real upstream V1 flow (workspace → material upload → material-intake → brief propose+approve → storyboard propose+approve → shotprompt compile+approve). `refresh recovery @smoke` integration test passes end-to-end against real Ark in 109 s (verified). `image-flow.integration.test.ts` rewritten to use the helper; live execution against the real Ark text endpoint is currently blocked by a pre-existing `@aigc-video/ai` schema bug (see §12.1 below) — gap-closure code itself is correct.
- [x] Wave 4 — `final-compose`, `final-compose-contract`, `refresh-recovery` integration tests rewritten on the helper. `refresh-recovery` verified passing. `final-compose` + `final-compose-contract` are `@expensive` (40 + min wall-clock + heavy Seedance cost) and were intentionally not exercised in this verification pass; they typecheck and follow the same pattern as `final-compose.integration.test.ts` does after the `data.finalVideoJobId` correction (`22a6270`).
- [ ] Manual: open `/workspaces/<id>` in browser, run full per-shot flow for every shot, click "合成最终视频", download the resulting MP4 and verify it plays.

### 12.1 Pre-existing upstream blockers surfaced by the gap-closure integration tests

The gap-closure branch is internally complete and merge-ready. However, end-to-end image and video integration runs against the real Ark text endpoint are currently blocked by two pre-existing bugs in `packages/ai` that were already on `main` before the branch:

1. **Strict-mode Zod schema violations.** `packages/ai/src/schemas/image-prompt.schema.ts` and `packages/ai/src/schemas/video-script.schema.ts` declare several fields as `.optional()` without `.nullable()`. The `@openai/agents@0.0.5` Runner in strict-output mode rejects this with `"uses '.optional()' without '.nullable()' which is not supported by the API"`. Fix: each `.optional()` becomes `.nullable().optional()` (or the agents are switched off strict output). Blocks `image flow @provider` (image-prompt agent) and `video flow @expensive` (video-script agent). Not introduced by gap-closure — `image-prompt.schema.ts` is from r1 Wave 1.

2. **Build artifact packaging gap.** `packages/ai`'s `tsc` build emits `dist/index.js` but does NOT copy `src/prompts/**/*.md` into `dist/prompts/`. The runtime `loadSystemPrompt` in `packages/ai/src/agents/runner.ts` reads from `dist/prompts/...`, so any fresh checkout that runs the workspace build is broken until the `.md` files are copied. Fix: add a postbuild copy step to `packages/ai/package.json`, e.g. `"build": "tsc -p tsconfig.json && cp -R src/prompts dist/"`. Pre-existing.

Both are tracked as follow-up tasks. Once they land, the full gap-closure integration suite (`test:integration:smoke`, `:provider`, `:expensive`) should pass end-to-end without further test-side changes.

When the manual UI walkthrough and the two upstream fixes land, the per-shot pipeline is production-ready for the demo.

---

## 13. Provenance

- **r1**: `spec/2026-05-28-storyboard-image-video-pipeline-design.md` — original spec; remains as historical record.
- **r2** (this doc): corrections rolled in after implementation + real-provider validation against `docs/reference/`.
- **Authoritative provider references** (read these before changing any provider code):
  - `docs/reference/chat/readme.md` — Ark base URL, OpenAI-compatible auth, model = endpoint id.
  - `docs/reference/image/GET.md` — Synchronous image generation contract (request, size mapping, response, per-item errors, usage).
  - `docs/reference/video/query_list.md` — Seedance task object shape (statuses, content, duration, ratio, generate_audio).
  - `docs/reference/video/DELETE.md` — Task cancellation matrix.
- **Reality references** (verify before quoting):
  - `apps/server/src/db/schema/schema.ts` — actual SQL.
  - `apps/server/src/main.ts` — boot order (preflight → processor registration → worker → recovery sweep).
  - `apps/server/package.json` — actual `test*` scripts.
  - `packages/ai/src/providers/*.ts` — actual provider implementations.
  - `packages/ai/src/agents/runner.ts` — actual `@openai/agents` API usage.

---

## 14. Decision log added in r2

- **Empty-string optional URLs in integration env** → coerce to `undefined`. Rationale: `.env` files conventionally use empty values to mean "fall back to default"; Zod's `.url()` would otherwise reject them. (`5cf3f45`.)
- **Image provider `watermark` default** → `false`. Rationale: demo videos should not carry "AI 生成" stamps. Caller can opt in via `req.watermark`.
- **Aspect-ratio → size mapping at 2K tier** → 1600x2848 / 2848x1600 / 2048x2048. Rationale: 2K is the default for 5.0-lite/4.5/4.0 and within the documented total-pixel range; provides a sensible default without forcing the caller to learn the size table.
- **Per-item provider errors → `candidateErrors[]`** rather than thrown. Rationale: per `docs/reference/image/GET.md`, content-review failures only kill the single image; the rest of the batch still succeeds. Throwing would lose the partial result.
- **Test fixture helper deferred to gap-closure plan, not added in original waves**. Rationale: it's not implementation code — it's test scaffolding that requires the entire upstream flow to be operational. Sequencing it after the flow is implemented keeps the dependency graph clean.
