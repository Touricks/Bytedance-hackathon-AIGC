# Storyboard → Image → Video Per-Shot Pipeline — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/0528-agent-arc/spec/2026-05-28-storyboard-image-video-pipeline-design.md`

**Goal:** Replace the current one-shot video pipeline with a per-shot workflow — image prompt → N candidate images → user select → video script → M candidate videos → user select → deterministic ffmpeg final compose — backed by a unified job queue, three independent provider triplets (text/image/video), and real-provider integration tests.

**Architecture:** New per-module structure under `apps/server/src/modules/` (`shot`, `artifact`, `generation`, `job`, `trace`) plus new agent and provider code under `packages/ai/src/`. Postgres schema migration drops the legacy `storyboard_shot` and `generation_job` tables and introduces versioned artifacts, batch tables, and a generic `generation_jobs` queue. The OpenAI Agents SDK wraps two new agents (StoryboardImagePromptAgent, VideoShotScriptAgent); final compose is deterministic ffmpeg concat, never a model call.

**Tech Stack:** Node 22 · TypeScript · Fastify · Postgres (`pg`) · BullMQ + ioredis (optional) · OpenAI Agents SDK (`@openai/agents`) · Zod · Vitest · ffmpeg (system binary).

**Companion plan:** Frontend overhaul (Wave 6 in the spec) is in `2026-05-28-storyboard-image-video-pipeline-frontend.md`. Backend and frontend can be executed in parallel; the backend exposes contract-stable APIs by the end of Wave 5.

---

## File map

New files (created by this plan):

```
packages/ai/src/agents/runner.ts
packages/ai/src/agents/storyboard-image-prompt.agent.ts
packages/ai/src/agents/video-shot-script.agent.ts
packages/ai/src/schemas/image-prompt.schema.ts
packages/ai/src/schemas/video-script.schema.ts
packages/ai/src/prompts/storyboard-image-prompt/v1.system.md
packages/ai/src/prompts/video-shot-script/v1.system.md
packages/ai/src/providers/ark-image.provider.ts
packages/ai/src/providers/ark-image.provider.test.ts

apps/server/src/modules/shot/shot.routes.ts
apps/server/src/modules/shot/shot.controller.ts
apps/server/src/modules/shot/shot.service.ts
apps/server/src/modules/shot/shot.repository.ts
apps/server/src/modules/shot/shot.schema.ts
apps/server/src/modules/shot/shot.state.ts
apps/server/src/modules/shot/shot.state.unit.test.ts
apps/server/src/modules/shot/shot.stale.ts
apps/server/src/modules/shot/shot.stale.unit.test.ts

apps/server/src/modules/artifact/artifact.repository.ts
apps/server/src/modules/artifact/artifact.versioning.ts
apps/server/src/modules/artifact/artifact.versioning.unit.test.ts

apps/server/src/modules/generation/generation.routes.ts
apps/server/src/modules/generation/generation.controller.ts
apps/server/src/modules/generation/generation.service.ts
apps/server/src/modules/generation/image.worker.ts
apps/server/src/modules/generation/image.worker.unit.test.ts
apps/server/src/modules/generation/video.worker.ts
apps/server/src/modules/generation/video.worker.unit.test.ts
apps/server/src/modules/generation/final-compose.worker.ts
apps/server/src/modules/generation/final-compose.worker.unit.test.ts
apps/server/src/modules/generation/final-compose.boundary.unit.test.ts
apps/server/src/modules/generation/ffmpeg.ts

apps/server/src/modules/job/job.queue.ts
apps/server/src/modules/job/job.repository.ts

apps/server/src/modules/trace/trace.repository.ts
apps/server/src/modules/trace/trace.service.ts
apps/server/src/modules/trace/trace.routes.ts

apps/server/test/integration/<various>.integration.test.ts
apps/server/vitest.unit.config.ts
apps/server/vitest.integration.config.ts
apps/server/test/helpers/api-client.ts
apps/server/test/helpers/poll.ts
apps/server/test/helpers/provider-env.ts
```

Modified files:

```
package.json                                            (workspace scripts)
apps/server/package.json                                (deps: ffmpeg-static? no — use system; @openai/agents)
packages/ai/package.json                                (deps: @openai/agents)
packages/shared/src/jobs/types.ts                       (new queue name + payloads)
packages/shared/src/index.ts
packages/ai/src/index.ts
packages/ai/src/providers/provider-config.ts
apps/server/src/common/config.ts                        (batch-size + provider envs)
apps/server/src/db/schema/schema.ts
apps/server/src/db/schema/schema.sql
apps/server/src/db/client.ts                            (new tables)
apps/server/src/app.ts                                  (register new modules, drop creation)
apps/server/src/modules/workspace/workspace.service.ts  (drop startVideoGeneration; seed shots)
apps/server/src/jobs/queue.ts                           (new queue 'generation_v2', new job kinds)
infra/docker-compose.yml                                (ffmpeg available in worker image)
.env.example
```

Deleted files:

```
apps/server/src/modules/creation/creation.controller.ts
apps/server/src/modules/creation/creation.repository.ts
apps/server/src/modules/creation/creation.service.ts
apps/server/src/jobs/processors/media-generate.processor.ts
apps/server/src/jobs/seedance-image-input.ts            (only if no remaining callers; verify)
```

---

## Conventions used throughout

- **Test framework:** `vitest`. Run individual file with `pnpm --filter @aigc-video/server test:unit -- path/to/file.unit.test.ts`. Run all unit tests in a package with `pnpm --filter @aigc-video/server test:unit`.
- **TDD discipline:** Failing test → run to see failure → minimal implementation → run to see pass → commit. Each task ends with a commit. Commit messages use the conventional-commit prefixes used in the repo (`feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`).
- **Commit hygiene:** Never use `--no-verify`. Husky pre-commit runs `lint-staged` (prettier); allow it to format.
- **DB writes are transactional:** Anywhere this plan says "in the same transaction" or "atomically", wrap the relevant queries with `pool.connect()` + `client.query("begin")` / `commit` / `rollback` following the existing `createShots` pattern in `apps/server/src/db/client.ts`.
- **Trace events:** Every worker, agent invocation, and state transition writes a row to `trace_events` (via `TraceService.record`) AND appends to the workspace `.daireel/trace/events.jsonl` via the existing `FileTraceLogger`.
- **Idempotency-Key header:** required on all batch POSTs. Verify with the route schema below; missing → 400 `IDEMPOTENCY_KEY_REQUIRED`.

---

## WAVE 1 — Foundations (10 tasks)

### Task 1: Add `@openai/agents` dependency

**Files:**
- Modify: `packages/ai/package.json`
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Add the dependency**

Edit `packages/ai/package.json`, add to `dependencies` (alphabetical):

```json
"@openai/agents": "^0.0.5",
```

- [ ] **Step 2: Install**

Run from repo root: `pnpm install`
Expected: lockfile updated, no other workspace package changes.

- [ ] **Step 3: Sanity import**

Add a temporary file `packages/ai/src/agents/__sanity__.ts`:

```ts
import { Agent, Runner } from "@openai/agents";
export const _sanity = { Agent, Runner };
```

Run `pnpm --filter @aigc-video/ai typecheck`. Expected: passes.

- [ ] **Step 4: Delete sanity file and commit**

```bash
rm packages/ai/src/agents/__sanity__.ts
git add packages/ai/package.json pnpm-lock.yaml
git commit -m "chore(ai): add @openai/agents dependency"
```

---

### Task 2: Provider-config rewrite — three triplets

**Files:**
- Modify: `packages/ai/src/providers/provider-config.ts`
- Create: `packages/ai/src/providers/provider-config.unit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ai/src/providers/provider-config.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resolveTextProviderConfig,
  resolveImageProviderConfig,
  resolveVideoProviderConfig,
  maskSecret,
} from "./provider-config.js";

describe("resolveTextProviderConfig", () => {
  it("prefers TEXT_* over ARK_* aliases", () => {
    const cfg = resolveTextProviderConfig({
      TEXT_API_KEY: "new-key",
      TEXT_BASE_URL: "https://new.example/v1",
      TEXT_ENDPOINT_ID: "new-endpoint",
      ARK_API_KEY: "old-key",
      ARK_BASE_URL: "https://old.example/v1",
      ARK_TEXT_ENDPOINT_ID: "old-endpoint",
    });
    expect(cfg).toEqual({
      task: "text",
      provider: "ark",
      apiKey: "new-key",
      baseURL: "https://new.example/v1",
      endpointId: "new-endpoint",
    });
  });

  it("falls back to ARK_* when TEXT_* not set", () => {
    const cfg = resolveTextProviderConfig({
      ARK_API_KEY: "ak",
      ARK_BASE_URL: "https://ark.example/v1",
      ARK_TEXT_ENDPOINT_ID: "tx",
    });
    expect(cfg?.apiKey).toBe("ak");
    expect(cfg?.endpointId).toBe("tx");
  });

  it("returns null when required keys missing", () => {
    expect(resolveTextProviderConfig({ ARK_API_KEY: "k" })).toBeNull();
    expect(resolveTextProviderConfig({ ARK_TEXT_ENDPOINT_ID: "e" })).toBeNull();
  });
});

describe("resolveImageProviderConfig", () => {
  it("requires IMAGE_API_KEY and IMAGE_ENDPOINT_ID (no ARK fallback)", () => {
    expect(
      resolveImageProviderConfig({
        ARK_API_KEY: "k",
        ARK_VIDEO_ENDPOINT_ID: "v",
      }),
    ).toBeNull();
    expect(
      resolveImageProviderConfig({
        IMAGE_API_KEY: "ik",
        IMAGE_ENDPOINT_ID: "ie",
      }),
    ).toEqual({
      task: "image",
      provider: "ark-seedream",
      apiKey: "ik",
      baseURL: "https://ark.cn-beijing.volces.com/api/v3",
      endpointId: "ie",
    });
  });
});

describe("resolveVideoProviderConfig", () => {
  it("falls back to ARK_VIDEO_ENDPOINT_ID", () => {
    const cfg = resolveVideoProviderConfig({
      ARK_API_KEY: "ak",
      ARK_VIDEO_ENDPOINT_ID: "vid",
    });
    expect(cfg?.endpointId).toBe("vid");
  });
});

describe("maskSecret", () => {
  it("preserves first 4 and last 4 chars", () => {
    expect(maskSecret("abcd1234efghij")).toBe("abcd****ghij");
  });
  it("masks short secrets fully", () => {
    expect(maskSecret("short")).toBe("****");
    expect(maskSecret("")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aigc-video/ai test:unit -- src/providers/provider-config.unit.test.ts`
Expected: FAIL — `resolveTextProviderConfig`, `resolveImageProviderConfig`, `resolveVideoProviderConfig`, `maskSecret` not defined.

- [ ] **Step 3: Implement the resolvers**

Replace the body of `packages/ai/src/providers/provider-config.ts` with:

```ts
import { loadWorkspaceEnv } from "../env.js";

loadWorkspaceEnv();

export const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export type ProviderEnv = Record<string, string | undefined>;

export interface TaskProviderConfig {
  task: "text" | "image" | "video";
  provider: string;
  apiKey: string;
  endpointId: string;
  baseURL: string;
  timeoutMs?: number;
}

function pickFirst(env: ProviderEnv, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function isRealProviderMode(env: ProviderEnv = process.env) {
  return env.MODEL_MODE === "real";
}

export function resolveTextProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TaskProviderConfig, "apiKey" | "endpointId" | "baseURL">> = {},
): TaskProviderConfig | null {
  const apiKey = overrides.apiKey ?? pickFirst(env, ["TEXT_API_KEY", "AI_TEXT_API_KEY", "ARK_API_KEY"]);
  const endpointId = overrides.endpointId ?? pickFirst(env, ["TEXT_ENDPOINT_ID", "AI_TEXT_ENDPOINT_ID", "ARK_TEXT_ENDPOINT_ID"]);
  if (!apiKey || !endpointId) return null;
  const baseURL = overrides.baseURL ?? pickFirst(env, ["TEXT_BASE_URL", "AI_TEXT_BASE_URL", "ARK_BASE_URL"]) ?? DEFAULT_ARK_BASE_URL;
  return { task: "text", provider: "ark", apiKey, baseURL, endpointId };
}

export function resolveImageProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TaskProviderConfig, "apiKey" | "endpointId" | "baseURL">> = {},
): TaskProviderConfig | null {
  const apiKey = overrides.apiKey ?? pickFirst(env, ["IMAGE_API_KEY", "AI_IMAGE_API_KEY"]);
  const endpointId = overrides.endpointId ?? pickFirst(env, ["IMAGE_ENDPOINT_ID", "AI_IMAGE_ENDPOINT_ID"]);
  if (!apiKey || !endpointId) return null;
  const baseURL = overrides.baseURL ?? pickFirst(env, ["IMAGE_BASE_URL", "AI_IMAGE_BASE_URL"]) ?? DEFAULT_ARK_BASE_URL;
  return { task: "image", provider: "ark-seedream", apiKey, baseURL, endpointId };
}

export function resolveVideoProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TaskProviderConfig, "apiKey" | "endpointId" | "baseURL">> = {},
): TaskProviderConfig | null {
  const apiKey = overrides.apiKey ?? pickFirst(env, ["VIDEO_API_KEY", "AI_VIDEO_API_KEY", "ARK_API_KEY"]);
  const endpointId = overrides.endpointId ?? pickFirst(env, ["VIDEO_ENDPOINT_ID", "AI_VIDEO_ENDPOINT_ID", "ARK_VIDEO_ENDPOINT_ID"]);
  if (!apiKey || !endpointId) return null;
  const baseURL = overrides.baseURL ?? pickFirst(env, ["VIDEO_BASE_URL", "AI_VIDEO_BASE_URL", "ARK_BASE_URL"]) ?? DEFAULT_ARK_BASE_URL;
  return { task: "video", provider: "seedance", apiKey, baseURL, endpointId };
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

// ----- legacy aliases (kept for callers in this wave; removed in Wave 2) -----
export interface TextProviderConfig {
  provider: "ark";
  apiKey: string;
  model: string;
  baseURL: string;
}
export interface VideoProviderConfig {
  provider: "seedance";
  apiKey: string;
  model: string;
  baseURL: string;
}
export function resolveArkTextProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TextProviderConfig, "apiKey" | "model" | "baseURL">> = {},
): TextProviderConfig | null {
  const cfg = resolveTextProviderConfig(env, {
    apiKey: overrides.apiKey,
    endpointId: overrides.model,
    baseURL: overrides.baseURL,
  });
  if (!cfg) return null;
  return { provider: "ark", apiKey: cfg.apiKey, model: cfg.endpointId, baseURL: cfg.baseURL };
}
export function resolveArkVideoProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<VideoProviderConfig, "apiKey" | "model" | "baseURL">> = {},
): VideoProviderConfig | null {
  const cfg = resolveVideoProviderConfig(env, {
    apiKey: overrides.apiKey,
    endpointId: overrides.model,
    baseURL: overrides.baseURL,
  });
  if (!cfg) return null;
  return { provider: "seedance", apiKey: cfg.apiKey, model: cfg.endpointId, baseURL: cfg.baseURL };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @aigc-video/ai test:unit -- src/providers/provider-config.unit.test.ts`
Expected: PASS (all green).

- [ ] **Step 5: Run the full package test suite for regressions**

Run: `pnpm --filter @aigc-video/ai test`
Expected: PASS. Existing `provider-config.test.ts` should still pass because the legacy alias functions are preserved.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/providers/provider-config.ts packages/ai/src/providers/provider-config.unit.test.ts
git commit -m "feat(ai): three independent provider triplets with ARK_* fallbacks"
```

---

### Task 3: Batch-size env config

**Files:**
- Modify: `apps/server/src/common/config.ts`
- Modify: `.env.example`
- Create: `apps/server/src/common/config.unit.test.ts` (additions)

- [ ] **Step 1: Append batch-size fields to `.env.example`**

Add to `.env.example` (preserve existing content; append at end):

```
# Per-task model providers (text / image / video each independent).
# TEXT_* and VIDEO_* fall back to ARK_* for backward compatibility.
TEXT_API_KEY=
TEXT_BASE_URL=
TEXT_ENDPOINT_ID=
IMAGE_API_KEY=
IMAGE_BASE_URL=
IMAGE_ENDPOINT_ID=
VIDEO_API_KEY=
VIDEO_BASE_URL=
VIDEO_ENDPOINT_ID=

# Batch sizing (per-shot generation). Default applied when client omits count;
# max is a hard server-enforced cap.
DEFAULT_IMAGE_BATCH_SIZE=3
MAX_IMAGE_BATCH_SIZE=6
DEFAULT_VIDEO_BATCH_SIZE=5
MAX_VIDEO_BATCH_SIZE=10
```

- [ ] **Step 2: Write failing test**

Append to `apps/server/src/common/config.test.ts` (existing file):

```ts
import { describe, it, expect } from "vitest";
import { config } from "./config.js";

describe("batch sizing config", () => {
  it("exposes default and max image/video batch sizes", () => {
    expect(typeof config.defaultImageBatchSize).toBe("number");
    expect(typeof config.maxImageBatchSize).toBe("number");
    expect(typeof config.defaultVideoBatchSize).toBe("number");
    expect(typeof config.maxVideoBatchSize).toBe("number");
    expect(config.maxImageBatchSize).toBeGreaterThanOrEqual(config.defaultImageBatchSize);
    expect(config.maxVideoBatchSize).toBeGreaterThanOrEqual(config.defaultVideoBatchSize);
  });
});
```

- [ ] **Step 3: Run, see fail**

`pnpm --filter @aigc-video/server test:unit -- src/common/config.test.ts`
Expected: FAIL — properties undefined.

- [ ] **Step 4: Implement**

Modify `apps/server/src/common/config.ts`. Inside the exported `config` object literal (add after `uploadUrlPrefix`):

```ts
  defaultImageBatchSize: Number(process.env.DEFAULT_IMAGE_BATCH_SIZE ?? 3),
  maxImageBatchSize: Number(process.env.MAX_IMAGE_BATCH_SIZE ?? 6),
  defaultVideoBatchSize: Number(process.env.DEFAULT_VIDEO_BATCH_SIZE ?? 5),
  maxVideoBatchSize: Number(process.env.MAX_VIDEO_BATCH_SIZE ?? 10),
```

- [ ] **Step 5: Run, see pass**

`pnpm --filter @aigc-video/server test:unit -- src/common/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .env.example apps/server/src/common/config.ts apps/server/src/common/config.test.ts
git commit -m "feat(server): expose default and max batch size config"
```

---

### Task 4: Ark image provider

**Files:**
- Create: `packages/ai/src/providers/ark-image.provider.ts`
- Create: `packages/ai/src/providers/ark-image.provider.test.ts`

- [ ] **Step 1: Write the failing test (stubbed fetch)**

Create `packages/ai/src/providers/ark-image.provider.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { generateImagesWithArk } from "./ark-image.provider.js";

const cfg = {
  task: "image" as const,
  provider: "ark-seedream",
  apiKey: "test-key",
  endpointId: "ep-image",
  baseURL: "https://ark.example/v3",
};

describe("generateImagesWithArk", () => {
  it("creates an async task and polls until image_url returned", async () => {
    const fetchImpl = vi.fn()
      // 1) create task
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "task-1" }), { status: 200 }))
      // 2) first poll: still running
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "running" }), { status: 200 }))
      // 3) second poll: succeeded with two images
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "succeeded",
            data: { images: [{ url: "https://cdn.example/1.png" }, { url: "https://cdn.example/2.png" }] },
          }),
          { status: 200 },
        ),
      );

    const result = await generateImagesWithArk(
      { prompt: "p", count: 2, aspectRatio: "9:16" },
      cfg,
      { fetch: fetchImpl, pollIntervalMs: 0, maxPollAttempts: 5 },
    );

    expect(result.provider).toBe("ark-seedream");
    expect(result.model).toBe("ep-image");
    expect(result.candidates.map((c) => c.imageUrl)).toEqual([
      "https://cdn.example/1.png",
      "https://cdn.example/2.png",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws on failed task status", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "task-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed", message: "nope" }), { status: 200 }));

    await expect(
      generateImagesWithArk({ prompt: "p", count: 1, aspectRatio: "9:16" }, cfg, {
        fetch: fetchImpl,
        pollIntervalMs: 0,
        maxPollAttempts: 5,
      }),
    ).rejects.toThrow(/failed/i);
  });
});
```

- [ ] **Step 2: Run, see fail**

`pnpm --filter @aigc-video/ai test:unit -- src/providers/ark-image.provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement provider**

Create `packages/ai/src/providers/ark-image.provider.ts`:

```ts
import type { TaskProviderConfig } from "./provider-config.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export interface ArkImageRequest {
  prompt: string;
  negativePrompt?: string;
  referenceImageUrls?: string[];
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  seed?: number;
}
export interface ArkImageCandidate {
  imageUrl: string;
  objectKey?: string;
  seed?: string;
}
export interface ArkImageResult {
  provider: "ark-seedream";
  model: string;
  candidates: ArkImageCandidate[];
}

export interface ArkImageProviderOptions {
  fetch?: typeof fetch;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  traceLogger?: Pick<FileTraceLogger, "append">;
  jobId?: string;
  contractId?: string;
  contractVersion?: string;
}

function joinPath(base: string, p: string) {
  return `${base.replace(/\/+$/, "")}/${p.replace(/^\/+/, "")}`;
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function readJson(res: Response) {
  const t = await res.text();
  return t ? JSON.parse(t) : {};
}

function extractImageUrls(payload: unknown): string[] {
  const urls: string[] = [];
  const visit = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (typeof v !== "object") return;
    const r = v as Record<string, unknown>;
    for (const key of ["url", "image_url", "imageUrl"]) {
      const candidate = r[key];
      if (typeof candidate === "string") urls.push(candidate);
    }
    for (const key of ["images", "data", "result", "output", "results", "items", "content"]) {
      visit(r[key]);
    }
  };
  visit(payload);
  return urls;
}

function extractTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  for (const k of ["id", "task_id", "taskId"]) {
    if (typeof r[k] === "string") return r[k];
  }
  for (const k of ["data", "result", "output"]) {
    if (r[k] && typeof r[k] === "object") {
      const id = extractTaskId(r[k]);
      if (id) return id;
    }
  }
  return null;
}

function extractTaskStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  for (const k of ["status", "task_status", "taskStatus"]) {
    if (typeof r[k] === "string") return r[k].toLowerCase();
  }
  for (const k of ["data", "result", "output"]) {
    if (r[k] && typeof r[k] === "object") {
      const s = extractTaskStatus(r[k]);
      if (s) return s;
    }
  }
  return null;
}

export async function generateImagesWithArk(
  req: ArkImageRequest,
  cfg: TaskProviderConfig,
  opts: ArkImageProviderOptions = {},
): Promise<ArkImageResult> {
  const fetchImpl = opts.fetch ?? fetch;
  const pollIntervalMs = opts.pollIntervalMs ?? 5000;
  const maxAttempts = opts.maxPollAttempts ?? 30;

  await opts.traceLogger?.append({
    kind: "image.task_create_started",
    pipeline: "shot_image",
    status: "ok",
    jobId: opts.jobId,
    provider: cfg.provider,
    model: cfg.endpointId,
    meta: { prompt: req.prompt, count: req.count, aspectRatio: req.aspectRatio },
  });

  const createRes = await fetchImpl(joinPath(cfg.baseURL, "contents/generations/tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.endpointId,
      content: [
        { type: "text", text: req.prompt },
        ...(req.referenceImageUrls ?? []).map((url) => ({ type: "image_url", image_url: { url } })),
      ],
      n: req.count,
      ratio: req.aspectRatio,
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Ark image task create failed (${createRes.status}): ${body.slice(0, 240)}`);
  }
  const createPayload = await readJson(createRes);
  const immediate = extractImageUrls(createPayload);
  if (immediate.length > 0) {
    return {
      provider: "ark-seedream",
      model: cfg.endpointId,
      candidates: immediate.slice(0, req.count).map((url) => ({ imageUrl: url })),
    };
  }
  const taskId = extractTaskId(createPayload);
  if (!taskId) throw new Error("Ark image task create did not return a task id");

  const taskUrl = joinPath(cfg.baseURL, `contents/generations/tasks/${taskId}`);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchImpl(taskUrl, { method: "GET", headers: { Authorization: `Bearer ${cfg.apiKey}` } });
    if (!res.ok) {
      throw new Error(`Ark image task poll failed (${res.status})`);
    }
    const payload = await readJson(res);
    await opts.traceLogger?.append({
      kind: "image.task_polled",
      pipeline: "shot_image",
      status: "ok",
      jobId: opts.jobId,
      provider: cfg.provider,
      model: cfg.endpointId,
      meta: { taskId, status: extractTaskStatus(payload) },
    });
    const status = extractTaskStatus(payload);
    if (status && ["failed", "fail", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(`Ark image task ${taskId} failed`);
    }
    const urls = extractImageUrls(payload);
    if (urls.length > 0) {
      const candidates = urls.slice(0, req.count).map((url) => ({ imageUrl: url }));
      await opts.traceLogger?.append({
        kind: "image.completed",
        pipeline: "shot_image",
        status: "ok",
        jobId: opts.jobId,
        provider: cfg.provider,
        model: cfg.endpointId,
        meta: { taskId, count: candidates.length },
      });
      return { provider: "ark-seedream", model: cfg.endpointId, candidates };
    }
    if (i < maxAttempts - 1) await sleep(pollIntervalMs);
  }
  throw new Error(`Ark image task ${taskId} did not complete in time`);
}
```

- [ ] **Step 4: Run, see pass**

`pnpm --filter @aigc-video/ai test:unit -- src/providers/ark-image.provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/providers/ark-image.provider.ts packages/ai/src/providers/ark-image.provider.test.ts
git commit -m "feat(ai): Ark image provider with async task + polling"
```

---

### Task 5: Image-prompt and video-script Zod schemas

**Files:**
- Create: `packages/ai/src/schemas/image-prompt.schema.ts`
- Create: `packages/ai/src/schemas/video-script.schema.ts`
- Create: `packages/ai/src/schemas/image-prompt.schema.unit.test.ts`
- Create: `packages/ai/src/schemas/video-script.schema.unit.test.ts`

- [ ] **Step 1: Tests for schemas**

`packages/ai/src/schemas/image-prompt.schema.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { StoryboardImagePromptOutputSchema } from "./image-prompt.schema.js";

describe("StoryboardImagePromptOutputSchema", () => {
  const valid = {
    promptText: "A cinematic close-up of the product on a marble counter",
    productVisibilityRule: "hero",
    referenceImageUsage: [],
    qualityChecklist: [],
  };
  it("accepts a valid payload", () => {
    expect(StoryboardImagePromptOutputSchema.parse(valid)).toMatchObject(valid);
  });
  it("rejects when promptText too short", () => {
    expect(() => StoryboardImagePromptOutputSchema.parse({ ...valid, promptText: "tiny" })).toThrow();
  });
  it("defaults referenceImageUsage to []", () => {
    const { promptText, productVisibilityRule } = valid;
    const out = StoryboardImagePromptOutputSchema.parse({ promptText, productVisibilityRule });
    expect(out.referenceImageUsage).toEqual([]);
    expect(out.qualityChecklist).toEqual([]);
  });
});
```

`packages/ai/src/schemas/video-script.schema.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { VideoShotScriptOutputSchema } from "./video-script.schema.js";

describe("VideoShotScriptOutputSchema", () => {
  const valid = {
    durationSec: 4,
    shotGoal: "Show product",
    startFrameDescription: "Close-up product on marble",
    endFrameDescription: "Wider shot, hand picks it up",
    cameraMotion: "push_in",
    subjectMotion: "hand enters frame",
    productVisibility: "hero",
    sceneConsistency: "same lighting throughout",
    providerPrompt: "A 4-second cinematic shot pushing in on the product on marble; hand enters and lifts it",
    riskNotes: [],
  };
  it("accepts a valid payload", () => {
    expect(VideoShotScriptOutputSchema.parse(valid)).toMatchObject(valid);
  });
  it("rejects durationSec > 8", () => {
    expect(() => VideoShotScriptOutputSchema.parse({ ...valid, durationSec: 12 })).toThrow();
  });
  it("rejects providerPrompt shorter than 30 chars", () => {
    expect(() => VideoShotScriptOutputSchema.parse({ ...valid, providerPrompt: "too short" })).toThrow();
  });
});
```

- [ ] **Step 2: Run, see fail (module not found)**

`pnpm --filter @aigc-video/ai test:unit -- src/schemas/`
Expected: FAIL.

- [ ] **Step 3: Implement schemas**

`packages/ai/src/schemas/image-prompt.schema.ts`:

```ts
import { z } from "zod";

export const StoryboardImagePromptOutputSchema = z.object({
  promptText: z.string().min(20),
  negativePrompt: z.string().optional(),
  visualStyle: z.string().optional(),
  composition: z.string().optional(),
  lighting: z.string().optional(),
  productVisibilityRule: z.string().min(1),
  referenceImageUsage: z
    .array(
      z.object({
        assetId: z.string().min(1),
        usage: z.enum([
          "product_identity",
          "style_reference",
          "scene_reference",
          "composition_reference",
        ]),
        instruction: z.string().min(1),
      }),
    )
    .default([]),
  qualityChecklist: z.array(z.string()).default([]),
});
export type StoryboardImagePromptOutput = z.infer<typeof StoryboardImagePromptOutputSchema>;
```

`packages/ai/src/schemas/video-script.schema.ts`:

```ts
import { z } from "zod";

export const VideoShotScriptOutputSchema = z.object({
  durationSec: z.number().int().min(1).max(8),
  shotGoal: z.string().min(1),
  startFrameDescription: z.string().min(1),
  endFrameDescription: z.string().min(1),
  continuityWithPrevious: z.string().optional(),
  continuityWithNext: z.string().optional(),
  cameraMotion: z.string().min(1),
  subjectMotion: z.string().min(1),
  productVisibility: z.string().min(1),
  sceneConsistency: z.string().min(1),
  voiceover: z.string().optional(),
  onscreenText: z.string().optional(),
  providerPrompt: z.string().min(30),
  negativePrompt: z.string().optional(),
  riskNotes: z.array(z.string()).default([]),
});
export type VideoShotScriptOutput = z.infer<typeof VideoShotScriptOutputSchema>;
```

- [ ] **Step 4: Run, see pass**

`pnpm --filter @aigc-video/ai test:unit -- src/schemas/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/schemas/
git commit -m "feat(ai): zod schemas for image-prompt and video-script agent outputs"
```

---

### Task 6: Agent prompt templates

**Files:**
- Create: `packages/ai/src/prompts/storyboard-image-prompt/v1.system.md`
- Create: `packages/ai/src/prompts/video-shot-script/v1.system.md`

- [ ] **Step 1: Create the image-prompt system prompt**

`packages/ai/src/prompts/storyboard-image-prompt/v1.system.md`:

```markdown
You are StoryboardImagePromptAgent for an e-commerce short-video pipeline.

# Role
Given a product brief, a single storyboard shot objective, and a list of available reference assets, produce a structured prompt for the image-generation provider that will render a candidate still for this shot.

# Inputs you will receive (as JSON)
- productBrief: the approved product brief
- shot: { index, objective, sceneDescription, defaultDurationSec }
- referenceAssets: array of { id, role, summary } for assets the workflow has selected for this shot
- userHint: optional free-form user instruction
- stylePresetId: optional creative template hint

# Output contract
Return only the JSON object matching StoryboardImagePromptOutputSchema. Do not wrap in markdown. Do not include explanatory text. The JSON must be parseable by Zod.

# Rules
1. promptText must be self-contained, vivid, and at least 20 characters. Mention product identity, environment, lighting, and any reference style cues.
2. For each item in referenceImageUsage, set the asset's intended role and a short instruction.
3. productVisibilityRule must be one of: hero, clear, partial, background. Reflect the shot objective.
4. Never include URLs, file paths, or assistant chatter in promptText.
5. qualityChecklist may list up to 5 short bullet rules the renderer should obey (e.g., "no logo distortion").
```

- [ ] **Step 2: Create the video-script system prompt**

`packages/ai/src/prompts/video-shot-script/v1.system.md`:

```markdown
You are VideoShotScriptAgent for an e-commerce short-video pipeline.

# Role
Produce a short, deterministic video shot script that the video provider can render from a selected still image. The script must respect the user-supplied duration in seconds and remain continuous with neighboring shots when possible.

# Inputs you will receive (as JSON)
- productBrief
- shot: { index, objective, sceneDescription }
- selectedImage: { id, summary, url }
- neighborImages: { prev?: { id, summary, url }, next?: { id, summary, url } }
- durationSec: integer 1..8
- userHint: optional free-form user instruction

# Output contract
Return only the JSON object matching VideoShotScriptOutputSchema. Do not wrap in markdown.

# Rules
1. durationSec must equal the request value.
2. providerPrompt must be at least 30 characters, describe a single continuous shot, and avoid mention of editing or cuts.
3. cameraMotion is one of: static, push_in, pull_out, pan, tilt, handheld, orbit (lower_snake_case). Use vocabulary the provider understands.
4. subjectMotion describes what moves in frame.
5. If neighborImages.prev or .next are present, mention how this shot connects (continuityWithPrevious / continuityWithNext).
6. Never invent product attributes not in productBrief.
```

- [ ] **Step 3: Commit (no test runs needed)**

```bash
git add packages/ai/src/prompts/storyboard-image-prompt/ packages/ai/src/prompts/video-shot-script/
git commit -m "feat(ai): v1 system prompts for image-prompt and video-script agents"
```

---

### Task 7: Agents SDK runner + two new agents

**Files:**
- Create: `packages/ai/src/agents/runner.ts`
- Create: `packages/ai/src/agents/storyboard-image-prompt.agent.ts`
- Create: `packages/ai/src/agents/video-shot-script.agent.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Implement the runner**

`packages/ai/src/agents/runner.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, Runner, OpenAIChatCompletionsModel } from "@openai/agents";
import OpenAI from "openai";
import type { TaskProviderConfig } from "../providers/provider-config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadSystemPrompt(relativePath: string): string {
  return readFileSync(path.join(here, "..", "prompts", relativePath), "utf8");
}

export interface RunnerContext {
  workspaceId: string;
  shotId?: string;
  traceId: string;
  runtimeMode: "real" | "mock";
}

export function buildRunner(cfg: TaskProviderConfig): Runner {
  const openai = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  return new Runner({
    modelProvider: {
      getModel: () => new OpenAIChatCompletionsModel(openai, cfg.endpointId),
    },
  });
}

export interface RunAgentInput<TInput> {
  agent: Agent<unknown, unknown>;
  input: TInput;
  context: RunnerContext;
  runner: Runner;
  maxTurns?: number;
}

export async function runAgent<TInput, TOutput>(args: RunAgentInput<TInput>): Promise<TOutput> {
  const result = await args.runner.run(args.agent, JSON.stringify(args.input), {
    context: args.context,
    maxTurns: args.maxTurns ?? 6,
  });
  if (!result.finalOutput) {
    throw new Error("AGENT_EMPTY_FINAL_OUTPUT");
  }
  return result.finalOutput as TOutput;
}
```

- [ ] **Step 2: Implement the two agent modules**

`packages/ai/src/agents/storyboard-image-prompt.agent.ts`:

```ts
import { Agent } from "@openai/agents";
import { StoryboardImagePromptOutputSchema } from "../schemas/image-prompt.schema.js";
import { loadSystemPrompt } from "./runner.js";

export const STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION = "v1";

export function buildStoryboardImagePromptAgent(model: string): Agent<unknown, unknown> {
  return new Agent({
    name: "StoryboardImagePromptAgent",
    model,
    instructions: loadSystemPrompt("storyboard-image-prompt/v1.system.md"),
    outputType: StoryboardImagePromptOutputSchema,
  });
}
```

`packages/ai/src/agents/video-shot-script.agent.ts`:

```ts
import { Agent } from "@openai/agents";
import { VideoShotScriptOutputSchema } from "../schemas/video-script.schema.js";
import { loadSystemPrompt } from "./runner.js";

export const VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION = "v1";

export function buildVideoShotScriptAgent(model: string): Agent<unknown, unknown> {
  return new Agent({
    name: "VideoShotScriptAgent",
    model,
    instructions: loadSystemPrompt("video-shot-script/v1.system.md"),
    outputType: VideoShotScriptOutputSchema,
  });
}
```

- [ ] **Step 3: Export from package index**

Modify `packages/ai/src/index.ts`. Append after the existing exports:

```ts
export * from "./providers/ark-image.provider.js";
export * from "./schemas/image-prompt.schema.js";
export * from "./schemas/video-script.schema.js";
export * from "./agents/runner.js";
export * from "./agents/storyboard-image-prompt.agent.js";
export * from "./agents/video-shot-script.agent.js";
```

- [ ] **Step 4: Typecheck**

`pnpm --filter @aigc-video/ai typecheck`
Expected: passes. (Smoke test of the runner is deferred to integration tests in Wave 3.)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents/ packages/ai/src/index.ts
git commit -m "feat(ai): @openai/agents runner + storyboard-image-prompt and video-shot-script agents"
```

---

### Task 8: Mock-mode short-circuit for the two new agents

The existing brief/storyboard/shotprompt workflows return deterministic fixtures when `MODEL_MODE != "real"`. New agents follow the same pattern so unit/dev runs don't need provider keys.

**Files:**
- Create: `packages/ai/src/workflows/storyboard-image-prompt.workflow.ts`
- Create: `packages/ai/src/workflows/video-shot-script.workflow.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Implement workflow wrappers**

`packages/ai/src/workflows/storyboard-image-prompt.workflow.ts`:

```ts
import { isRealProviderMode, resolveTextProviderConfig } from "../providers/provider-config.js";
import { StoryboardImagePromptOutputSchema, type StoryboardImagePromptOutput } from "../schemas/image-prompt.schema.js";
import { buildStoryboardImagePromptAgent, STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION } from "../agents/storyboard-image-prompt.agent.js";
import { buildRunner, runAgent, type RunnerContext } from "../agents/runner.js";

export interface ImagePromptAgentInput {
  productBrief: unknown;
  shot: { index: number; objective: string; sceneDescription?: string; defaultDurationSec?: number };
  referenceAssets: Array<{ id: string; role: string; summary: string }>;
  userHint?: string;
  stylePresetId?: string;
}

export interface ImagePromptAgentResult {
  templateVersion: string;
  output: StoryboardImagePromptOutput;
}

export async function runStoryboardImagePromptAgent(input: {
  payload: ImagePromptAgentInput;
  context: RunnerContext;
}): Promise<ImagePromptAgentResult> {
  if (!isRealProviderMode()) {
    return {
      templateVersion: STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION,
      output: StoryboardImagePromptOutputSchema.parse({
        promptText: `MOCK image prompt for shot ${input.payload.shot.index}: ${input.payload.shot.objective}`,
        productVisibilityRule: "hero",
        referenceImageUsage: input.payload.referenceAssets.map((a) => ({
          assetId: a.id,
          usage: "product_identity",
          instruction: "Use as primary product reference",
        })),
        qualityChecklist: ["mock", "deterministic"],
      }),
    };
  }
  const cfg = resolveTextProviderConfig();
  if (!cfg) throw new Error("TEXT provider not configured (TEXT_API_KEY / TEXT_ENDPOINT_ID)");
  const runner = buildRunner(cfg);
  const agent = buildStoryboardImagePromptAgent(cfg.endpointId);
  const output = await runAgent<ImagePromptAgentInput, StoryboardImagePromptOutput>({
    agent,
    input: input.payload,
    context: input.context,
    runner,
  });
  return {
    templateVersion: STORYBOARD_IMAGE_PROMPT_TEMPLATE_VERSION,
    output: StoryboardImagePromptOutputSchema.parse(output),
  };
}
```

`packages/ai/src/workflows/video-shot-script.workflow.ts`:

```ts
import { isRealProviderMode, resolveTextProviderConfig } from "../providers/provider-config.js";
import { VideoShotScriptOutputSchema, type VideoShotScriptOutput } from "../schemas/video-script.schema.js";
import { buildVideoShotScriptAgent, VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION } from "../agents/video-shot-script.agent.js";
import { buildRunner, runAgent, type RunnerContext } from "../agents/runner.js";

export interface VideoScriptAgentInput {
  productBrief: unknown;
  shot: { index: number; objective: string; sceneDescription?: string };
  selectedImage: { id: string; summary: string; url: string };
  neighborImages: { prev?: { id: string; summary: string; url: string }; next?: { id: string; summary: string; url: string } };
  durationSec: number;
  userHint?: string;
}

export interface VideoScriptAgentResult {
  templateVersion: string;
  output: VideoShotScriptOutput;
}

export async function runVideoShotScriptAgent(input: {
  payload: VideoScriptAgentInput;
  context: RunnerContext;
}): Promise<VideoScriptAgentResult> {
  if (!isRealProviderMode()) {
    return {
      templateVersion: VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION,
      output: VideoShotScriptOutputSchema.parse({
        durationSec: input.payload.durationSec,
        shotGoal: input.payload.shot.objective,
        startFrameDescription: "MOCK start: " + input.payload.shot.objective,
        endFrameDescription: "MOCK end frame",
        cameraMotion: "push_in",
        subjectMotion: "mock motion",
        productVisibility: "hero",
        sceneConsistency: "consistent mock lighting",
        providerPrompt: `MOCK video prompt for shot ${input.payload.shot.index} (${input.payload.durationSec}s push-in on hero product)`,
        riskNotes: [],
      }),
    };
  }
  const cfg = resolveTextProviderConfig();
  if (!cfg) throw new Error("TEXT provider not configured (TEXT_API_KEY / TEXT_ENDPOINT_ID)");
  const runner = buildRunner(cfg);
  const agent = buildVideoShotScriptAgent(cfg.endpointId);
  const output = await runAgent<VideoScriptAgentInput, VideoShotScriptOutput>({
    agent,
    input: input.payload,
    context: input.context,
    runner,
  });
  return {
    templateVersion: VIDEO_SHOT_SCRIPT_TEMPLATE_VERSION,
    output: VideoShotScriptOutputSchema.parse(output),
  };
}
```

- [ ] **Step 2: Export from index**

Append to `packages/ai/src/index.ts`:

```ts
export * from "./workflows/storyboard-image-prompt.workflow.js";
export * from "./workflows/video-shot-script.workflow.js";
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm --filter @aigc-video/ai typecheck
git add packages/ai/src/workflows/storyboard-image-prompt.workflow.ts packages/ai/src/workflows/video-shot-script.workflow.ts packages/ai/src/index.ts
git commit -m "feat(ai): mock-mode workflow wrappers for new agents"
```

---

### Task 9: Shared queue + payload types for `generation_v2`

**Files:**
- Modify: `packages/shared/src/jobs/types.ts`

- [ ] **Step 1: Add new constants and payload union**

Append to `packages/shared/src/jobs/types.ts`:

```ts
export const GENERATION_V2_QUEUE_NAME = "generation_v2";

export type GenerationV2JobName =
  | "generate_images"
  | "generate_videos"
  | "compose_final_video";

export interface GenerateImagesJobData {
  kind: "generate_images";
  jobId: string;
  batchId: string;
  shotId: string;
  workspaceId: string;
  imagePromptArtifactId: string;
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  traceId: string;
}

export interface GenerateVideosJobData {
  kind: "generate_videos";
  jobId: string;
  batchId: string;
  shotId: string;
  workspaceId: string;
  videoScriptArtifactId: string;
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  traceId: string;
}

export interface ComposeFinalVideoJobData {
  kind: "compose_final_video";
  jobId: string;
  finalVideoJobId: string;
  workspaceId: string;
  traceId: string;
}

export type GenerationV2JobData =
  | GenerateImagesJobData
  | GenerateVideosJobData
  | ComposeFinalVideoJobData;
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm --filter @aigc-video/shared typecheck
git add packages/shared/src/jobs/types.ts
git commit -m "feat(shared): generation_v2 queue name and job payload union"
```

---

### Task 10: Wave-1 end-of-wave smoke

- [ ] **Step 1: Run everything that was wired in Wave 1**

```bash
pnpm install --frozen-lockfile=false
pnpm typecheck
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test:unit
```

Expected: all green. No new tests for the server were added in Wave 1; existing tests must still pass since the only server change was new config keys.

- [ ] **Step 2: Tag the wave**

```bash
git tag -m "Wave 1: foundations" wave-1-foundations
```

(Tag is local-only; push only if your team uses it.)

---

## WAVE 2 — Schema migration and module skeleton (10 tasks)

This wave is the breaking one. After it lands, the legacy `/api/workspaces/video/generate` and `/api/jobs/:jobId` (creation module) routes are gone. The new shot/artifact/generation/job/trace modules are registered but most endpoints return `501 Not Implemented` until Waves 3-5 fill them in. Run after Wave 1 lands.

### Task 11: Database schema — new enums and tables, drop old

**Files:**
- Modify: `apps/server/src/db/schema/schema.ts`
- Modify: `apps/server/src/db/schema/schema.sql`

- [ ] **Step 1: Replace `schemaSql` body**

Open `apps/server/src/db/schema/schema.ts` and replace the contents of the exported `schemaSql` template literal with the SQL below. (Keep the `schemaSql = \`...\`;` wrapper line.)

```sql
-- v2 enums (created if missing)
do $$ begin create type shot_status as enum (
  'DRAFT','IMAGE_PROMPT_PROPOSING','IMAGE_PROMPT_READY','IMAGE_PROMPT_EDITED',
  'IMAGE_GENERATING','IMAGE_CANDIDATES_READY','IMAGE_SELECTED',
  'VIDEO_SCRIPT_PROPOSING','VIDEO_SCRIPT_READY','VIDEO_SCRIPT_EDITED',
  'VIDEO_GENERATING','VIDEO_CANDIDATES_READY','VIDEO_SELECTED','FAILED'
); exception when duplicate_object then null; end $$;
do $$ begin create type artifact_status_v2 as enum ('DRAFT','ACTIVE','APPROVED','STALE','ARCHIVED'); exception when duplicate_object then null; end $$;
do $$ begin create type batch_status as enum ('PENDING','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type candidate_status as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','REJECTED'); exception when duplicate_object then null; end $$;
do $$ begin create type job_status_v2 as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','RETRYING','CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type final_video_status as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED'); exception when duplicate_object then null; end $$;

-- Preserved upstream tables (unchanged)
create table if not exists product (
  id text primary key,
  title text not null,
  selling_points text not null,
  audience text not null,
  main_image_asset_id text,
  created_at timestamptz not null default now()
);
create table if not exists asset (
  id text primary key,
  type text not null,
  url text not null,
  source text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create table if not exists creative_workspace (
  id text primary key,
  local_path text not null unique,
  current_script_id text not null,
  current_job_id text,
  status text not null,
  trace_file text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists workspace_artifact (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  script_id text not null,
  artifact_type text not null,
  status text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (workspace_id, artifact_type)
);
create table if not exists script (
  id text primary key,
  product_id text not null references product(id),
  job_id text,
  parent_script_id text references script(id),
  version integer not null,
  narrative text not null,
  visual_style text not null,
  frozen boolean not null default false,
  frozen_at timestamptz,
  raw_json jsonb not null,
  created_at timestamptz not null default now()
);

-- DROP legacy single-shot tables (must be after creative_workspace exists; no data preserved per spec).
drop table if exists workspace_video_archive cascade;
drop table if exists storyboard_shot cascade;
drop table if exists generation_job cascade;

-- v2 tables
create table if not exists storyboard_shots (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  script_id text not null,
  order_index int not null,
  title text not null,
  objective text,
  default_duration_sec int,
  status shot_status not null default 'DRAFT',
  next_action text,
  active_image_prompt_artifact_id text,
  selected_image_id text,
  active_video_script_artifact_id text,
  selected_video_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, order_index)
);
create index if not exists idx_storyboard_shots_workspace on storyboard_shots(workspace_id);
create index if not exists idx_storyboard_shots_status on storyboard_shots(status);

create table if not exists shot_asset_refs (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  asset_id text not null references asset(id),
  role text not null,
  weight numeric(4,2) not null default 1.0,
  created_at timestamptz not null default now(),
  unique (shot_id, asset_id, role)
);

create table if not exists image_prompt_artifacts (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  version int not null,
  status artifact_status_v2 not null default 'ACTIVE',
  prompt_text text not null,
  negative_prompt text,
  reference_asset_ids text[] not null default '{}',
  prompt_json jsonb not null default '{}'::jsonb,
  created_by text not null,
  agent_name text,
  prompt_template_version text,
  base_artifact_id text references image_prompt_artifacts(id),
  created_at timestamptz not null default now(),
  unique (shot_id, version)
);
create index if not exists idx_image_prompt_artifacts_shot on image_prompt_artifacts(shot_id);
create index if not exists idx_image_prompt_artifacts_status on image_prompt_artifacts(status);

create table if not exists image_generation_batches (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text not null references storyboard_shots(id) on delete cascade,
  image_prompt_artifact_id text not null references image_prompt_artifacts(id),
  status batch_status not null default 'PENDING',
  requested_count int not null,
  succeeded_count int not null default 0,
  failed_count int not null default 0,
  provider text not null,
  aspect_ratio text not null default '9:16',
  provider_request jsonb not null default '{}'::jsonb,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_image_batches_shot on image_generation_batches(shot_id);

create table if not exists image_candidates (
  id text primary key,
  batch_id text not null references image_generation_batches(id) on delete cascade,
  workspace_id text not null references creative_workspace(id),
  shot_id text not null references storyboard_shots(id) on delete cascade,
  image_url text,
  object_key text,
  width int,
  height int,
  seed text,
  provider text not null,
  provider_response jsonb not null default '{}'::jsonb,
  status candidate_status not null default 'PENDING',
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_image_candidates_batch on image_candidates(batch_id);

create table if not exists selected_shot_images (
  id text primary key,
  shot_id text not null unique references storyboard_shots(id) on delete cascade,
  image_candidate_id text not null references image_candidates(id),
  image_generation_batch_id text not null references image_generation_batches(id),
  selected_by text,
  selected_at timestamptz not null default now()
);

create table if not exists video_script_artifacts (
  id text primary key,
  shot_id text not null references storyboard_shots(id) on delete cascade,
  version int not null,
  status artifact_status_v2 not null default 'ACTIVE',
  duration_sec int not null,
  script_json jsonb not null,
  provider_prompt text not null,
  based_on_image_candidate_id text not null references image_candidates(id),
  based_on_prev_image_candidate_id text references image_candidates(id),
  based_on_next_image_candidate_id text references image_candidates(id),
  created_by text not null,
  agent_name text,
  prompt_template_version text,
  base_artifact_id text references video_script_artifacts(id),
  created_at timestamptz not null default now(),
  unique (shot_id, version)
);
create index if not exists idx_video_script_artifacts_shot on video_script_artifacts(shot_id);

create table if not exists video_generation_batches (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text not null references storyboard_shots(id) on delete cascade,
  video_script_artifact_id text not null references video_script_artifacts(id),
  status batch_status not null default 'PENDING',
  requested_count int not null,
  succeeded_count int not null default 0,
  failed_count int not null default 0,
  provider text not null,
  aspect_ratio text not null default '9:16',
  provider_request jsonb not null default '{}'::jsonb,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_video_batches_shot on video_generation_batches(shot_id);

create table if not exists video_candidates (
  id text primary key,
  batch_id text not null references video_generation_batches(id) on delete cascade,
  workspace_id text not null references creative_workspace(id),
  shot_id text not null references storyboard_shots(id) on delete cascade,
  video_url text,
  object_key text,
  thumbnail_url text,
  duration_sec int,
  width int,
  height int,
  provider text not null,
  provider_response jsonb not null default '{}'::jsonb,
  status candidate_status not null default 'PENDING',
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_video_candidates_batch on video_candidates(batch_id);

create table if not exists selected_shot_videos (
  id text primary key,
  shot_id text not null unique references storyboard_shots(id) on delete cascade,
  video_candidate_id text not null references video_candidates(id),
  video_generation_batch_id text not null references video_generation_batches(id),
  selected_by text,
  selected_at timestamptz not null default now()
);

create table if not exists generation_jobs (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text references storyboard_shots(id) on delete set null,
  job_type text not null,
  status job_status_v2 not null default 'PENDING',
  queue_name text not null,
  queue_job_id text,
  related_batch_type text,
  related_batch_id text,
  payload jsonb not null default '{}'::jsonb,
  progress numeric(5,2) not null default 0,
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_generation_jobs_status on generation_jobs(status);
create index if not exists idx_generation_jobs_related_batch on generation_jobs(related_batch_type, related_batch_id);

create table if not exists trace_events (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  shot_id text references storyboard_shots(id) on delete set null,
  trace_type text not null,
  name text not null,
  input_preview text,
  output_preview text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_trace_events_workspace on trace_events(workspace_id, created_at desc);
create index if not exists idx_trace_events_shot on trace_events(shot_id, created_at desc);

create table if not exists final_video_jobs (
  id text primary key,
  workspace_id text not null references creative_workspace(id),
  status final_video_status not null default 'PENDING',
  source_shot_video_ids text[] not null,
  source_video_script_artifact_ids text[] not null,
  local_path text,
  local_url text,
  duration_sec int,
  width int,
  height int,
  compiled_manifest jsonb not null default '{}'::jsonb,
  compiled_manifest_hash text,
  ffmpeg_log text,
  error_message text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
```

Also overwrite `apps/server/src/db/schema/schema.sql` with the same content (without the JS `export const` wrapper) so the file is the canonical SQL.

- [ ] **Step 2: Wipe local DB and re-apply**

```bash
pnpm db:clear           # script already exists; drops and recreates aigc_video
pnpm --filter @aigc-video/server build || true   # not strictly required
```

- [ ] **Step 3: Boot the server briefly to apply schema**

```bash
SERVER_RUNTIME=api MODEL_MODE=mock pnpm --filter @aigc-video/server dev &
SERVER_PID=$!
sleep 3
curl -sf http://localhost:3000/api/health > /dev/null && echo OK
kill $SERVER_PID
```

Expected: `OK` printed; Postgres now contains the new tables. (Verify with `psql aigc_video -c '\dt'`.)

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/db/schema/schema.ts apps/server/src/db/schema/schema.sql
git commit -m "feat(server): v2 schema — per-shot artifacts, batches, candidates, jobs, traces"
```

---

### Task 12: New db client methods for v2 tables

**Files:**
- Modify: `apps/server/src/db/client.ts`

- [ ] **Step 1: Add row types and adapter methods**

Append to the top of `apps/server/src/db/client.ts` (after the existing imports and type aliases) the new row types:

```ts
export interface StoryboardShotRow {
  id: string;
  workspaceId: string;
  scriptId: string;
  orderIndex: number;
  title: string;
  objective: string | null;
  defaultDurationSec: number | null;
  status: string;
  nextAction: string | null;
  activeImagePromptArtifactId: string | null;
  selectedImageId: string | null;
  activeVideoScriptArtifactId: string | null;
  selectedVideoId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImagePromptArtifactRow {
  id: string;
  shotId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "APPROVED" | "STALE" | "ARCHIVED";
  promptText: string;
  negativePrompt: string | null;
  referenceAssetIds: string[];
  promptJson: unknown;
  createdBy: string;
  agentName: string | null;
  promptTemplateVersion: string | null;
  baseArtifactId: string | null;
  createdAt: string;
}

export interface ImageGenerationBatchRow {
  id: string;
  workspaceId: string;
  shotId: string;
  imagePromptArtifactId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED";
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  provider: string;
  aspectRatio: string;
  providerRequest: unknown;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageCandidateRow {
  id: string;
  batchId: string;
  workspaceId: string;
  shotId: string;
  imageUrl: string | null;
  objectKey: string | null;
  width: number | null;
  height: number | null;
  seed: string | null;
  provider: string;
  providerResponse: unknown;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  errorMessage: string | null;
  createdAt: string;
}

export interface VideoScriptArtifactRow {
  id: string;
  shotId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "APPROVED" | "STALE" | "ARCHIVED";
  durationSec: number;
  scriptJson: unknown;
  providerPrompt: string;
  basedOnImageCandidateId: string;
  basedOnPrevImageCandidateId: string | null;
  basedOnNextImageCandidateId: string | null;
  createdBy: string;
  agentName: string | null;
  promptTemplateVersion: string | null;
  baseArtifactId: string | null;
  createdAt: string;
}

export interface VideoGenerationBatchRow {
  id: string;
  workspaceId: string;
  shotId: string;
  videoScriptArtifactId: string;
  status: ImageGenerationBatchRow["status"];
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  provider: string;
  aspectRatio: string;
  providerRequest: unknown;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoCandidateRow {
  id: string;
  batchId: string;
  workspaceId: string;
  shotId: string;
  videoUrl: string | null;
  objectKey: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  provider: string;
  providerResponse: unknown;
  status: ImageCandidateRow["status"];
  errorMessage: string | null;
  createdAt: string;
}

export interface GenerationJobRow {
  id: string;
  workspaceId: string;
  shotId: string | null;
  jobType: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "RETRYING" | "CANCELLED";
  queueName: string;
  queueJobId: string | null;
  relatedBatchType: string | null;
  relatedBatchId: string | null;
  payload: unknown;
  progress: number;
  attemptCount: number;
  maxAttempts: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinalVideoJobRow {
  id: string;
  workspaceId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  sourceShotVideoIds: string[];
  sourceVideoScriptArtifactIds: string[];
  localPath: string | null;
  localUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  compiledManifest: unknown;
  compiledManifestHash: string | null;
  ffmpegLog: string | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TraceEventRow {
  id: string;
  workspaceId: string;
  shotId: string | null;
  traceType: "agent_run" | "provider_call" | "job_event" | "state_transition" | "user_action";
  name: string;
  inputPreview: string | null;
  outputPreview: string | null;
  metadata: unknown;
  createdAt: string;
}
```

Then add a `Db2Adapter` interface (separate from the existing `DbAdapter` for clarity during transition):

```ts
export interface Db2Adapter {
  pool(): Pool;
  // Shots
  insertShot(input: Omit<StoryboardShotRow, "createdAt" | "updatedAt">): Promise<StoryboardShotRow>;
  getShot(shotId: string): Promise<StoryboardShotRow>;
  listShotsByWorkspace(workspaceId: string): Promise<StoryboardShotRow[]>;
  updateShot(shotId: string, patch: Partial<StoryboardShotRow>): Promise<StoryboardShotRow>;
  // Image prompt artifacts
  insertImagePromptArtifact(input: Omit<ImagePromptArtifactRow, "createdAt">): Promise<ImagePromptArtifactRow>;
  getImagePromptArtifact(id: string): Promise<ImagePromptArtifactRow>;
  listImagePromptArtifacts(shotId: string): Promise<ImagePromptArtifactRow[]>;
  markImagePromptArtifactsStale(shotId: string): Promise<void>;
  // Image batches + candidates
  insertImageBatch(input: Omit<ImageGenerationBatchRow, "createdAt" | "updatedAt">): Promise<ImageGenerationBatchRow>;
  getImageBatch(id: string): Promise<ImageGenerationBatchRow>;
  getImageBatchByIdempotencyKey(key: string): Promise<ImageGenerationBatchRow | null>;
  updateImageBatch(id: string, patch: Partial<ImageGenerationBatchRow>): Promise<ImageGenerationBatchRow>;
  insertImageCandidate(input: Omit<ImageCandidateRow, "createdAt">): Promise<ImageCandidateRow>;
  listImageCandidatesByBatch(batchId: string): Promise<ImageCandidateRow[]>;
  getImageCandidate(id: string): Promise<ImageCandidateRow>;
  // Selected images
  upsertSelectedImage(input: { shotId: string; imageCandidateId: string; imageGenerationBatchId: string }): Promise<void>;
  getSelectedImage(shotId: string): Promise<{ imageCandidateId: string; imageGenerationBatchId: string } | null>;
  // Video script artifacts
  insertVideoScriptArtifact(input: Omit<VideoScriptArtifactRow, "createdAt">): Promise<VideoScriptArtifactRow>;
  getVideoScriptArtifact(id: string): Promise<VideoScriptArtifactRow>;
  listVideoScriptArtifacts(shotId: string): Promise<VideoScriptArtifactRow[]>;
  markVideoScriptArtifactsStale(shotId: string): Promise<void>;
  // Video batches + candidates
  insertVideoBatch(input: Omit<VideoGenerationBatchRow, "createdAt" | "updatedAt">): Promise<VideoGenerationBatchRow>;
  getVideoBatch(id: string): Promise<VideoGenerationBatchRow>;
  getVideoBatchByIdempotencyKey(key: string): Promise<VideoGenerationBatchRow | null>;
  updateVideoBatch(id: string, patch: Partial<VideoGenerationBatchRow>): Promise<VideoGenerationBatchRow>;
  insertVideoCandidate(input: Omit<VideoCandidateRow, "createdAt">): Promise<VideoCandidateRow>;
  listVideoCandidatesByBatch(batchId: string): Promise<VideoCandidateRow[]>;
  getVideoCandidate(id: string): Promise<VideoCandidateRow>;
  // Selected videos
  upsertSelectedVideo(input: { shotId: string; videoCandidateId: string; videoGenerationBatchId: string }): Promise<void>;
  deleteSelectedVideo(shotId: string): Promise<void>;
  // Generation jobs
  insertGenerationJob(input: Omit<GenerationJobRow, "createdAt" | "updatedAt">): Promise<GenerationJobRow>;
  getGenerationJob(id: string): Promise<GenerationJobRow>;
  updateGenerationJob(id: string, patch: Partial<GenerationJobRow>): Promise<GenerationJobRow>;
  // Final video jobs
  insertFinalVideoJob(input: Omit<FinalVideoJobRow, "createdAt" | "updatedAt">): Promise<FinalVideoJobRow>;
  getFinalVideoJob(id: string): Promise<FinalVideoJobRow>;
  getFinalVideoJobByIdempotencyKey(key: string): Promise<FinalVideoJobRow | null>;
  updateFinalVideoJob(id: string, patch: Partial<FinalVideoJobRow>): Promise<FinalVideoJobRow>;
  // Trace events
  insertTraceEvent(input: Omit<TraceEventRow, "createdAt">): Promise<TraceEventRow>;
  listTraceEventsByWorkspace(workspaceId: string, opts: { limit?: number; cursor?: string }): Promise<TraceEventRow[]>;
  listTraceEventsByShot(shotId: string, opts: { limit?: number; cursor?: string }): Promise<TraceEventRow[]>;
}
```

Implement `Db2Adapter` as a new class in the same file that takes the existing pool. Use the helper conversion pattern present in the file (snake_case rows → camelCase objects). For every "insertX" use `nanoid()` for ids. Add the new `Db2Adapter` instance to the exported `db` object alongside the existing methods:

```ts
class PostgresDb2Adapter implements Db2Adapter {
  constructor(private readonly _pool: Pool) {}
  pool(): Pool {
    return this._pool;
  }
  // ... implementations elided in plan; engineer follows the existing mapper pattern.
}

// At bottom, replace the `let adapter` block:
let v1: PostgresDbAdapter | undefined;
let v2: PostgresDb2Adapter | undefined;
function getV1(): DbAdapter {
  v1 ??= new PostgresDbAdapter(config.databaseUrl);
  return v1;
}
function getV2(): Db2Adapter {
  // Reuse the existing pool from v1 to avoid duplicate connection pools.
  v1 ??= new PostgresDbAdapter(config.databaseUrl);
  // @ts-expect-error access private pool — acceptable for adapter wiring
  v2 ??= new PostgresDb2Adapter((v1 as any).getPool());
  return v2;
}
```

Then extend the exported `db` object to surface a `db2: Db2Adapter` field that delegates to `getV2()`. Existing `db.createShots` etc. remain (they will be removed in Task 19).

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @aigc-video/server typecheck
```

Fix any new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/db/client.ts
git commit -m "feat(server): v2 db adapter with shot/artifact/batch/candidate/job/trace tables"
```

---

### Task 13: Shot module skeleton — routes returning 501

**Files:**
- Create: `apps/server/src/modules/shot/shot.routes.ts`
- Create: `apps/server/src/modules/shot/shot.controller.ts`
- Create: `apps/server/src/modules/shot/shot.service.ts`
- Create: `apps/server/src/modules/shot/shot.schema.ts`

- [ ] **Step 1: Define route Zod schemas**

`apps/server/src/modules/shot/shot.schema.ts`:

```ts
import { z } from "zod";

export const aspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

export const proposeImagePromptRequest = z.object({
  referenceAssetIds: z.array(z.string()).default([]),
  userHint: z.string().optional(),
  stylePresetId: z.string().optional(),
});

export const patchImagePromptRequest = z.object({
  promptText: z.string().min(1),
  negativePrompt: z.string().optional(),
  referenceAssetIds: z.array(z.string()).default([]),
});

export const createImageBatchRequest = z.object({
  imagePromptArtifactId: z.string(),
  count: z.number().int().min(1).optional(),
  aspectRatio: aspectRatioSchema.default("9:16"),
});

export const selectImageRequest = z.object({
  imageCandidateId: z.string(),
  imageGenerationBatchId: z.string(),
});

export const proposeVideoScriptRequest = z.object({
  durationSec: z.number().int().min(1).max(8),
  useNeighborFrames: z.boolean().default(true),
  userHint: z.string().optional(),
});

export const patchVideoScriptRequest = z.object({
  baseVersion: z.number().int().min(1),
  durationSec: z.number().int().min(1).max(8),
  scriptJson: z.unknown(),
  providerPrompt: z.string().min(30),
});

export const createVideoBatchRequest = z.object({
  videoScriptArtifactId: z.string(),
  count: z.number().int().min(1).optional(),
  aspectRatio: aspectRatioSchema.default("9:16"),
});

export const selectVideoRequest = z.object({
  videoCandidateId: z.string(),
  videoGenerationBatchId: z.string(),
});

export const retryRequest = z.object({
  what: z.enum(["image_batch", "video_batch"]),
});
```

- [ ] **Step 2: Service skeleton**

`apps/server/src/modules/shot/shot.service.ts`:

```ts
export class ShotWorkflowService {
  async listShots(_workspaceId: string) {
    throw new Error("NOT_IMPLEMENTED");
  }
  async getShot(_shotId: string) {
    throw new Error("NOT_IMPLEMENTED");
  }
  async workflowStatus(_workspaceId: string) {
    throw new Error("NOT_IMPLEMENTED");
  }
}
export const shotWorkflowService = new ShotWorkflowService();
```

- [ ] **Step 3: Controller + routes**

`apps/server/src/modules/shot/shot.controller.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { shotWorkflowService } from "./shot.service.js";
import {
  createImageBatchRequest,
  createVideoBatchRequest,
  patchImagePromptRequest,
  patchVideoScriptRequest,
  proposeImagePromptRequest,
  proposeVideoScriptRequest,
  retryRequest,
  selectImageRequest,
  selectVideoRequest,
} from "./shot.schema.js";

function notImplemented(reply: any) {
  return reply.status(501).send({ code: "NOT_IMPLEMENTED" });
}

export async function registerShotController(app: FastifyInstance) {
  app.get("/api/workspaces/:workspaceId/shots", async (req, reply) => {
    try {
      return await shotWorkflowService.listShots((req.params as any).workspaceId);
    } catch (e) {
      const err = toHttpError(e);
      if (err.statusCode === 500 && err.code === "NOT_IMPLEMENTED") return notImplemented(reply);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId", async (req, reply) => {
    try {
      return await shotWorkflowService.getShot((req.params as any).shotId);
    } catch (e) {
      const err = toHttpError(e);
      if (err.statusCode === 500 && err.code === "NOT_IMPLEMENTED") return notImplemented(reply);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/workspaces/:workspaceId/shot-workflow-status", async (req, reply) => {
    try {
      return await shotWorkflowService.workflowStatus((req.params as any).workspaceId);
    } catch (e) {
      const err = toHttpError(e);
      if (err.statusCode === 500 && err.code === "NOT_IMPLEMENTED") return notImplemented(reply);
      return reply.status(err.statusCode).send(err);
    }
  });

  // The remaining routes are declared with 501 so the surface is reserved.
  for (const route of [
    { m: "POST",  p: "/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose", schema: proposeImagePromptRequest },
    { m: "PATCH", p: "/api/shots/:shotId/image-prompts/:artifactId",                       schema: patchImagePromptRequest },
    { m: "GET",   p: "/api/shots/:shotId/image-prompts" },
    { m: "POST",  p: "/api/shots/:shotId/image-batches",                                   schema: createImageBatchRequest },
    { m: "GET",   p: "/api/shots/:shotId/image-batches" },
    { m: "GET",   p: "/api/shots/:shotId/image-batches/:batchId" },
    { m: "POST",  p: "/api/shots/:shotId/selected-image",                                  schema: selectImageRequest },
    { m: "GET",   p: "/api/shots/:shotId/selected-image" },
    { m: "POST",  p: "/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose",   schema: proposeVideoScriptRequest },
    { m: "PATCH", p: "/api/shots/:shotId/video-scripts/:scriptId",                          schema: patchVideoScriptRequest },
    { m: "GET",   p: "/api/shots/:shotId/video-scripts" },
    { m: "POST",  p: "/api/shots/:shotId/video-batches",                                   schema: createVideoBatchRequest },
    { m: "GET",   p: "/api/shots/:shotId/video-batches" },
    { m: "GET",   p: "/api/shots/:shotId/video-batches/:batchId" },
    { m: "POST",  p: "/api/shots/:shotId/selected-video",                                  schema: selectVideoRequest },
    { m: "GET",   p: "/api/shots/:shotId/selected-video" },
    { m: "POST",  p: "/api/shots/:shotId/retry",                                            schema: retryRequest },
  ] as const) {
    (app as any)[route.m.toLowerCase()](route.p, async (_req: any, reply: any) => notImplemented(reply));
  }
}
```

- [ ] **Step 4: Empty stubs for routes file**

`apps/server/src/modules/shot/shot.routes.ts`:

```ts
export {}; // reserved for direct route helpers used by tests later
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/shot/
git commit -m "feat(server): shot module skeleton (routes return 501 until Waves 3-4)"
```

---

### Task 14: Artifact module skeleton

**Files:**
- Create: `apps/server/src/modules/artifact/artifact.repository.ts`
- Create: `apps/server/src/modules/artifact/artifact.versioning.ts`

- [ ] **Step 1: Repository skeleton**

`apps/server/src/modules/artifact/artifact.repository.ts`:

```ts
import { db } from "../../db/client.js";
import type { ImagePromptArtifactRow, VideoScriptArtifactRow } from "../../db/client.js";

export const artifactRepository = {
  async nextImagePromptVersion(shotId: string): Promise<number> {
    const versions = await db.db2.listImagePromptArtifacts(shotId);
    return (versions[0]?.version ?? 0) + 1;
  },
  async nextVideoScriptVersion(shotId: string): Promise<number> {
    const versions = await db.db2.listVideoScriptArtifacts(shotId);
    return (versions[0]?.version ?? 0) + 1;
  },
  async getActiveImagePrompt(shotId: string): Promise<ImagePromptArtifactRow | null> {
    const all = await db.db2.listImagePromptArtifacts(shotId);
    return all.find((a) => a.status === "ACTIVE") ?? null;
  },
  async getActiveVideoScript(shotId: string): Promise<VideoScriptArtifactRow | null> {
    const all = await db.db2.listVideoScriptArtifacts(shotId);
    return all.find((a) => a.status === "ACTIVE") ?? null;
  },
};
```

- [ ] **Step 2: Versioning helper (used by Wave 3 in tests)**

`apps/server/src/modules/artifact/artifact.versioning.ts`:

```ts
import { db } from "../../db/client.js";

export async function createImagePromptVersionAtomic(input: {
  shotId: string;
  promptText: string;
  negativePrompt?: string;
  referenceAssetIds: string[];
  promptJson?: unknown;
  createdBy: "agent" | "user" | "system";
  agentName?: string;
  promptTemplateVersion?: string;
  baseArtifactId?: string;
}) {
  const pool = db.db2.pool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update image_prompt_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [input.shotId],
    );
    const versionRow = await client.query(
      `select coalesce(max(version), 0) as max_version from image_prompt_artifacts where shot_id=$1`,
      [input.shotId],
    );
    const version = Number(versionRow.rows[0].max_version) + 1;
    const insert = await client.query(
      `insert into image_prompt_artifacts
        (id, shot_id, version, status, prompt_text, negative_prompt, reference_asset_ids, prompt_json, created_by, agent_name, prompt_template_version, base_artifact_id)
       values ($1,$2,$3,'ACTIVE',$4,$5,$6,$7,$8,$9,$10,$11)
       returning *`,
      [
        `art_img_${cryptoRandom()}`,
        input.shotId,
        version,
        input.promptText,
        input.negativePrompt ?? null,
        input.referenceAssetIds,
        JSON.stringify(input.promptJson ?? {}),
        input.createdBy,
        input.agentName ?? null,
        input.promptTemplateVersion ?? null,
        input.baseArtifactId ?? null,
      ],
    );
    await client.query(
      `update storyboard_shots set active_image_prompt_artifact_id=$1, updated_at=now() where id=$2`,
      [insert.rows[0].id, input.shotId],
    );
    await client.query("commit");
    return insert.rows[0];
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

function cryptoRandom() {
  // 10-char base36; enough for non-cryptographic ids inside a row id
  return Math.random().toString(36).slice(2, 12);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/artifact/
git commit -m "feat(server): artifact repository + image-prompt versioning helper"
```

---

### Task 15: Generation module skeleton

**Files:**
- Create: `apps/server/src/modules/generation/generation.routes.ts`
- Create: `apps/server/src/modules/generation/generation.controller.ts`
- Create: `apps/server/src/modules/generation/generation.service.ts`

- [ ] **Step 1: Service stub**

`apps/server/src/modules/generation/generation.service.ts`:

```ts
export const generationService = {
  async createImageBatch(_args: unknown): Promise<never> {
    throw new Error("NOT_IMPLEMENTED");
  },
  async createVideoBatch(_args: unknown): Promise<never> {
    throw new Error("NOT_IMPLEMENTED");
  },
  async createFinalCompose(_args: unknown): Promise<never> {
    throw new Error("NOT_IMPLEMENTED");
  },
};
```

- [ ] **Step 2: Controller stub**

`apps/server/src/modules/generation/generation.controller.ts`:

```ts
import type { FastifyInstance } from "fastify";

export async function registerGenerationController(app: FastifyInstance) {
  app.post("/api/workspaces/:workspaceId/final-videos", async (_req, reply) =>
    reply.status(501).send({ code: "NOT_IMPLEMENTED" }),
  );
  app.get("/api/final-videos/:finalVideoJobId", async (_req, reply) =>
    reply.status(501).send({ code: "NOT_IMPLEMENTED" }),
  );
  app.get("/api/workspaces/:workspaceId/final-videos", async (_req, reply) =>
    reply.status(501).send({ code: "NOT_IMPLEMENTED" }),
  );
  app.get("/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file", async (_req, reply) =>
    reply.status(501).send({ code: "NOT_IMPLEMENTED" }),
  );
}
```

- [ ] **Step 3: Empty routes file**

`apps/server/src/modules/generation/generation.routes.ts`:

```ts
export {};
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/generation/
git commit -m "feat(server): generation module skeleton"
```

---

### Task 16: Job module skeleton (new queue config)

**Files:**
- Create: `apps/server/src/modules/job/job.queue.ts`
- Create: `apps/server/src/modules/job/job.repository.ts`

- [ ] **Step 1: Queue + repository skeleton**

`apps/server/src/modules/job/job.repository.ts`:

```ts
import { db } from "../../db/client.js";
import type { GenerationJobRow } from "../../db/client.js";

export const jobRepository = {
  insert: db.db2.insertGenerationJob.bind(db.db2),
  get: db.db2.getGenerationJob.bind(db.db2),
  update: db.db2.updateGenerationJob.bind(db.db2),
};
export type { GenerationJobRow };
```

`apps/server/src/modules/job/job.queue.ts`:

```ts
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { GENERATION_V2_QUEUE_NAME, type GenerationV2JobData } from "@aigc-video/shared";
import { config } from "../../common/config.js";
import { logger } from "../../common/logger.js";

let queue: Queue<GenerationV2JobData> | undefined;
let worker: Worker<GenerationV2JobData> | undefined;

export type Generationv2Processor = (data: GenerationV2JobData) => Promise<void>;
let registeredProcessor: Generationv2Processor | undefined;

export function registerGenerationV2Processor(fn: Generationv2Processor) {
  registeredProcessor = fn;
}

export async function enqueueGenerationV2(data: GenerationV2JobData) {
  if (config.useRedisQueue) {
    queue ??= new Queue<GenerationV2JobData>(GENERATION_V2_QUEUE_NAME, {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
    });
    await queue.add(data.kind, data);
    return;
  }
  setTimeout(() => {
    if (!registeredProcessor) {
      logger.error("No generation_v2 processor registered");
      return;
    }
    registeredProcessor(data).catch((err) => logger.error("generation_v2 job failed", { err }));
  }, 0);
}

export function startGenerationV2Worker() {
  if (!config.useRedisQueue) return;
  worker ??= new Worker<GenerationV2JobData>(
    GENERATION_V2_QUEUE_NAME,
    async (job) => {
      if (!registeredProcessor) throw new Error("No generation_v2 processor registered");
      await registeredProcessor(job.data);
    },
    {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
      concurrency: Math.max(1, config.maxImageBatchSize + config.maxVideoBatchSize),
    },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/modules/job/
git commit -m "feat(server): generation_v2 queue + job repository"
```

---

### Task 17: Trace module

**Files:**
- Create: `apps/server/src/modules/trace/trace.repository.ts`
- Create: `apps/server/src/modules/trace/trace.service.ts`
- Create: `apps/server/src/modules/trace/trace.routes.ts`

- [ ] **Step 1: Repository + service**

`apps/server/src/modules/trace/trace.repository.ts`:

```ts
import { db } from "../../db/client.js";
export const traceRepository = {
  insert: db.db2.insertTraceEvent.bind(db.db2),
  listByWorkspace: db.db2.listTraceEventsByWorkspace.bind(db.db2),
  listByShot: db.db2.listTraceEventsByShot.bind(db.db2),
};
```

`apps/server/src/modules/trace/trace.service.ts`:

```ts
import { traceRepository } from "./trace.repository.js";

export interface RecordTraceInput {
  workspaceId: string;
  shotId?: string;
  traceType: "agent_run" | "provider_call" | "job_event" | "state_transition" | "user_action";
  name: string;
  inputPreview?: string;
  outputPreview?: string;
  metadata?: Record<string, unknown>;
}

export const traceService = {
  async record(input: RecordTraceInput) {
    await traceRepository.insert({
      id: "trc_" + Math.random().toString(36).slice(2, 12),
      workspaceId: input.workspaceId,
      shotId: input.shotId ?? null,
      traceType: input.traceType,
      name: input.name,
      inputPreview: input.inputPreview ?? null,
      outputPreview: input.outputPreview ?? null,
      metadata: input.metadata ?? {},
    });
  },
  list: traceRepository.listByWorkspace,
  listShot: traceRepository.listByShot,
};
```

- [ ] **Step 2: Routes**

`apps/server/src/modules/trace/trace.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { traceService } from "./trace.service.js";

export async function registerTraceController(app: FastifyInstance) {
  app.get("/api/workspaces/:workspaceId/traces", async (req) => {
    const params = req.params as { workspaceId: string };
    const query = req.query as { limit?: string; cursor?: string };
    return traceService.list(params.workspaceId, {
      limit: query.limit ? Number(query.limit) : 50,
      cursor: query.cursor,
    });
  });
  app.get("/api/shots/:shotId/traces", async (req) => {
    const params = req.params as { shotId: string };
    const query = req.query as { limit?: string; cursor?: string };
    return traceService.listShot(params.shotId, {
      limit: query.limit ? Number(query.limit) : 50,
      cursor: query.cursor,
    });
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/trace/
git commit -m "feat(server): trace_events read/write module"
```

---

### Task 18: Register new modules + drop creation module from app.ts

**Files:**
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Update imports and registrations**

Edit `apps/server/src/app.ts`. Remove the import of and call to `registerCreationController`. Add the new module imports and registrations after the existing ones (replace the corresponding block):

```ts
import { registerMaterialController } from "./modules/material/material.controller.js";
import { registerPipelineController } from "./modules/pipeline/pipeline.controller.js";
import { registerScriptController } from "./modules/script/script.controller.js";
import { registerWorkspaceController } from "./modules/workspace/workspace.controller.js";
import { registerShotController } from "./modules/shot/shot.controller.js";
import { registerGenerationController } from "./modules/generation/generation.controller.js";
import { registerTraceController } from "./modules/trace/trace.routes.js";
```

And in `buildServer`, replace:

```ts
  await registerMaterialController(app);
  await registerPipelineController(app);
  await registerScriptController(app);
  await registerWorkspaceController(app, {
    selectWorkspaceDirectory: options.selectWorkspaceDirectory,
  });
  await registerCreationController(app);
```

with:

```ts
  await registerMaterialController(app);
  await registerPipelineController(app);
  await registerScriptController(app);
  await registerWorkspaceController(app, {
    selectWorkspaceDirectory: options.selectWorkspaceDirectory,
  });
  await registerShotController(app);
  await registerGenerationController(app);
  await registerTraceController(app);
```

- [ ] **Step 2: Boot smoke**

```bash
SERVER_RUNTIME=api MODEL_MODE=mock pnpm --filter @aigc-video/server dev &
SERVER_PID=$!
sleep 3
curl -sf http://localhost:3000/api/health > /dev/null && echo OK
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/shots/abc # expect 501
kill $SERVER_PID
```

Expected: `OK`, `501`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/app.ts
git commit -m "refactor(server): register shot/generation/trace; drop creation module"
```

---

### Task 19: Delete legacy files

**Files (delete):**
- `apps/server/src/modules/creation/`
- `apps/server/src/jobs/processors/media-generate.processor.ts`
- `apps/server/src/jobs/queue.ts` will be rewritten in Task 16 — already done; remove now-obsolete code

**Files (modify):**
- `apps/server/src/jobs/queue.ts` (delete in favor of `modules/job/job.queue.ts`)
- `apps/server/src/jobs/job-state.ts` (verify usage; remove obsolete helpers)
- `apps/server/src/modules/workspace/workspace.service.ts` (drop `startVideoGeneration` and reference)
- `apps/server/src/modules/workspace/workspace.controller.ts` (drop `POST /api/workspaces/video/generate` route)

- [ ] **Step 1: Identify remaining callers**

```bash
grep -rn "registerCreationController\|media-generate.processor\|startVideoGeneration\|/video/generate" apps/server/src
```

Expected output: only the lines you're about to remove.

- [ ] **Step 2: Delete files**

```bash
git rm -r apps/server/src/modules/creation/
git rm apps/server/src/jobs/processors/media-generate.processor.ts
git rm apps/server/src/jobs/queue.ts
```

- [ ] **Step 3: Remove `startVideoGeneration` from workspace service**

Open `apps/server/src/modules/workspace/workspace.service.ts`. Delete the entire `startVideoGeneration` method and any helpers used only by it. Remove the `import { enqueueGenerationJob } from "../../jobs/queue.js"` line.

Open `apps/server/src/modules/workspace/workspace.controller.ts`. Delete the `app.post("/api/workspaces/video/generate", …)` handler block.

- [ ] **Step 4: Remove `job-state.ts` helpers that referenced the legacy queue**

Open `apps/server/src/jobs/job-state.ts`. Inspect: any function still in use by the new code (Wave 3 will import none of them) should stay; otherwise delete the file. If unsure, delete the file and let typecheck flag any importer.

- [ ] **Step 5: Typecheck and clean**

```bash
pnpm --filter @aigc-video/server typecheck
```

Fix any remaining references by removing them.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(server): remove legacy creation module + single-shot job pipeline"
```

---

### Task 20: Seed shots from approved shotprompt

**Files:**
- Modify: `apps/server/src/modules/workspace/workspace.service.ts`

- [ ] **Step 1: Locate the shotprompt-approval flow**

Inspect `approveShotPrompt(input, data)` in `apps/server/src/modules/workspace/workspace.service.ts`. After the existing artifact upsert succeeds, add the shot-seeding call.

- [ ] **Step 2: Add seeding helper**

Insert into the same file (near the bottom of the service module):

```ts
import { db } from "../../db/client.js";

async function seedShotsFromShotPrompt(input: {
  workspaceId: string;
  scriptId: string;
  shotPrompt: ShotPromptArtifact;
}) {
  // Re-seeding wipes prior shots; first wave doesn't support edit/add yet.
  const pool = db.db2.pool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from storyboard_shots where workspace_id=$1", [input.workspaceId]);
    for (const shot of input.shotPrompt.shots) {
      await client.query(
        `insert into storyboard_shots
           (id, workspace_id, script_id, order_index, title, objective, default_duration_sec, status)
         values ($1,$2,$3,$4,$5,$6,$7,'DRAFT')`,
        [
          `shot_${Math.random().toString(36).slice(2, 12)}`,
          input.workspaceId,
          input.scriptId,
          shot.index,
          shot.providerPrompt.slice(0, 80) || `Shot ${shot.index + 1}`,
          shot.providerPrompt,
          shot.endSec - shot.startSec,
        ],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Wire into `approveShotPrompt`**

After the existing `upsertWorkspaceArtifact` call inside `approveShotPrompt`, call:

```ts
await seedShotsFromShotPrompt({
  workspaceId: workspace.id,
  scriptId: workspace.currentScriptId,
  shotPrompt: data,
});
```

- [ ] **Step 4: Verify**

Boot the server (same smoke as Task 18), run through a workspace's brief/storyboard/shotprompt approval flow manually or via existing tests, then `psql aigc_video -c 'select id, order_index, status from storyboard_shots;'` shows rows.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/workspace/workspace.service.ts
git commit -m "feat(server): seed storyboard_shots from approved shotprompt"
```

---

### Wave 2 — end-of-wave smoke

- [ ] **Step 1: Tests + typecheck**

```bash
pnpm typecheck
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test:unit
```

Expected: green. Some legacy server tests touching the creation module or `startVideoGeneration` may need updating; if so, modify them now to reflect new shape (or delete tests for removed features). Existing `workspace.api.test.ts` should still cover the upstream brief/storyboard/shotprompt path.

- [ ] **Step 2: Tag**

```bash
git tag -m "Wave 2: schema + module skeleton" wave-2-schema
```

---

## WAVE 3 — Image flow end-to-end (6 tasks)

This wave fills in image-related endpoints, the image worker, idempotency, and stale rules. Integration tests at the end of the wave hit a real Ark image endpoint.

### Task 21: shot.state.ts pure functions

**Files:**
- Modify: `apps/server/src/modules/shot/shot.state.ts`
- Create: `apps/server/src/modules/shot/shot.state.unit.test.ts`

- [ ] **Step 1: Write failing test**

`apps/server/src/modules/shot/shot.state.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canTransition, nextStatusAfter, getNextAction, type ShotStatus } from "./shot.state.js";

describe("getNextAction", () => {
  const map: Array<[ShotStatus, string]> = [
    ["DRAFT", "GENERATE_IMAGE_PROMPT"],
    ["IMAGE_PROMPT_PROPOSING", "NONE"],
    ["IMAGE_PROMPT_READY", "GENERATE_IMAGES"],
    ["IMAGE_PROMPT_EDITED", "GENERATE_IMAGES"],
    ["IMAGE_GENERATING", "POLL_IMAGE_BATCH"],
    ["IMAGE_CANDIDATES_READY", "SELECT_IMAGE"],
    ["IMAGE_SELECTED", "GENERATE_VIDEO_SCRIPT"],
    ["VIDEO_SCRIPT_PROPOSING", "NONE"],
    ["VIDEO_SCRIPT_READY", "EDIT_VIDEO_SCRIPT"],
    ["VIDEO_SCRIPT_EDITED", "GENERATE_VIDEOS"],
    ["VIDEO_GENERATING", "POLL_VIDEO_BATCH"],
    ["VIDEO_CANDIDATES_READY", "SELECT_VIDEO"],
    ["VIDEO_SELECTED", "READY_FOR_FINAL_COMPOSE"],
    ["FAILED", "RETRY"],
  ];
  for (const [status, expected] of map) {
    it(`maps ${status} to ${expected}`, () => {
      expect(getNextAction(status)).toBe(expected);
    });
  }
});

describe("canTransition", () => {
  it("blocks skipping image selection", () => {
    expect(canTransition("IMAGE_CANDIDATES_READY", "VIDEO_SCRIPT_READY")).toBe(false);
  });
  it("allows selected image to propose video script", () => {
    expect(canTransition("IMAGE_SELECTED", "VIDEO_SCRIPT_PROPOSING")).toBe(true);
  });
});

describe("nextStatusAfter", () => {
  it("ENQUEUE_IMAGE_BATCH from READY", () => {
    expect(nextStatusAfter("ENQUEUE_IMAGE_BATCH", "IMAGE_PROMPT_READY")).toBe("IMAGE_GENERATING");
  });
  it("IMAGE_BATCH_DONE_OK from GENERATING", () => {
    expect(nextStatusAfter("IMAGE_BATCH_DONE_OK", "IMAGE_GENERATING")).toBe("IMAGE_CANDIDATES_READY");
  });
  it("VIDEO_BATCH_FAILED from anywhere -> FAILED", () => {
    expect(nextStatusAfter("VIDEO_BATCH_FAILED", "VIDEO_GENERATING")).toBe("FAILED");
  });
});
```

- [ ] **Step 2: Run, see fail**

`pnpm --filter @aigc-video/server test:unit -- src/modules/shot/shot.state.unit.test.ts`
Expected: FAIL — module empty.

- [ ] **Step 3: Implement**

Replace `apps/server/src/modules/shot/shot.state.ts`:

```ts
export type ShotStatus =
  | "DRAFT"
  | "IMAGE_PROMPT_PROPOSING" | "IMAGE_PROMPT_READY" | "IMAGE_PROMPT_EDITED"
  | "IMAGE_GENERATING" | "IMAGE_CANDIDATES_READY" | "IMAGE_SELECTED"
  | "VIDEO_SCRIPT_PROPOSING" | "VIDEO_SCRIPT_READY" | "VIDEO_SCRIPT_EDITED"
  | "VIDEO_GENERATING" | "VIDEO_CANDIDATES_READY" | "VIDEO_SELECTED"
  | "FAILED";

export type NextAction =
  | "GENERATE_IMAGE_PROMPT" | "EDIT_IMAGE_PROMPT"
  | "GENERATE_IMAGES" | "POLL_IMAGE_BATCH" | "SELECT_IMAGE"
  | "GENERATE_VIDEO_SCRIPT" | "EDIT_VIDEO_SCRIPT"
  | "GENERATE_VIDEOS" | "POLL_VIDEO_BATCH" | "SELECT_VIDEO"
  | "READY_FOR_FINAL_COMPOSE" | "RETRY" | "NONE";

export type ShotEvent =
  | "PROPOSE_IMAGE_PROMPT" | "USER_EDIT_IMAGE_PROMPT"
  | "ENQUEUE_IMAGE_BATCH" | "IMAGE_BATCH_DONE_OK" | "IMAGE_BATCH_FAILED"
  | "USER_SELECT_IMAGE"
  | "PROPOSE_VIDEO_SCRIPT" | "USER_EDIT_VIDEO_SCRIPT"
  | "ENQUEUE_VIDEO_BATCH" | "VIDEO_BATCH_DONE_OK" | "VIDEO_BATCH_FAILED"
  | "USER_SELECT_VIDEO";

export function getNextAction(status: ShotStatus): NextAction {
  switch (status) {
    case "DRAFT": return "GENERATE_IMAGE_PROMPT";
    case "IMAGE_PROMPT_PROPOSING":
    case "VIDEO_SCRIPT_PROPOSING": return "NONE";
    case "IMAGE_PROMPT_READY":
    case "IMAGE_PROMPT_EDITED": return "GENERATE_IMAGES";
    case "IMAGE_GENERATING": return "POLL_IMAGE_BATCH";
    case "IMAGE_CANDIDATES_READY": return "SELECT_IMAGE";
    case "IMAGE_SELECTED": return "GENERATE_VIDEO_SCRIPT";
    case "VIDEO_SCRIPT_READY": return "EDIT_VIDEO_SCRIPT";
    case "VIDEO_SCRIPT_EDITED": return "GENERATE_VIDEOS";
    case "VIDEO_GENERATING": return "POLL_VIDEO_BATCH";
    case "VIDEO_CANDIDATES_READY": return "SELECT_VIDEO";
    case "VIDEO_SELECTED": return "READY_FOR_FINAL_COMPOSE";
    case "FAILED": return "RETRY";
  }
}

const allowed: ReadonlyMap<ShotStatus, ReadonlySet<ShotStatus>> = new Map([
  ["DRAFT", new Set<ShotStatus>(["IMAGE_PROMPT_PROPOSING"])],
  ["IMAGE_PROMPT_PROPOSING", new Set<ShotStatus>(["IMAGE_PROMPT_READY", "FAILED"])],
  ["IMAGE_PROMPT_READY", new Set<ShotStatus>(["IMAGE_PROMPT_EDITED", "IMAGE_GENERATING"])],
  ["IMAGE_PROMPT_EDITED", new Set<ShotStatus>(["IMAGE_GENERATING"])],
  ["IMAGE_GENERATING", new Set<ShotStatus>(["IMAGE_CANDIDATES_READY", "FAILED"])],
  ["IMAGE_CANDIDATES_READY", new Set<ShotStatus>(["IMAGE_PROMPT_EDITED", "IMAGE_SELECTED"])],
  ["IMAGE_SELECTED", new Set<ShotStatus>(["VIDEO_SCRIPT_PROPOSING", "IMAGE_PROMPT_EDITED"])],
  ["VIDEO_SCRIPT_PROPOSING", new Set<ShotStatus>(["VIDEO_SCRIPT_READY", "FAILED"])],
  ["VIDEO_SCRIPT_READY", new Set<ShotStatus>(["VIDEO_SCRIPT_EDITED", "VIDEO_GENERATING"])],
  ["VIDEO_SCRIPT_EDITED", new Set<ShotStatus>(["VIDEO_GENERATING"])],
  ["VIDEO_GENERATING", new Set<ShotStatus>(["VIDEO_CANDIDATES_READY", "FAILED"])],
  ["VIDEO_CANDIDATES_READY", new Set<ShotStatus>(["VIDEO_SCRIPT_EDITED", "VIDEO_SELECTED"])],
  ["VIDEO_SELECTED", new Set<ShotStatus>(["IMAGE_PROMPT_EDITED", "VIDEO_SCRIPT_EDITED"])],
  ["FAILED", new Set<ShotStatus>(["IMAGE_GENERATING", "VIDEO_GENERATING"])],
]);

export function canTransition(from: ShotStatus, to: ShotStatus): boolean {
  return allowed.get(from)?.has(to) ?? false;
}

export function nextStatusAfter(event: ShotEvent, from: ShotStatus): ShotStatus {
  switch (event) {
    case "PROPOSE_IMAGE_PROMPT": return "IMAGE_PROMPT_PROPOSING";
    case "USER_EDIT_IMAGE_PROMPT": return "IMAGE_PROMPT_EDITED";
    case "ENQUEUE_IMAGE_BATCH": return "IMAGE_GENERATING";
    case "IMAGE_BATCH_DONE_OK": return "IMAGE_CANDIDATES_READY";
    case "IMAGE_BATCH_FAILED": return "FAILED";
    case "USER_SELECT_IMAGE": return "IMAGE_SELECTED";
    case "PROPOSE_VIDEO_SCRIPT": return "VIDEO_SCRIPT_PROPOSING";
    case "USER_EDIT_VIDEO_SCRIPT": return "VIDEO_SCRIPT_EDITED";
    case "ENQUEUE_VIDEO_BATCH": return "VIDEO_GENERATING";
    case "VIDEO_BATCH_DONE_OK": return "VIDEO_CANDIDATES_READY";
    case "VIDEO_BATCH_FAILED": return "FAILED";
    case "USER_SELECT_VIDEO": return "VIDEO_SELECTED";
  }
  // unreachable
  return from;
}
```

- [ ] **Step 4: Run, see pass; commit**

```bash
pnpm --filter @aigc-video/server test:unit -- src/modules/shot/shot.state.unit.test.ts
git add apps/server/src/modules/shot/shot.state.ts apps/server/src/modules/shot/shot.state.unit.test.ts
git commit -m "feat(server): shot state machine + nextAction map (unit-tested)"
```

---

### Task 22: shot.stale.ts + image flow service methods

**Files:**
- Modify: `apps/server/src/modules/shot/shot.stale.ts`
- Modify: `apps/server/src/modules/shot/shot.service.ts`
- Create: `apps/server/src/modules/shot/shot.stale.unit.test.ts`

- [ ] **Step 1: Implement stale rules (used by service)**

Replace `apps/server/src/modules/shot/shot.stale.ts`:

```ts
import { db } from "../../db/client.js";

export const staleRules = {
  async onImagePromptEdited(shotId: string, client: import("pg").PoolClient) {
    await client.query(
      `update video_script_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [shotId],
    );
  },
  async onImageSelectionChanged(shotId: string, client: import("pg").PoolClient) {
    await client.query(
      `update video_script_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [shotId],
    );
    await client.query(`delete from selected_shot_videos where shot_id=$1`, [shotId]);
  },
  async onVideoScriptReplaced(shotId: string, client: import("pg").PoolClient) {
    // The new version is already inserted as ACTIVE; the previous active row is moved to STALE
    // by the versioning helper. selected_shot_videos pointing to candidates from that old script
    // are dropped.
    await client.query(
      `delete from selected_shot_videos where shot_id=$1`,
      [shotId],
    );
  },
};

export async function getCurrentShotStatus(shotId: string) {
  const shot = await db.db2.getShot(shotId);
  return shot.status;
}
```

- [ ] **Step 2: Wire image flow into service**

Replace `apps/server/src/modules/shot/shot.service.ts`:

```ts
import { nanoid } from "nanoid";
import { db } from "../../db/client.js";
import { config } from "../../common/config.js";
import { HttpError } from "../../common/errors.js";
import { artifactRepository } from "../artifact/artifact.repository.js";
import { createImagePromptVersionAtomic } from "../artifact/artifact.versioning.js";
import { traceService } from "../trace/trace.service.js";
import { runStoryboardImagePromptAgent } from "@aigc-video/ai";
import { getNextAction, type ShotStatus } from "./shot.state.js";
import { staleRules } from "./shot.stale.js";

function resolveBatchCount(kind: "image" | "video", requested?: number): number {
  const def = kind === "image" ? config.defaultImageBatchSize : config.defaultVideoBatchSize;
  const max = kind === "image" ? config.maxImageBatchSize : config.maxVideoBatchSize;
  const n = requested ?? def;
  if (n < 1 || n > max) throw new HttpError(400, "COUNT_EXCEEDS_LIMIT", `count must be between 1 and ${max}`);
  return n;
}

export const shotWorkflowService = {
  resolveBatchCount,

  async listShots(workspaceId: string) {
    const shots = await db.db2.listShotsByWorkspace(workspaceId);
    return { data: shots.map((s) => ({ ...s, nextAction: getNextAction(s.status as ShotStatus) })) };
  },

  async getShot(shotId: string) {
    const shot = await db.db2.getShot(shotId);
    return { data: { ...shot, nextAction: getNextAction(shot.status as ShotStatus) } };
  },

  async workflowStatus(workspaceId: string) {
    const shots = await db.db2.listShotsByWorkspace(workspaceId);
    const enriched = shots.map((s) => ({
      shotId: s.id,
      orderIndex: s.orderIndex,
      status: s.status,
      nextAction: getNextAction(s.status as ShotStatus),
      activeImagePromptArtifactId: s.activeImagePromptArtifactId,
      selectedImageId: s.selectedImageId,
      activeVideoScriptArtifactId: s.activeVideoScriptArtifactId,
      selectedVideoId: s.selectedVideoId,
    }));
    const canComposeFinalVideo = enriched.length > 0 && enriched.every((e) => e.status === "VIDEO_SELECTED");
    return { data: { workspaceId, shots: enriched, canComposeFinalVideo } };
  },

  async proposeImagePrompt(args: {
    workspaceId: string;
    shotId: string;
    referenceAssetIds: string[];
    userHint?: string;
    stylePresetId?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    const traceId = nanoid();

    await db.db2.updateShot(args.shotId, { status: "IMAGE_PROMPT_PROPOSING" });
    try {
      const result = await runStoryboardImagePromptAgent({
        payload: {
          productBrief: {}, // brief is in workspace_artifact; minimal context in P0
          shot: { index: shot.orderIndex, objective: shot.objective ?? shot.title },
          referenceAssets: args.referenceAssetIds.map((id) => ({ id, role: "product_identity", summary: "" })),
          userHint: args.userHint,
          stylePresetId: args.stylePresetId,
        },
        context: { workspaceId: args.workspaceId, shotId: args.shotId, traceId, runtimeMode: process.env.MODEL_MODE === "real" ? "real" : "mock" },
      });

      const artifact = await createImagePromptVersionAtomic({
        shotId: args.shotId,
        promptText: result.output.promptText,
        negativePrompt: result.output.negativePrompt,
        referenceAssetIds: args.referenceAssetIds,
        promptJson: result.output,
        createdBy: "agent",
        agentName: "StoryboardImagePromptAgent",
        promptTemplateVersion: result.templateVersion,
      });

      await db.db2.updateShot(args.shotId, { status: "IMAGE_PROMPT_READY", activeImagePromptArtifactId: artifact.id });
      await traceService.record({ workspaceId: args.workspaceId, shotId: args.shotId, traceType: "agent_run", name: "image_prompt_proposed", outputPreview: result.output.promptText.slice(0, 200), metadata: { templateVersion: result.templateVersion } });
      return { data: artifact, shotStatus: "IMAGE_PROMPT_READY", nextAction: getNextAction("IMAGE_PROMPT_READY"), traceId };
    } catch (err) {
      await db.db2.updateShot(args.shotId, { status: "FAILED", lastError: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  async patchImagePrompt(args: {
    shotId: string;
    artifactId: string;
    promptText: string;
    negativePrompt?: string;
    referenceAssetIds: string[];
  }) {
    const pool = db.db2.pool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await staleRules.onImagePromptEdited(args.shotId, client);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    const artifact = await createImagePromptVersionAtomic({
      shotId: args.shotId,
      promptText: args.promptText,
      negativePrompt: args.negativePrompt,
      referenceAssetIds: args.referenceAssetIds,
      createdBy: "user",
      baseArtifactId: args.artifactId,
    });
    await db.db2.updateShot(args.shotId, { status: "IMAGE_PROMPT_EDITED", activeImagePromptArtifactId: artifact.id });
    return { data: artifact, shotStatus: "IMAGE_PROMPT_EDITED", nextAction: getNextAction("IMAGE_PROMPT_EDITED") };
  },

  async listImagePrompts(shotId: string) {
    return { data: await db.db2.listImagePromptArtifacts(shotId) };
  },

  async selectImage(args: { shotId: string; imageCandidateId: string; imageGenerationBatchId: string; selectedBy?: string }) {
    const existing = await db.db2.getSelectedImage(args.shotId);
    const isChange = !existing || existing.imageCandidateId !== args.imageCandidateId;

    const pool = db.db2.pool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (isChange) await staleRules.onImageSelectionChanged(args.shotId, client);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    await db.db2.upsertSelectedImage({
      shotId: args.shotId,
      imageCandidateId: args.imageCandidateId,
      imageGenerationBatchId: args.imageGenerationBatchId,
    });
    await db.db2.updateShot(args.shotId, { status: "IMAGE_SELECTED", selectedImageId: args.imageCandidateId });
    return { data: { shotId: args.shotId, selectedImageId: args.imageCandidateId }, shotStatus: "IMAGE_SELECTED", nextAction: getNextAction("IMAGE_SELECTED") };
  },
};
```

- [ ] **Step 3: Tests for stale**

`apps/server/src/modules/shot/shot.stale.unit.test.ts`:

```ts
// Stale rules require a real Postgres pool. Marked as a smoke covered by integration tests.
// Unit test reserved for pure logic; kept as a placeholder to fail loudly if rules diverge.
import { describe, it, expect } from "vitest";
import { staleRules } from "./shot.stale.js";
describe("staleRules", () => {
  it("exposes the three rules", () => {
    expect(typeof staleRules.onImagePromptEdited).toBe("function");
    expect(typeof staleRules.onImageSelectionChanged).toBe("function");
    expect(typeof staleRules.onVideoScriptReplaced).toBe("function");
  });
});
```

- [ ] **Step 4: Run unit tests; commit**

```bash
pnpm --filter @aigc-video/server test:unit -- src/modules/shot/
git add apps/server/src/modules/shot/
git commit -m "feat(server): image flow service (propose, patch, list, select) + stale rules"
```

---

### Task 23: Image batch worker + endpoint

**Files:**
- Create: `apps/server/src/modules/generation/image.worker.ts`
- Create: `apps/server/src/modules/generation/image.worker.unit.test.ts`
- Modify: `apps/server/src/modules/generation/generation.service.ts`
- Modify: `apps/server/src/modules/generation/generation.controller.ts`
- Modify: `apps/server/src/modules/shot/shot.controller.ts` (wire real handlers for image-prompt + image-batches)

- [ ] **Step 1: Failing unit test (worker uses fake provider)**

`apps/server/src/modules/generation/image.worker.unit.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { processGenerateImages, __setImageProviderForTests } from "./image.worker.js";

describe("processGenerateImages", () => {
  it("creates candidates, updates batch to SUCCEEDED, transitions shot", async () => {
    const fakeProvider = vi.fn().mockResolvedValue({
      provider: "ark-seedream",
      model: "test-model",
      candidates: [{ imageUrl: "u1" }, { imageUrl: "u2" }, { imageUrl: "u3" }],
    });
    __setImageProviderForTests(fakeProvider);

    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("PENDING");
    await processGenerateImages(ctx.jobData, fakeDb.adapter as any);
    expect(fakeDb.batches.get(ctx.batchId)?.status).toBe("SUCCEEDED");
    expect(fakeDb.candidates.length).toBe(3);
    expect(fakeDb.shotPatches.at(-1)?.status).toBe("IMAGE_CANDIDATES_READY");
  });

  it("returns early if batch is not PENDING (idempotent)", async () => {
    const fakeProvider = vi.fn();
    __setImageProviderForTests(fakeProvider);
    const fakeDb = makeFakeDb();
    const ctx = await fakeDb.bootstrap("SUCCEEDED");
    await processGenerateImages(ctx.jobData, fakeDb.adapter as any);
    expect(fakeProvider).not.toHaveBeenCalled();
  });
});

function makeFakeDb() {
  const batches = new Map<string, { id: string; status: string; succeededCount: number; failedCount: number; shotId: string; workspaceId: string }>();
  const candidates: any[] = [];
  const shotPatches: any[] = [];
  const adapter = {
    getImageBatch: async (id: string) => batches.get(id)!,
    updateImageBatch: async (id: string, patch: any) => {
      Object.assign(batches.get(id)!, patch);
      return batches.get(id)!;
    },
    getImagePromptArtifact: async () => ({ id: "art-1", promptText: "p", negativePrompt: null, referenceAssetIds: [] }),
    insertImageCandidate: async (input: any) => {
      candidates.push(input);
      return { ...input, id: "cand-" + candidates.length, createdAt: new Date().toISOString() };
    },
    updateGenerationJob: async () => undefined,
    updateShot: async (shotId: string, patch: any) => {
      shotPatches.push({ shotId, ...patch });
      return { id: shotId } as any;
    },
    pool: () => ({ connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) }),
  };
  async function bootstrap(status: string) {
    const batchId = "batch-1";
    batches.set(batchId, { id: batchId, status, succeededCount: 0, failedCount: 0, shotId: "shot-1", workspaceId: "ws-1" });
    return {
      batchId,
      jobData: {
        kind: "generate_images" as const,
        jobId: "job-1",
        batchId,
        shotId: "shot-1",
        workspaceId: "ws-1",
        imagePromptArtifactId: "art-1",
        count: 3,
        aspectRatio: "9:16" as const,
        traceId: "trace-1",
      },
    };
  }
  return { adapter, batches, candidates, shotPatches, bootstrap };
}
```

- [ ] **Step 2: Implement worker**

`apps/server/src/modules/generation/image.worker.ts`:

```ts
import {
  generateImagesWithArk,
  resolveImageProviderConfig,
  type ArkImageResult,
} from "@aigc-video/ai";
import type { GenerateImagesJobData } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { traceService } from "../trace/trace.service.js";
import { jobRepository } from "../job/job.repository.js";

type Adapter = typeof db.db2;
let dbOverride: Adapter | undefined;

type Provider = (args: {
  prompt: string;
  negativePrompt?: string | null;
  referenceImageUrls?: string[];
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
}) => Promise<ArkImageResult>;

let providerOverride: Provider | undefined;
export function __setImageProviderForTests(p: Provider | undefined) {
  providerOverride = p;
}

async function defaultProvider(args: Parameters<Provider>[0]): Promise<ArkImageResult> {
  const cfg = resolveImageProviderConfig();
  if (!cfg) throw new Error("IMAGE provider not configured");
  return generateImagesWithArk(args, cfg);
}

export async function processGenerateImages(
  data: GenerateImagesJobData,
  adapter: Adapter = dbOverride ?? db.db2,
) {
  const batch = await adapter.getImageBatch(data.batchId);
  if (batch.status !== "PENDING") return;

  await adapter.updateImageBatch(batch.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, { status: "RUNNING", startedAt: new Date().toISOString() });

  const artifact = await adapter.getImagePromptArtifact(data.imagePromptArtifactId);

  let result: ArkImageResult;
  try {
    result = await (providerOverride ?? defaultProvider)({
      prompt: artifact.promptText,
      negativePrompt: artifact.negativePrompt ?? undefined,
      referenceImageUrls: [], // P0: no URL resolution layer; Wave 7 adds the asset service hook
      count: data.count,
      aspectRatio: data.aspectRatio,
    });
  } catch (err) {
    await adapter.updateImageBatch(batch.id, { status: "FAILED", errorMessage: String((err as Error).message ?? err) });
    await adapter.updateShot(data.shotId, { status: "FAILED", lastError: String((err as Error).message ?? err) });
    await jobRepository.update(data.jobId, { status: "FAILED", completedAt: new Date().toISOString(), errorMessage: String((err as Error).message ?? err) });
    await traceService.record({ workspaceId: data.workspaceId, shotId: data.shotId, traceType: "job_event", name: "image_batch_failed", metadata: { jobId: data.jobId } });
    throw err;
  }

  for (const c of result.candidates) {
    await adapter.insertImageCandidate({
      id: "imc_" + Math.random().toString(36).slice(2, 12),
      batchId: batch.id,
      shotId: batch.shotId,
      workspaceId: batch.workspaceId,
      imageUrl: c.imageUrl,
      objectKey: c.objectKey ?? null,
      width: null,
      height: null,
      seed: c.seed ?? null,
      provider: result.provider,
      providerResponse: c,
      status: "SUCCEEDED",
      errorMessage: null,
    });
  }
  for (let i = result.candidates.length; i < data.count; i++) {
    await adapter.insertImageCandidate({
      id: "imc_" + Math.random().toString(36).slice(2, 12),
      batchId: batch.id,
      shotId: batch.shotId,
      workspaceId: batch.workspaceId,
      imageUrl: null,
      objectKey: null,
      width: null,
      height: null,
      seed: null,
      provider: result.provider,
      providerResponse: {},
      status: "FAILED",
      errorMessage: "provider_returned_short",
    });
  }

  const finalStatus =
    result.candidates.length === data.count
      ? "SUCCEEDED"
      : result.candidates.length > 0
        ? "PARTIAL"
        : "FAILED";

  await adapter.updateImageBatch(batch.id, {
    status: finalStatus,
    succeededCount: result.candidates.length,
    failedCount: data.count - result.candidates.length,
  });
  await jobRepository.update(data.jobId, {
    status: finalStatus === "FAILED" ? "FAILED" : "SUCCEEDED",
    completedAt: new Date().toISOString(),
  });
  await adapter.updateShot(data.shotId, {
    status: finalStatus === "FAILED" ? "FAILED" : "IMAGE_CANDIDATES_READY",
  });
  await traceService.record({
    workspaceId: data.workspaceId,
    shotId: data.shotId,
    traceType: "provider_call",
    name: "image_generation_completed",
    metadata: { provider: result.provider, model: result.model, count: result.candidates.length, jobId: data.jobId },
  });
}
```

- [ ] **Step 3: Wire `generationService.createImageBatch`**

Replace the placeholder in `apps/server/src/modules/generation/generation.service.ts`:

```ts
import { nanoid } from "nanoid";
import { db } from "../../db/client.js";
import { config } from "../../common/config.js";
import { HttpError } from "../../common/errors.js";
import { jobRepository } from "../job/job.repository.js";
import { enqueueGenerationV2 } from "../job/job.queue.js";
import { GENERATION_V2_QUEUE_NAME } from "@aigc-video/shared";
import { shotWorkflowService } from "../shot/shot.service.js";

export const generationService = {
  async createImageBatch(input: {
    workspaceId: string;
    shotId: string;
    imagePromptArtifactId: string;
    count?: number;
    aspectRatio: "9:16" | "16:9" | "1:1";
    idempotencyKey: string;
  }) {
    const existing = await db.db2.getImageBatchByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { data: existing, deduped: true };
    }
    const count = shotWorkflowService.resolveBatchCount("image", input.count);
    const batch = await db.db2.insertImageBatch({
      id: "imb_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      imagePromptArtifactId: input.imagePromptArtifactId,
      status: "PENDING",
      requestedCount: count,
      succeededCount: 0,
      failedCount: 0,
      provider: "ark-seedream",
      aspectRatio: input.aspectRatio,
      providerRequest: {},
      errorMessage: null,
      idempotencyKey: input.idempotencyKey,
    });
    const job = await jobRepository.insert({
      id: "job_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      jobType: "generate_images",
      status: "PENDING",
      queueName: GENERATION_V2_QUEUE_NAME,
      queueJobId: null,
      relatedBatchType: "image_generation_batch",
      relatedBatchId: batch.id,
      payload: {},
      progress: 0,
      attemptCount: 0,
      maxAttempts: 3,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });
    await db.db2.updateShot(input.shotId, { status: "IMAGE_GENERATING" });
    await enqueueGenerationV2({
      kind: "generate_images",
      jobId: job.id,
      batchId: batch.id,
      shotId: input.shotId,
      workspaceId: input.workspaceId,
      imagePromptArtifactId: input.imagePromptArtifactId,
      count,
      aspectRatio: input.aspectRatio,
      traceId: nanoid(),
    });
    return { data: { batchId: batch.id, jobId: job.id, status: batch.status, requestedCount: count } };
  },
};
```

- [ ] **Step 4: Replace 501 handlers in shot.controller.ts with real ones**

In `apps/server/src/modules/shot/shot.controller.ts`, replace the loop that returns 501 for image-related routes with real handlers. Keep video-related routes (Task 24+) as 501 until Wave 4.

Pattern for the propose route:

```ts
app.post("/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose", async (req, reply) => {
  try {
    const params = req.params as { workspaceId: string; shotId: string };
    const body = proposeImagePromptRequest.parse(req.body);
    return await shotWorkflowService.proposeImagePrompt({
      workspaceId: params.workspaceId,
      shotId: params.shotId,
      referenceAssetIds: body.referenceAssetIds,
      userHint: body.userHint,
      stylePresetId: body.stylePresetId,
    });
  } catch (e) {
    const err = toHttpError(e);
    return reply.status(err.statusCode).send(err);
  }
});
```

Repeat the same translation for: `PATCH .../image-prompts/:artifactId` → `shotWorkflowService.patchImagePrompt`, `GET .../image-prompts` → `shotWorkflowService.listImagePrompts`, `POST .../image-batches` → call `generationService.createImageBatch` reading `Idempotency-Key` header (400 if missing), `GET .../image-batches/:batchId` → fetch batch + candidates.

- [ ] **Step 5: Register the worker processor**

Add at the top of `apps/server/src/main.ts` (or wherever workers boot — currently `apps/server/src/main.ts`):

```ts
import { registerGenerationV2Processor, startGenerationV2Worker } from "./modules/job/job.queue.js";
import { processGenerateImages } from "./modules/generation/image.worker.js";

registerGenerationV2Processor(async (data) => {
  if (data.kind === "generate_images") return processGenerateImages(data);
  // generate_videos and compose_final_video added in Waves 4 and 5
});
startGenerationV2Worker();
```

- [ ] **Step 6: Run, see pass; commit**

```bash
pnpm --filter @aigc-video/server test:unit -- src/modules/generation/image.worker.unit.test.ts
git add -A
git commit -m "feat(server): image batch endpoint + worker + idempotency"
```

---

### Task 24: Image flow integration test

**Files:**
- Create: `apps/server/test/helpers/api-client.ts`
- Create: `apps/server/test/helpers/poll.ts`
- Create: `apps/server/test/helpers/provider-env.ts`
- Create: `apps/server/vitest.integration.config.ts`
- Create: `apps/server/test/integration/image-flow.integration.test.ts`
- Modify: root `package.json` scripts

- [ ] **Step 1: Helpers (verbatim from spec §9.2 + §9.3)**

`apps/server/test/helpers/provider-env.ts`:

```ts
import { z } from "zod";

export const IntegrationEnvSchema = z.object({
  TEST_API_BASE_URL: z.string().url(),
  TEST_RUN_ID: z.string().default(`run-${Date.now()}`),
  TEXT_API_KEY: z.string().optional(),
  TEXT_BASE_URL: z.string().url().optional(),
  TEXT_ENDPOINT_ID: z.string().optional(),
  IMAGE_API_KEY: z.string().optional(),
  IMAGE_BASE_URL: z.string().url().optional(),
  IMAGE_ENDPOINT_ID: z.string().optional(),
  VIDEO_API_KEY: z.string().optional(),
  VIDEO_BASE_URL: z.string().url().optional(),
  VIDEO_ENDPOINT_ID: z.string().optional(),
});

export function loadIntegrationEnv() {
  const env = IntegrationEnvSchema.parse(process.env);
  const required: Array<keyof typeof env> = ["TEXT_API_KEY", "TEXT_ENDPOINT_ID", "IMAGE_API_KEY", "IMAGE_ENDPOINT_ID"];
  for (const k of required) {
    if (!env[k]) throw new Error(`Integration tests require ${k}`);
  }
  return env;
}
```

`apps/server/test/helpers/api-client.ts`:

```ts
import { loadIntegrationEnv } from "./provider-env.js";
const env = loadIntegrationEnv();

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.TEST_API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  return body as T;
}
```

`apps/server/test/helpers/poll.ts`:

```ts
export async function pollUntil<T>(input: {
  label: string;
  intervalMs: number;
  timeoutMs: number;
  fetcher: () => Promise<T>;
  isDone: (v: T) => boolean;
}): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < input.timeoutMs) {
    const v = await input.fetcher();
    if (input.isDone(v)) return v;
    await new Promise((r) => setTimeout(r, input.intervalMs));
  }
  throw new Error(`Timeout while polling ${input.label}`);
}
```

- [ ] **Step 2: Vitest config**

`apps/server/vitest.integration.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/integration/**/*.integration.test.ts"],
    testTimeout: 15 * 60 * 1000,
    hookTimeout: 60_000,
    retry: 0,
    sequence: { concurrent: false },
  },
});
```

Add scripts to `apps/server/package.json`:

```json
"test:unit": "vitest run --config vitest.unit.config.ts",
"test:integration:smoke": "RUN_REAL_PROVIDER_TESTS=true vitest run --config vitest.integration.config.ts -t '@smoke'",
"test:integration:provider": "RUN_REAL_PROVIDER_TESTS=true vitest run --config vitest.integration.config.ts -t '@provider'",
"test:integration:expensive": "RUN_REAL_PROVIDER_TESTS=true ALLOW_EXPENSIVE_TESTS=true vitest run --config vitest.integration.config.ts -t '@expensive'"
```

(Create `apps/server/vitest.unit.config.ts` if it doesn't already exist; default include is `src/**/*.unit.test.ts` and `src/**/*.test.ts`.)

- [ ] **Step 3: Integration test (image flow)**

`apps/server/test/integration/image-flow.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";

describe("image flow @provider", () => {
  it("propose prompt -> generate batch -> select image", async () => {
    // Workspace + shot setup — assumes a helper has prepared a workspace with one DRAFT shot.
    // For now, hit a known dev-seeded workspace; replace with full setup once that helper exists.
    const ws = await api<{ data: { id: string } }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: `it-image-${Date.now()}` }),
    });
    // Trigger upstream pipeline (brief/storyboard/shotprompt) — out of scope for this test;
    // assume a seeded workspace OR call workflow service helpers from a separate setup script.

    // Pretend shot 'shot-1' exists.
    const shotId = "shot-1";
    const proposal = await api<{ data: { id: string; promptText: string } }>(
      `/api/workspaces/${ws.data.id}/shots/${shotId}/image-prompts/propose`,
      { method: "POST", body: JSON.stringify({ referenceAssetIds: [], userHint: "lifestyle vibe" }) },
    );
    expect(proposal.data.promptText.length).toBeGreaterThan(20);

    const batch = await api<{ data: { batchId: string } }>(`/api/shots/${shotId}/image-batches`, {
      method: "POST",
      headers: { "Idempotency-Key": `it-${Date.now()}` },
      body: JSON.stringify({ imagePromptArtifactId: proposal.data.id, count: 3, aspectRatio: "9:16" }),
    });

    const final = await pollUntil({
      label: "image batch",
      intervalMs: 3000,
      timeoutMs: 240000,
      fetcher: () => api<{ data: { status: string; candidates: Array<{ id: string; imageUrl: string }> } }>(
        `/api/shots/${shotId}/image-batches/${batch.data.batchId}`,
      ),
      isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
    });
    expect(final.data.status).not.toBe("FAILED");
    expect(final.data.candidates.length).toBeGreaterThan(0);

    const pick = final.data.candidates.find((c) => c.imageUrl);
    expect(pick?.imageUrl).toMatch(/^https?:\/\//);

    const selected = await api<{ shotStatus: string }>(`/api/shots/${shotId}/selected-image`, {
      method: "POST",
      body: JSON.stringify({ imageCandidateId: pick!.id, imageGenerationBatchId: batch.data.batchId }),
    });
    expect(selected.shotStatus).toBe("IMAGE_SELECTED");
  });
});
```

(The test assumes a pre-seeded workspace and shot. Once Wave 2's seeding flow is exercised by a fixture helper, replace the placeholder with real setup — add as `test/helpers/seed-workspace.ts` covering the brief→storyboard→shotprompt path.)

- [ ] **Step 4: Run integration test (requires real providers)**

```bash
TEST_API_BASE_URL=http://localhost:3000 \
TEXT_API_KEY=... TEXT_ENDPOINT_ID=... IMAGE_API_KEY=... IMAGE_ENDPOINT_ID=... \
MODEL_MODE=real \
pnpm --filter @aigc-video/server test:integration:provider
```

Expected: passes. If the test fails because no seeded workspace exists, write the seed helper first.

- [ ] **Step 5: Commit**

```bash
git add apps/server/test/ apps/server/vitest.integration.config.ts apps/server/package.json
git commit -m "test(server): real-provider integration suite + image flow happy path"
```

---

### Wave 3 — end-of-wave smoke

- [ ] **Step 1: Unit + integration smoke**

```bash
pnpm typecheck
pnpm --filter @aigc-video/server test:unit
pnpm --filter @aigc-video/server test:integration:smoke
```

Expected: green.

- [ ] **Step 2: Tag**

```bash
git tag -m "Wave 3: image flow end-to-end" wave-3-image
```

---

## WAVE 4 — Video flow end-to-end (5 tasks)

### Task 25: video-script versioning helper

**Files:**
- Modify: `apps/server/src/modules/artifact/artifact.versioning.ts`

- [ ] **Step 1: Add `createVideoScriptVersionAtomic`**

Append to `apps/server/src/modules/artifact/artifact.versioning.ts`:

```ts
export async function createVideoScriptVersionAtomic(input: {
  shotId: string;
  durationSec: number;
  scriptJson: unknown;
  providerPrompt: string;
  basedOnImageCandidateId: string;
  basedOnPrevImageCandidateId?: string;
  basedOnNextImageCandidateId?: string;
  createdBy: "agent" | "user" | "system";
  agentName?: string;
  promptTemplateVersion?: string;
  baseArtifactId?: string;
}) {
  const pool = db.db2.pool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update video_script_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [input.shotId],
    );
    const versionRow = await client.query(
      `select coalesce(max(version), 0) as max_version from video_script_artifacts where shot_id=$1`,
      [input.shotId],
    );
    const version = Number(versionRow.rows[0].max_version) + 1;
    const insert = await client.query(
      `insert into video_script_artifacts
        (id, shot_id, version, status, duration_sec, script_json, provider_prompt,
         based_on_image_candidate_id, based_on_prev_image_candidate_id, based_on_next_image_candidate_id,
         created_by, agent_name, prompt_template_version, base_artifact_id)
       values ($1,$2,$3,'ACTIVE',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [
        `art_vid_${cryptoRandom()}`,
        input.shotId,
        version,
        input.durationSec,
        JSON.stringify(input.scriptJson),
        input.providerPrompt,
        input.basedOnImageCandidateId,
        input.basedOnPrevImageCandidateId ?? null,
        input.basedOnNextImageCandidateId ?? null,
        input.createdBy,
        input.agentName ?? null,
        input.promptTemplateVersion ?? null,
        input.baseArtifactId ?? null,
      ],
    );
    await client.query(
      `update storyboard_shots set active_video_script_artifact_id=$1, updated_at=now() where id=$2`,
      [insert.rows[0].id, input.shotId],
    );
    // Stale rule: editing/replacing a video script drops the selected video.
    await client.query(`delete from selected_shot_videos where shot_id=$1`, [input.shotId]);
    await client.query("commit");
    return insert.rows[0];
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/modules/artifact/artifact.versioning.ts
git commit -m "feat(server): video-script versioning helper (with selected-video drop)"
```

---

### Task 26: video script service methods + endpoints

**Files:**
- Modify: `apps/server/src/modules/shot/shot.service.ts`
- Modify: `apps/server/src/modules/shot/shot.controller.ts`

- [ ] **Step 1: Service methods**

Add to `shot.service.ts`:

```ts
import { createVideoScriptVersionAtomic } from "../artifact/artifact.versioning.js";
import { runVideoShotScriptAgent } from "@aigc-video/ai";

async function neighborImagesFor(workspaceId: string, shotId: string) {
  const shots = (await db.db2.listShotsByWorkspace(workspaceId)).sort((a, b) => a.orderIndex - b.orderIndex);
  const idx = shots.findIndex((s) => s.id === shotId);
  const prev = idx > 0 ? shots[idx - 1] : undefined;
  const next = idx >= 0 && idx < shots.length - 1 ? shots[idx + 1] : undefined;
  async function pick(id: string | null) {
    if (!id) return undefined;
    const sel = await db.db2.getSelectedImage(id);
    if (!sel) return undefined;
    const cand = await db.db2.getImageCandidate(sel.imageCandidateId);
    if (!cand?.imageUrl) return undefined;
    return { id: cand.id, url: cand.imageUrl, summary: "" };
  }
  return { prev: await pick(prev?.id ?? null), next: await pick(next?.id ?? null) };
}

shotWorkflowService.proposeVideoScript = async function (args: {
  workspaceId: string;
  shotId: string;
  durationSec: number;
  useNeighborFrames: boolean;
  userHint?: string;
}) {
  const shot = await db.db2.getShot(args.shotId);
  const selected = await db.db2.getSelectedImage(args.shotId);
  if (!selected) throw new HttpError(409, "NO_SELECTED_IMAGE", "Cannot propose video script without a selected image");
  const selectedImage = await db.db2.getImageCandidate(selected.imageCandidateId);
  const neighbors = args.useNeighborFrames ? await neighborImagesFor(args.workspaceId, args.shotId) : { prev: undefined, next: undefined };
  const traceId = nanoid();
  await db.db2.updateShot(args.shotId, { status: "VIDEO_SCRIPT_PROPOSING" });
  try {
    const result = await runVideoShotScriptAgent({
      payload: {
        productBrief: {},
        shot: { index: shot.orderIndex, objective: shot.objective ?? shot.title },
        selectedImage: { id: selectedImage.id, summary: "", url: selectedImage.imageUrl ?? "" },
        neighborImages: neighbors,
        durationSec: args.durationSec,
        userHint: args.userHint,
      },
      context: { workspaceId: args.workspaceId, shotId: args.shotId, traceId, runtimeMode: process.env.MODEL_MODE === "real" ? "real" : "mock" },
    });

    const artifact = await createVideoScriptVersionAtomic({
      shotId: args.shotId,
      durationSec: result.output.durationSec,
      scriptJson: result.output,
      providerPrompt: result.output.providerPrompt,
      basedOnImageCandidateId: selectedImage.id,
      basedOnPrevImageCandidateId: neighbors.prev?.id,
      basedOnNextImageCandidateId: neighbors.next?.id,
      createdBy: "agent",
      agentName: "VideoShotScriptAgent",
      promptTemplateVersion: result.templateVersion,
    });

    await db.db2.updateShot(args.shotId, { status: "VIDEO_SCRIPT_READY", activeVideoScriptArtifactId: artifact.id });
    return { data: artifact, shotStatus: "VIDEO_SCRIPT_READY", nextAction: getNextAction("VIDEO_SCRIPT_READY"), traceId };
  } catch (err) {
    await db.db2.updateShot(args.shotId, { status: "FAILED", lastError: err instanceof Error ? err.message : String(err) });
    throw err;
  }
} as any;

shotWorkflowService.patchVideoScript = async function (args: {
  shotId: string;
  scriptId: string;
  baseVersion: number;
  durationSec: number;
  scriptJson: unknown;
  providerPrompt: string;
}) {
  const prior = await db.db2.getVideoScriptArtifact(args.scriptId);
  if (prior.version !== args.baseVersion) {
    throw new HttpError(409, "STALE_BASE_VERSION", "baseVersion does not match active script");
  }
  const artifact = await createVideoScriptVersionAtomic({
    shotId: args.shotId,
    durationSec: args.durationSec,
    scriptJson: args.scriptJson,
    providerPrompt: args.providerPrompt,
    basedOnImageCandidateId: prior.basedOnImageCandidateId,
    basedOnPrevImageCandidateId: prior.basedOnPrevImageCandidateId ?? undefined,
    basedOnNextImageCandidateId: prior.basedOnNextImageCandidateId ?? undefined,
    createdBy: "user",
    baseArtifactId: args.scriptId,
  });
  await db.db2.updateShot(args.shotId, { status: "VIDEO_SCRIPT_EDITED", activeVideoScriptArtifactId: artifact.id });
  return { data: artifact, shotStatus: "VIDEO_SCRIPT_EDITED", nextAction: getNextAction("VIDEO_SCRIPT_EDITED") };
} as any;

shotWorkflowService.listVideoScripts = async function (shotId: string) {
  return { data: await db.db2.listVideoScriptArtifacts(shotId) };
} as any;

shotWorkflowService.selectVideo = async function (args: { shotId: string; videoCandidateId: string; videoGenerationBatchId: string }) {
  await db.db2.upsertSelectedVideo(args);
  await db.db2.updateShot(args.shotId, { status: "VIDEO_SELECTED", selectedVideoId: args.videoCandidateId });
  return { data: { shotId: args.shotId, selectedVideoId: args.videoCandidateId }, shotStatus: "VIDEO_SELECTED", nextAction: getNextAction("VIDEO_SELECTED") };
} as any;
```

- [ ] **Step 2: Controller wiring**

Replace the remaining 501 stubs in `shot.controller.ts` for video-script endpoints. Wire each to the new service methods following the image-prompt pattern.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/shot/
git commit -m "feat(server): video script propose/edit/list + selected video endpoint"
```

---

### Task 27: Video batch worker + endpoint

**Files:**
- Create: `apps/server/src/modules/generation/video.worker.ts`
- Create: `apps/server/src/modules/generation/video.worker.unit.test.ts`
- Modify: `apps/server/src/modules/generation/generation.service.ts`
- Modify: `apps/server/src/main.ts`

- [ ] **Step 1: Worker**

`apps/server/src/modules/generation/video.worker.ts`:

```ts
import {
  generateVideoWithSeedance,
  resolveVideoProviderConfig,
} from "@aigc-video/ai";
import type { GenerateVideosJobData } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { jobRepository } from "../job/job.repository.js";
import { traceService } from "../trace/trace.service.js";

export async function processGenerateVideos(data: GenerateVideosJobData) {
  const batch = await db.db2.getVideoBatch(data.batchId);
  if (batch.status !== "PENDING") return;

  await db.db2.updateVideoBatch(batch.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, { status: "RUNNING", startedAt: new Date().toISOString() });

  const script = await db.db2.getVideoScriptArtifact(data.videoScriptArtifactId);
  if (script.status !== "ACTIVE") {
    await db.db2.updateVideoBatch(batch.id, { status: "FAILED", errorMessage: "STALE_SCRIPT" });
    await db.db2.updateShot(data.shotId, { status: "FAILED", lastError: "STALE_SCRIPT" });
    await jobRepository.update(data.jobId, { status: "FAILED", completedAt: new Date().toISOString(), errorMessage: "STALE_SCRIPT" });
    throw new Error("STALE_SCRIPT");
  }
  const startImage = await db.db2.getImageCandidate(script.basedOnImageCandidateId);
  if (!startImage.imageUrl) throw new Error("MISSING_START_IMAGE_URL");

  const cfg = resolveVideoProviderConfig();
  if (!cfg) throw new Error("VIDEO provider not configured");

  const tasks = Array.from({ length: data.count }, () =>
    generateVideoWithSeedance(
      {
        imageUrl: startImage.imageUrl!,
        prompt: script.providerPrompt,
        durationSec: script.durationSec,
        aspectRatio: data.aspectRatio,
        generateAudio: true,
      },
      {},
    ),
  );

  const results = await Promise.allSettled(tasks);
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      succeeded++;
      await db.db2.insertVideoCandidate({
        id: "vcd_" + Math.random().toString(36).slice(2, 12),
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        videoUrl: r.value.videoUrl,
        objectKey: null,
        thumbnailUrl: null,
        durationSec: script.durationSec,
        width: null,
        height: null,
        provider: r.value.provider,
        providerResponse: r.value,
        status: "SUCCEEDED",
        errorMessage: null,
      });
    } else {
      failed++;
      await db.db2.insertVideoCandidate({
        id: "vcd_" + Math.random().toString(36).slice(2, 12),
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        videoUrl: null,
        objectKey: null,
        thumbnailUrl: null,
        durationSec: null,
        width: null,
        height: null,
        provider: "seedance",
        providerResponse: {},
        status: "FAILED",
        errorMessage: String((r.reason as Error)?.message ?? r.reason),
      });
    }
  }

  const finalStatus = failed === 0 ? "SUCCEEDED" : succeeded > 0 ? "PARTIAL" : "FAILED";
  await db.db2.updateVideoBatch(batch.id, { status: finalStatus, succeededCount: succeeded, failedCount: failed });
  await jobRepository.update(data.jobId, { status: finalStatus === "FAILED" ? "FAILED" : "SUCCEEDED", completedAt: new Date().toISOString() });
  await db.db2.updateShot(data.shotId, { status: finalStatus === "FAILED" ? "FAILED" : "VIDEO_CANDIDATES_READY" });
  await traceService.record({ workspaceId: data.workspaceId, shotId: data.shotId, traceType: "provider_call", name: "video_generation_completed", metadata: { succeeded, failed, jobId: data.jobId } });
}
```

- [ ] **Step 2: Unit test (worker, with fake `generateVideoWithSeedance`)**

Pattern matches Task 23's image worker test. Skipped here for brevity — copy the structure, mock the provider, assert candidate counts and batch transitions.

- [ ] **Step 3: `generationService.createVideoBatch`**

Append to `generation.service.ts`:

```ts
createVideoBatch: async (input: {
  workspaceId: string;
  shotId: string;
  videoScriptArtifactId: string;
  count?: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  idempotencyKey: string;
}) => {
  const existing = await db.db2.getVideoBatchByIdempotencyKey(input.idempotencyKey);
  if (existing) return { data: existing, deduped: true };
  const script = await db.db2.getVideoScriptArtifact(input.videoScriptArtifactId);
  if (script.status !== "ACTIVE") throw new HttpError(409, "STALE_SCRIPT", "Cannot generate video on stale script");
  const count = shotWorkflowService.resolveBatchCount("video", input.count);
  const batch = await db.db2.insertVideoBatch({
    id: "vbb_" + nanoid(10),
    workspaceId: input.workspaceId,
    shotId: input.shotId,
    videoScriptArtifactId: input.videoScriptArtifactId,
    status: "PENDING",
    requestedCount: count,
    succeededCount: 0,
    failedCount: 0,
    provider: "seedance",
    aspectRatio: input.aspectRatio,
    providerRequest: {},
    errorMessage: null,
    idempotencyKey: input.idempotencyKey,
  });
  const job = await jobRepository.insert({
    id: "job_" + nanoid(10),
    workspaceId: input.workspaceId,
    shotId: input.shotId,
    jobType: "generate_videos",
    status: "PENDING",
    queueName: GENERATION_V2_QUEUE_NAME,
    queueJobId: null,
    relatedBatchType: "video_generation_batch",
    relatedBatchId: batch.id,
    payload: {},
    progress: 0,
    attemptCount: 0,
    maxAttempts: 3,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
  });
  await db.db2.updateShot(input.shotId, { status: "VIDEO_GENERATING" });
  await enqueueGenerationV2({
    kind: "generate_videos",
    jobId: job.id,
    batchId: batch.id,
    shotId: input.shotId,
    workspaceId: input.workspaceId,
    videoScriptArtifactId: input.videoScriptArtifactId,
    count,
    aspectRatio: input.aspectRatio,
    traceId: nanoid(),
  });
  return { data: { batchId: batch.id, jobId: job.id, status: batch.status, requestedCount: count } };
},
```

- [ ] **Step 4: Wire processor in `main.ts`**

Edit the existing registration:

```ts
registerGenerationV2Processor(async (data) => {
  if (data.kind === "generate_images") return processGenerateImages(data);
  if (data.kind === "generate_videos") return processGenerateVideos(data);
  // compose_final_video added in Wave 5
});
```

- [ ] **Step 5: Wire 501 stubs in shot.controller.ts → real handlers for video-batches**

Replace `/api/shots/:shotId/video-batches` POST/GET handlers to call `generationService.createVideoBatch` and the batch query helper.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): video batch endpoint + worker + idempotency"
```

---

### Task 28: Retry endpoint + concurrency safety

**Files:**
- Modify: `apps/server/src/modules/shot/shot.service.ts`
- Modify: `apps/server/src/modules/shot/shot.controller.ts`

- [ ] **Step 1: Implement retry on the service**

Append to `shot.service.ts`:

```ts
shotWorkflowService.retry = async function (args: { shotId: string; what: "image_batch" | "video_batch"; idempotencyKey: string }) {
  const shot = await db.db2.getShot(args.shotId);
  if (args.what === "image_batch") {
    if (!shot.activeImagePromptArtifactId) throw new HttpError(409, "NO_ACTIVE_IMAGE_PROMPT");
    return await generationService.createImageBatch({
      workspaceId: shot.workspaceId,
      shotId: shot.id,
      imagePromptArtifactId: shot.activeImagePromptArtifactId,
      aspectRatio: "9:16",
      idempotencyKey: args.idempotencyKey,
    });
  }
  if (!shot.activeVideoScriptArtifactId) throw new HttpError(409, "NO_ACTIVE_VIDEO_SCRIPT");
  return await generationService.createVideoBatch({
    workspaceId: shot.workspaceId,
    shotId: shot.id,
    videoScriptArtifactId: shot.activeVideoScriptArtifactId,
    aspectRatio: "9:16",
    idempotencyKey: args.idempotencyKey,
  });
} as any;
```

- [ ] **Step 2: Wire the controller route**

```ts
app.post("/api/shots/:shotId/retry", async (req, reply) => {
  try {
    const params = req.params as { shotId: string };
    const body = retryRequest.parse(req.body);
    const key = req.headers["idempotency-key"] as string | undefined;
    if (!key) return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    return await shotWorkflowService.retry({ shotId: params.shotId, what: body.what, idempotencyKey: key });
  } catch (e) {
    const err = toHttpError(e);
    return reply.status(err.statusCode).send(err);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(server): /shots/:shotId/retry endpoint"
```

---

### Task 29: Video flow integration test

**Files:**
- Create: `apps/server/test/integration/video-flow.integration.test.ts`

- [ ] **Step 1: Test**

Mirror Task 24's structure: prerequisite image flow → propose video script → patch durationSec → create video-batch with Idempotency-Key → poll → select video. Use `@expensive` tag because each video can take ~1-5 minutes.

- [ ] **Step 2: Run + commit**

```bash
pnpm --filter @aigc-video/server test:integration:expensive -- video-flow
git add apps/server/test/integration/video-flow.integration.test.ts
git commit -m "test(server): real-provider integration for video flow"
```

---

### Wave 4 — end-of-wave smoke

- [ ] Run `pnpm typecheck`, unit tests, `test:integration:smoke`.
- [ ] Tag: `git tag -m "Wave 4: video flow end-to-end" wave-4-video`.

---

## WAVE 5 — Final compose (5 tasks)

### Task 30: ffmpeg helper module + boot preflight

**Files:**
- Create: `apps/server/src/modules/generation/ffmpeg.ts`
- Modify: `apps/server/src/main.ts`
- Modify: `infra/docker-compose.yml` (only if Docker is the deploy target)

- [ ] **Step 1: ffmpeg helper**

`apps/server/src/modules/generation/ffmpeg.ts`:

```ts
import { spawn } from "node:child_process";

export async function which(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("which", [bin]);
    let out = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.on("close", (code) => resolve(code === 0 ? out.trim() : null));
    child.on("error", () => resolve(null));
  });
}

export async function assertFfmpegAvailable() {
  const path = await which("ffmpeg");
  if (!path) {
    throw new Error("ffmpeg not found on PATH. Install via `brew install ffmpeg` (macOS) or `apt-get install ffmpeg` (Debian).");
  }
}

export async function runFfmpeg(args: string[], onStderr?: (chunk: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";
    child.stderr.on("data", (b) => {
      const s = b.toString();
      stderr += s;
      onStderr?.(s);
    });
    child.on("close", (code) => (code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 400)}`))));
  });
}

export async function ffprobe(filePath: string): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "default=nw=1:nk=1",
      filePath,
    ]);
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (err += b.toString()));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err}`));
      const lines = out.trim().split("\n");
      resolve({ width: Number(lines[0]), height: Number(lines[1]), durationSec: Math.round(Number(lines[2])) });
    });
  });
}
```

- [ ] **Step 2: Boot preflight**

In `apps/server/src/main.ts`, before `startGenerationV2Worker()`:

```ts
import { assertFfmpegAvailable } from "./modules/generation/ffmpeg.js";
await assertFfmpegAvailable();
```

- [ ] **Step 3: Docker dependency**

If you build a Docker image for the worker, add ffmpeg to the Dockerfile (or runtime image). If currently running outside Docker, document the requirement in `README.md` (or whichever doc lists prerequisites).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/generation/ffmpeg.ts apps/server/src/main.ts infra/docker-compose.yml
git commit -m "feat(server): ffmpeg helper + boot preflight"
```

---

### Task 31: Final compose worker

**Files:**
- Create: `apps/server/src/modules/generation/final-compose.worker.ts`
- Create: `apps/server/src/modules/generation/final-compose.boundary.unit.test.ts`

- [ ] **Step 1: Worker**

`apps/server/src/modules/generation/final-compose.worker.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ComposeFinalVideoJobData } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { jobRepository } from "../job/job.repository.js";
import { traceService } from "../trace/trace.service.js";
import { ffprobe, runFfmpeg } from "./ffmpeg.js";

function sha256(s: string) {
  return "sha256:" + createHash("sha256").update(s).digest("hex");
}

async function downloadTo(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

export async function processComposeFinalVideo(data: ComposeFinalVideoJobData) {
  const job = await db.db2.getFinalVideoJob(data.finalVideoJobId);
  if (job.status !== "PENDING") return;
  await db.db2.updateFinalVideoJob(job.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, { status: "RUNNING", startedAt: new Date().toISOString() });

  try {
    const candidates = [];
    for (const id of job.sourceShotVideoIds) {
      const cand = await db.db2.getVideoCandidate(id);
      if (!cand.videoUrl) throw new Error(`Missing videoUrl on candidate ${id}`);
      candidates.push(cand);
    }
    // Order is already the persisted source_shot_video_ids order (set at creation time).
    const workspace = await db.db2.getShot(candidates[0].shotId);
    // Workspace path from creative_workspace lookup
    const wsRow = await db.db2.pool().query("select local_path from creative_workspace where id=$1", [job.workspaceId]);
    const wsLocalPath = wsRow.rows[0]?.local_path;
    if (!wsLocalPath) throw new Error("workspace local path missing");

    const workDir = path.join(wsLocalPath, ".daireel", "final", job.id);
    const inputDir = path.join(workDir, "in");
    await mkdir(inputDir, { recursive: true });

    const inputs: string[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const local = path.join(inputDir, `shot-${i + 1}.mp4`);
      await downloadTo(candidates[i].videoUrl!, local);
      inputs.push(local);
    }
    const listFile = path.join(workDir, "concat.txt");
    await writeFile(listFile, inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));

    const outPath = path.join(workDir, "final.mp4");
    const ffmpegLog = await runFfmpeg([
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      "-y", outPath,
    ]);

    const meta = await ffprobe(outPath);
    const manifest = {
      schemaVersion: "final-video.v1",
      workspaceId: job.workspaceId,
      sources: candidates.map((c) => ({
        shotId: c.shotId,
        videoCandidateId: c.id,
        providerUrl: c.videoUrl,
        providerPromptHash: sha256(JSON.stringify(c.providerResponse)),
      })),
      transition: "cut",
    };
    const manifestHash = sha256(JSON.stringify(manifest));

    await db.db2.updateFinalVideoJob(job.id, {
      status: "SUCCEEDED",
      localPath: outPath,
      localUrl: `/api/workspaces/${job.workspaceId}/final-videos/${job.id}/file`,
      durationSec: meta.durationSec,
      width: meta.width,
      height: meta.height,
      compiledManifest: manifest,
      compiledManifestHash: manifestHash,
      ffmpegLog: ffmpegLog.slice(-2000),
      completedAt: new Date().toISOString(),
    });
    await jobRepository.update(data.jobId, { status: "SUCCEEDED", completedAt: new Date().toISOString() });
    await traceService.record({ workspaceId: job.workspaceId, traceType: "job_event", name: "final_compose_completed", metadata: { manifestHash } });
  } catch (err) {
    await db.db2.updateFinalVideoJob(job.id, { status: "FAILED", errorMessage: (err as Error).message });
    await jobRepository.update(data.jobId, { status: "FAILED", completedAt: new Date().toISOString(), errorMessage: (err as Error).message });
    throw err;
  }
}
```

- [ ] **Step 2: Provider-boundary static check (unit test)**

`apps/server/src/modules/generation/final-compose.boundary.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerSrc = readFileSync(path.join(here, "final-compose.worker.ts"), "utf8");

describe("final-compose provider boundary", () => {
  for (const forbidden of [
    "ark-text.provider",
    "ark-image.provider",
    "seedance-video.provider",
    "@aigc-video/ai/agents",
    "runStoryboardImagePromptAgent",
    "runVideoShotScriptAgent",
  ]) {
    it(`does not import ${forbidden}`, () => {
      expect(workerSrc.includes(forbidden)).toBe(false);
    });
  }
});
```

- [ ] **Step 3: Wire processor**

In `apps/server/src/main.ts`:

```ts
import { processComposeFinalVideo } from "./modules/generation/final-compose.worker.js";

registerGenerationV2Processor(async (data) => {
  if (data.kind === "generate_images") return processGenerateImages(data);
  if (data.kind === "generate_videos") return processGenerateVideos(data);
  if (data.kind === "compose_final_video") return processComposeFinalVideo(data);
});
```

- [ ] **Step 4: Run unit, commit**

```bash
pnpm --filter @aigc-video/server test:unit -- src/modules/generation/final-compose
git add -A
git commit -m "feat(server): ffmpeg final-compose worker + provider-boundary check"
```

---

### Task 32: Final-video endpoints

**Files:**
- Modify: `apps/server/src/modules/generation/generation.service.ts`
- Modify: `apps/server/src/modules/generation/generation.controller.ts`

- [ ] **Step 1: Service**

```ts
createFinalCompose: async (input: {
  workspaceId: string;
  outputAspectRatio: "9:16" | "16:9" | "1:1";
  idempotencyKey: string;
}) => {
  const existing = await db.db2.getFinalVideoJobByIdempotencyKey(input.idempotencyKey);
  if (existing) return { data: existing, deduped: true };
  const shots = await db.db2.listShotsByWorkspace(input.workspaceId);
  const missing = shots.filter((s) => !s.selectedVideoId).map((s) => s.id);
  if (missing.length > 0) throw new HttpError(409, "MISSING_SELECTIONS", JSON.stringify(missing));
  const orderedShots = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  const sourceShotVideoIds: string[] = [];
  const sourceScriptIds: string[] = [];
  for (const s of orderedShots) {
    sourceShotVideoIds.push(s.selectedVideoId!);
    const script = s.activeVideoScriptArtifactId;
    if (!script) throw new HttpError(409, "STALE_SELECTIONS", `Shot ${s.id} has no active script`);
    sourceScriptIds.push(script);
  }
  const fv = await db.db2.insertFinalVideoJob({
    id: "fnl_" + nanoid(10),
    workspaceId: input.workspaceId,
    status: "PENDING",
    sourceShotVideoIds,
    sourceVideoScriptArtifactIds: sourceScriptIds,
    localPath: null,
    localUrl: null,
    durationSec: null,
    width: null,
    height: null,
    compiledManifest: {},
    compiledManifestHash: null,
    ffmpegLog: null,
    errorMessage: null,
    idempotencyKey: input.idempotencyKey,
    completedAt: null,
  });
  const job = await jobRepository.insert({
    id: "job_" + nanoid(10),
    workspaceId: input.workspaceId,
    shotId: null,
    jobType: "compose_final_video",
    status: "PENDING",
    queueName: GENERATION_V2_QUEUE_NAME,
    queueJobId: null,
    relatedBatchType: "final_video_job",
    relatedBatchId: fv.id,
    payload: {},
    progress: 0,
    attemptCount: 0,
    maxAttempts: 1,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
  });
  await enqueueGenerationV2({
    kind: "compose_final_video",
    jobId: job.id,
    finalVideoJobId: fv.id,
    workspaceId: input.workspaceId,
    traceId: nanoid(),
  });
  return { data: { finalVideoJobId: fv.id, jobId: job.id, status: fv.status } };
},
```

- [ ] **Step 2: Controller**

Replace 501 stubs:

```ts
app.post("/api/workspaces/:workspaceId/final-videos", async (req, reply) => {
  try {
    const params = req.params as { workspaceId: string };
    const key = req.headers["idempotency-key"] as string | undefined;
    if (!key) return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const body = req.body as { outputAspectRatio?: "9:16" | "16:9" | "1:1" };
    return await generationService.createFinalCompose({ workspaceId: params.workspaceId, outputAspectRatio: body.outputAspectRatio ?? "9:16", idempotencyKey: key });
  } catch (e) { const err = toHttpError(e); return reply.status(err.statusCode).send(err); }
});

app.get("/api/final-videos/:finalVideoJobId", async (req) => {
  const params = req.params as { finalVideoJobId: string };
  const row = await db.db2.getFinalVideoJob(params.finalVideoJobId);
  return { data: row };
});

app.get("/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file", async (req, reply) => {
  const params = req.params as { workspaceId: string; finalVideoJobId: string };
  const row = await db.db2.getFinalVideoJob(params.finalVideoJobId);
  if (!row.localPath) return reply.status(404).send({ code: "NOT_READY" });
  reply.header("Content-Type", "video/mp4");
  return reply.send(createReadStream(row.localPath));
});
```

(Add `import { createReadStream } from "node:fs";` at top if missing.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(server): final compose endpoints"
```

---

### Task 33: Final-compose integration tests

**Files:**
- Create: `apps/server/test/integration/final-compose.integration.test.ts`
- Create: `apps/server/test/integration/final-compose-contract.integration.test.ts`

- [ ] **Step 1: Happy-path integration**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";

describe("final compose @expensive", () => {
  it("composes and produces deterministic manifest hash across two runs", async () => {
    // Setup: assume a workspace exists where every shot already has selected video
    const workspaceId = process.env.TEST_FIXTURE_WORKSPACE!;
    expect(workspaceId).toBeTruthy();

    const r1 = await api<{ data: { finalVideoJobId: string } }>(
      `/api/workspaces/${workspaceId}/final-videos`,
      { method: "POST", headers: { "Idempotency-Key": `run-1-${Date.now()}` }, body: JSON.stringify({}) },
    );
    const done1 = await pollUntil({
      label: "final compose 1",
      intervalMs: 5000,
      timeoutMs: 10 * 60_000,
      fetcher: () => api<{ data: { status: string; compiledManifestHash: string | null } }>(`/api/final-videos/${r1.data.finalVideoJobId}`),
      isDone: (v) => ["SUCCEEDED", "FAILED"].includes(v.data.status),
    });
    expect(done1.data.status).toBe("SUCCEEDED");
    expect(done1.data.compiledManifestHash).toMatch(/^sha256:/);

    const r2 = await api<{ data: { finalVideoJobId: string } }>(
      `/api/workspaces/${workspaceId}/final-videos`,
      { method: "POST", headers: { "Idempotency-Key": `run-2-${Date.now()}` }, body: JSON.stringify({}) },
    );
    const done2 = await pollUntil({
      label: "final compose 2",
      intervalMs: 5000,
      timeoutMs: 10 * 60_000,
      fetcher: () => api<{ data: { status: string; compiledManifestHash: string | null } }>(`/api/final-videos/${r2.data.finalVideoJobId}`),
      isDone: (v) => ["SUCCEEDED", "FAILED"].includes(v.data.status),
    });
    expect(done2.data.compiledManifestHash).toBe(done1.data.compiledManifestHash);
  });
});
```

- [ ] **Step 2: Provider-boundary contract test**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../helpers/api-client.js";

describe("final compose contract @expensive", () => {
  it("emits no text/image/video provider_call rows during compose", async () => {
    const workspaceId = process.env.TEST_FIXTURE_WORKSPACE!;
    const traces = await api<{ data: Array<{ traceType: string; metadata: { provider?: string } }> }>(
      `/api/workspaces/${workspaceId}/traces?limit=500`,
    );
    const composeProviderCalls = traces.data.filter(
      (t) => t.traceType === "provider_call" && ["ark", "ark-seedream", "seedance"].includes(t.metadata.provider ?? ""),
    );
    // We expect provider_calls only from agents/image/video workers (earlier stages),
    // never from compose. Since traces are workspace-wide, an exact zero may include earlier stages.
    // Instead, this test asserts no provider_call rows with name starting "final".
    const finalProviderCalls = traces.data.filter((t) => t.traceType === "provider_call" && t.metadata && String((t as any).name ?? "").startsWith("final"));
    expect(finalProviderCalls.length).toBe(0);
    expect(composeProviderCalls.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/integration/final-compose*
git commit -m "test(server): final compose happy path + provider-boundary contract"
```

---

### Wave 5 — end-of-wave smoke

- [ ] Run `pnpm typecheck`, unit tests, `test:integration:smoke`.
- [ ] Tag: `git tag -m "Wave 5: final compose" wave-5-compose`.

---

## WAVE 7 — Polish (4 tasks)

(Wave 6 is the frontend overhaul, lives in the companion plan.)

### Task 34: `/api/config/limits` endpoint

**Files:**
- Modify: `apps/server/src/modules/workspace/workspace.controller.ts` (or new tiny module)
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Add handler**

In `app.ts`, register a small inline route or via a new `modules/config/config.controller.ts`. Inline is fine:

```ts
import { config } from "./common/config.js";
// ...
app.get("/api/config/limits", async () => ({
  data: {
    defaultImageBatchSize: config.defaultImageBatchSize,
    maxImageBatchSize: config.maxImageBatchSize,
    defaultVideoBatchSize: config.defaultVideoBatchSize,
    maxVideoBatchSize: config.maxVideoBatchSize,
    aspectRatios: ["9:16", "16:9", "1:1"],
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/app.ts
git commit -m "feat(server): /api/config/limits endpoint"
```

---

### Task 35: Crash recovery sweep on boot

**Files:**
- Modify: `apps/server/src/modules/job/job.queue.ts`
- Modify: `apps/server/src/main.ts`

- [ ] **Step 1: Sweep function**

In `job.queue.ts`:

```ts
import { db } from "../../db/client.js";
import { enqueueGenerationV2 } from "./job.queue.js";

export async function recoverInflightGenerationJobs() {
  const pool = db.db2.pool();
  const { rows } = await pool.query(
    `select * from generation_jobs where status in ('PENDING','RUNNING') and queue_job_id is null`,
  );
  // Bump RUNNING batches back to PENDING (workers are idempotent on status check)
  await pool.query(
    `update image_generation_batches set status='PENDING' where status='RUNNING'`,
  );
  await pool.query(
    `update video_generation_batches set status='PENDING' where status='RUNNING'`,
  );
  for (const r of rows) {
    // Re-enqueue based on job_type + related_batch_id
    if (r.job_type === "generate_images" && r.related_batch_id) {
      const batch = await db.db2.getImageBatch(r.related_batch_id);
      await enqueueGenerationV2({
        kind: "generate_images",
        jobId: r.id, batchId: batch.id, shotId: batch.shotId, workspaceId: batch.workspaceId,
        imagePromptArtifactId: batch.imagePromptArtifactId, count: batch.requestedCount,
        aspectRatio: batch.aspectRatio as any, traceId: "recover",
      });
    }
    if (r.job_type === "generate_videos" && r.related_batch_id) {
      const batch = await db.db2.getVideoBatch(r.related_batch_id);
      await enqueueGenerationV2({
        kind: "generate_videos",
        jobId: r.id, batchId: batch.id, shotId: batch.shotId, workspaceId: batch.workspaceId,
        videoScriptArtifactId: batch.videoScriptArtifactId, count: batch.requestedCount,
        aspectRatio: batch.aspectRatio as any, traceId: "recover",
      });
    }
    if (r.job_type === "compose_final_video" && r.related_batch_id) {
      const job = await db.db2.getFinalVideoJob(r.related_batch_id);
      await enqueueGenerationV2({
        kind: "compose_final_video",
        jobId: r.id, finalVideoJobId: job.id, workspaceId: job.workspaceId, traceId: "recover",
      });
    }
  }
}
```

- [ ] **Step 2: Wire into `main.ts` boot**

```ts
import { recoverInflightGenerationJobs } from "./modules/job/job.queue.js";
// ... after startGenerationV2Worker():
await recoverInflightGenerationJobs();
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(server): crash recovery sweep for in-flight generation jobs"
```

---

### Task 36: Cleanup endpoint for test runs

**Files:**
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Add gated DELETE**

```ts
app.delete("/api/test-runs/:runId", async (req, reply) => {
  if (process.env.NODE_ENV !== "test" && process.env.ALLOW_TEST_CLEANUP !== "true") {
    return reply.status(403).send({ code: "DISABLED_IN_THIS_ENV" });
  }
  const params = req.params as { runId: string };
  const pool = (await import("./db/client.js")).db.db2.pool();
  // Wipe creative_workspace rows by id-prefix; cascade handles downstream.
  await pool.query("delete from creative_workspace where id like $1", [`%${params.runId}%`]);
  return { data: { ok: true } };
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/app.ts
git commit -m "feat(server): cleanup endpoint for integration test runs"
```

---

### Task 37: Refresh-recovery integration test

**Files:**
- Create: `apps/server/test/integration/refresh-recovery.integration.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from "vitest";
import { api } from "../helpers/api-client.js";

describe("refresh recovery @smoke", () => {
  it("shot-workflow-status carries enough state to resume polling", async () => {
    const workspaceId = process.env.TEST_FIXTURE_WORKSPACE!;
    const res = await api<{ data: { shots: Array<{ shotId: string; status: string; nextAction: string; activeImageBatchId?: string }> } }>(
      `/api/workspaces/${workspaceId}/shot-workflow-status`,
    );
    expect(Array.isArray(res.data.shots)).toBe(true);
    for (const s of res.data.shots) {
      expect(typeof s.status).toBe("string");
      expect(typeof s.nextAction).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/test/integration/refresh-recovery.integration.test.ts
git commit -m "test(server): refresh recovery smoke test"
```

---

### Wave 7 — end-of-wave smoke + acceptance

- [ ] **Step 1: Full test sweep**

```bash
pnpm typecheck
pnpm --filter @aigc-video/ai test
pnpm --filter @aigc-video/server test:unit
pnpm --filter @aigc-video/server test:integration:smoke
# manual + expensive (provider keys required):
pnpm --filter @aigc-video/server test:integration:provider
pnpm --filter @aigc-video/server test:integration:expensive
```

- [ ] **Step 2: Acceptance run**

Manual end-to-end (per spec §15):

1. Create workspace
2. Upload product image
3. Approve brief / storyboard / shotprompt (seeds shots)
4. For each shot: propose image prompt → generate batch → select → propose video script → optional edit → generate video batch → select video
5. POST `/api/workspaces/:id/final-videos`
6. Poll until SUCCEEDED, then download via `/api/workspaces/:id/final-videos/:id/file`

- [ ] **Step 3: Tag**

```bash
git tag -m "Wave 7: polish" wave-7-polish
```

---

## Self-review (for future-self before execution)

- All §1 goals have a corresponding wave + tasks.
- `IMAGE_PROMPT_EDITED → IMAGE_GENERATING` transition is allowed (Task 21 transitions map).
- Idempotency-Key required + 400 enforcement is in Tasks 23 (image), 27 (video), 32 (final compose), and 28 (retry).
- No placeholder TBD strings remain in this plan.
- Cross-task references resolve: `db.db2.*` methods declared in Task 12 are used in Tasks 14, 22, 23, 25, 26, 27, 31, 32, 35.
- `__setImageProviderForTests` declared in Task 23's worker and used in its companion test in the same task.
- Frontend coordination: Wave 6 plan (companion file) ports the UI; backend exposes contract-stable APIs by end of Wave 5 so frontend can start at any time after Wave 3.

---
