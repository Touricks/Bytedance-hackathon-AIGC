# Per-Shot Pipeline — Gap Closure Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/0528-agent-arc/spec/2026-05-28-storyboard-image-video-pipeline-design-r2.md` (§10 Open gaps)

**Companion:** `docs/0528-agent-arc/plans/2026-05-28-storyboard-image-video-pipeline-backend.md` (original Waves 1–7, all merged on `main`)

**Goal:** Close the four open gaps surfaced after Waves 1–7 of r1 merged:

1. No script proves the configured `.env` produces working text/image/video calls.
2. The image worker passes empty `referenceImageUrls[]` — user-uploaded product images are never sent to the model.
3. The 5 committed integration tests are placeholder scaffolding (wrong workspace POST envelope, hardcoded `shotId="shot-1"`, missing `TEST_FIXTURE_WORKSPACE`).
4. The integration test runner does not source `.env`.

**Out of scope:**
- New modules, schema changes, new agent prompts, new frontend features.
- Crossfades / BGM / TTS / subtitles for final compose.
- Per-shot insert / delete / reorder after seeding.
- Anything else listed in r2 §11 (Deferred).

**Tech stack:** unchanged from r1 plan — Node 22 · TypeScript · Fastify · Postgres (`pg`) · BullMQ + ioredis (optional) · OpenAI Agents SDK · Zod · `node:test` + `tsx` · ffmpeg.

**Branching:** single feature branch `gap-closure/per-shot-pipeline` off current `main` (tip `8198440` at time of writing). Merge back via `--no-ff` merge commit when all waves green.

**Estimated effort:** ~7 hours focused work (Waves 1+2: 2.5 h, Wave 3 seed helper is the bulk at 3–4 h, Wave 4: 1 h).

---

## File map

New files:

```
apps/server/scripts/smoke-providers.ts                                    (Wave 1 Task 1)
apps/server/test/integration/provider-smoke.integration.test.ts            (Wave 1 Task 2)

apps/server/src/modules/material/asset-url-resolver.ts                     (Wave 2 Task 1)
apps/server/src/modules/material/asset-url-resolver.unit.test.ts           (Wave 2 Task 1)

apps/server/test/helpers/seed-workspace.ts                                 (Wave 3 Task 1)
apps/server/test/helpers/fixtures/red-apple.png                            (Wave 3 Task 1; small inline PNG asset)
```

Modified files:

```
apps/server/package.json                                                   (Wave 1, Wave 3)
apps/server/src/modules/generation/image.worker.ts                        (Wave 2 Task 2)
apps/server/src/modules/generation/image.worker.unit.test.ts              (Wave 2 Task 2)
apps/server/test/integration/image-flow.integration.test.ts               (Wave 3 Task 3)
apps/server/test/integration/video-flow.integration.test.ts               (Wave 3 Task 4)
apps/server/test/integration/final-compose.integration.test.ts            (Wave 4 Task 1)
apps/server/test/integration/final-compose-contract.integration.test.ts   (Wave 4 Task 2)
apps/server/test/integration/refresh-recovery.integration.test.ts         (Wave 4 Task 3)
```

No file deletions.

---

## Conventions

- **Test framework:** `node --test` + `tsx`. Run an individual file with `node --import tsx --test path/to/file.test.ts`.
- **TDD:** failing test → run to see failure → minimal implementation → run to see pass → commit. Each task ends with one conventional-commit commit.
- **Commit hygiene:** Never use `--no-verify`.
- **DB transactions:** wrap multi-statement writes in `pool.connect()` + `client.query("begin")` / `commit` / `rollback`. See the existing `createImagePromptVersionAtomic` pattern.
- **Trace events:** new workers and helpers continue to write via `traceService.record(...)`. Provider-boundary contract still applies to `final-compose.worker.ts`.
- **No mocking providers in integration scope.** Mocks only for unit tests.

---

## WAVE 1 — Provider connectivity (2 tasks, ~1 hour)

Purpose: confirm the `.env` on the host can actually reach Ark text + image and Seedance video before investing in test fixtures. This wave catches credential / endpoint-id / network problems early.

### Task 1: smoke-providers.ts script

**Files:**
- Create: `apps/server/scripts/smoke-providers.ts`
- Modify: `apps/server/package.json` (add `smoke:providers` script)

- [ ] **Step 1: Write the script**

`apps/server/scripts/smoke-providers.ts`:

```ts
#!/usr/bin/env tsx
import {
  resolveTextProviderConfig,
  resolveImageProviderConfig,
  resolveVideoProviderConfig,
  generateImagesWithArk,
  generateVideoWithSeedance,
  generateTextWithArk,
  maskSecret,
} from "@aigc-video/ai";

type Result = { name: string; ok: boolean; detail: string };

async function probeText(): Promise<Result> {
  const cfg = resolveTextProviderConfig();
  if (!cfg) return { name: "text", ok: false, detail: "TEXT_* env not set" };
  try {
    const r = await generateTextWithArk(
      { prompt: "smoke", content: "Reply with the single word OK." },
      cfg,
    );
    return { name: "text", ok: true, detail: `model=${cfg.endpointId} output=${r.output.slice(0, 30)}` };
  } catch (e) {
    return { name: "text", ok: false, detail: (e as Error).message.slice(0, 200) };
  }
}

async function probeImage(): Promise<Result> {
  const cfg = resolveImageProviderConfig();
  if (!cfg) return { name: "image", ok: false, detail: "IMAGE_* env not set" };
  try {
    const r = await generateImagesWithArk(
      { prompt: "a single red apple on a white background, studio lighting", count: 1, aspectRatio: "1:1" },
      cfg,
    );
    const url = r.candidates[0]?.imageUrl;
    return { name: "image", ok: Boolean(url), detail: url ? `url=${url.slice(0, 80)}…` : "no candidate returned" };
  } catch (e) {
    return { name: "image", ok: false, detail: (e as Error).message.slice(0, 200) };
  }
}

async function probeVideo(seedImageUrl: string | null): Promise<Result> {
  const cfg = resolveVideoProviderConfig();
  if (!cfg) return { name: "video", ok: false, detail: "VIDEO_* env not set" };
  if (!seedImageUrl) return { name: "video", ok: false, detail: "skipped — image probe did not produce a URL" };
  try {
    const r = await generateVideoWithSeedance(
      {
        imageUrl: seedImageUrl,
        prompt: "A 4-second slow push-in on a single red apple",
        durationSec: 4,
        aspectRatio: "1:1",
        generateAudio: false,
      },
      cfg,
    );
    return { name: "video", ok: Boolean(r.videoUrl), detail: r.videoUrl ? `url=${r.videoUrl.slice(0, 80)}…` : "no video url" };
  } catch (e) {
    return { name: "video", ok: false, detail: (e as Error).message.slice(0, 200) };
  }
}

async function main() {
  console.log(`[smoke-providers] TEXT_API_KEY=${maskSecret(process.env.TEXT_API_KEY ?? "")}`);
  console.log(`[smoke-providers] IMAGE_API_KEY=${maskSecret(process.env.IMAGE_API_KEY ?? "")}`);
  console.log(`[smoke-providers] VIDEO_API_KEY=${maskSecret(process.env.VIDEO_API_KEY ?? "")}`);

  const text = await probeText();
  console.log(`[smoke-providers] ${text.ok ? "✓" : "✗"} text — ${text.detail}`);

  const image = await probeImage();
  console.log(`[smoke-providers] ${image.ok ? "✓" : "✗"} image — ${image.detail}`);

  const seedUrl = image.ok ? image.detail.match(/url=(https?:\/\/[^…]+)/)?.[1] ?? null : null;
  const video = await probeVideo(seedUrl);
  console.log(`[smoke-providers] ${video.ok ? "✓" : "✗"} video — ${video.detail}`);

  if (!text.ok || !image.ok || !video.ok) process.exit(1);
}

main().catch((e) => {
  console.error("[smoke-providers] unexpected error", e);
  process.exit(2);
});
```

- [ ] **Step 2: Add the script to package.json**

Edit `apps/server/package.json` `scripts`:

```json
"smoke:providers": "tsx scripts/smoke-providers.ts"
```

- [ ] **Step 3: Run it**

```bash
set -a; source .env; set +a
pnpm --filter @aigc-video/server smoke:providers
```

Expected: three `✓` lines (one per provider) with masked keys and result URLs.

If any fails: inspect the masked key + the detail message. Common issues:
- Endpoint id not enabled for the model in Ark console.
- Network reachability to `ark.cn-beijing.volces.com`.
- Wrong region in `*_BASE_URL`.

Do NOT proceed to Wave 2 if any probe fails — fix `.env` first.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/smoke-providers.ts apps/server/package.json
git commit -m "feat(server): smoke:providers script verifies text/image/video env"
```

---

### Task 2: provider-smoke integration test

**Files:**
- Create: `apps/server/test/integration/provider-smoke.integration.test.ts`

This wraps Task 1's logic in a `node:test` integration suite so CI / nightly can run it.

- [ ] **Step 1: Write the test**

```ts
// @smoke — runs three real-provider probes; no fixture workspace required.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTextProviderConfig,
  resolveImageProviderConfig,
  resolveVideoProviderConfig,
  generateImagesWithArk,
  generateVideoWithSeedance,
  generateTextWithArk,
} from "@aigc-video/ai";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";

describe("provider smoke @smoke", { skip: !RUN }, () => {
  it("text provider produces non-empty output", async () => {
    const cfg = resolveTextProviderConfig();
    assert.ok(cfg, "TEXT_* env not set");
    const r = await generateTextWithArk({ prompt: "smoke", content: "Reply OK." }, cfg!);
    assert.ok(r.output.trim().length > 0, `empty output: ${JSON.stringify(r)}`);
  });

  it("image provider returns at least one URL", async (t) => {
    const cfg = resolveImageProviderConfig();
    assert.ok(cfg, "IMAGE_* env not set");
    const r = await generateImagesWithArk(
      { prompt: "a single red apple, studio lighting", count: 1, aspectRatio: "1:1" },
      cfg!,
    );
    const url = r.candidates[0]?.imageUrl;
    assert.ok(url && /^https?:\/\//.test(url), `bad candidate: ${JSON.stringify(r)}`);
    (t as unknown as { context?: { imageUrl?: string } }).context = { imageUrl: url };
  });

  it("video provider returns a video URL (uses public seed image)", async () => {
    const cfg = resolveVideoProviderConfig();
    assert.ok(cfg, "VIDEO_* env not set");
    // Use a small public domain image as seed to keep this test independent of the image probe.
    const seedUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/256px-Red_Apple.jpg";
    const r = await generateVideoWithSeedance(
      { imageUrl: seedUrl, prompt: "A 4-second slow push-in on the apple", durationSec: 4, aspectRatio: "1:1", generateAudio: false },
      cfg!,
    );
    assert.ok(r.videoUrl && /^https?:\/\//.test(r.videoUrl), `bad video: ${JSON.stringify(r)}`);
  });
});
```

- [ ] **Step 2: Run**

```bash
set -a; source .env; set +a
RUN_REAL_PROVIDER_TESTS=true pnpm --filter @aigc-video/server test:integration:smoke
```

Expected: 3 passed (text, image, video). The video test may take 1–3 min.

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/integration/provider-smoke.integration.test.ts
git commit -m "test(server): provider-smoke integration probes text/image/video"
```

---

## WAVE 2 — Asset URL resolution (2 tasks, ~1.5 hours)

Purpose: close the r2 §7 image-worker gap. User-uploaded product images become reachable to the image model.

### Task 3: asset-url-resolver

**Files:**
- Create: `apps/server/src/modules/material/asset-url-resolver.ts`
- Create: `apps/server/src/modules/material/asset-url-resolver.unit.test.ts`

- [ ] **Step 1: Write failing test**

`apps/server/src/modules/material/asset-url-resolver.unit.test.ts`:

```ts
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createAssetUrlResolver } from "./asset-url-resolver.js";

describe("createAssetUrlResolver", () => {
  it("passes through https URLs", async () => {
    const lookup = mock.fn(async (id: string) => ({ id, url: `https://cdn.example/${id}.png`, mime: "image/png" }));
    const readFile = mock.fn(async () => Buffer.from(""));
    const resolver = createAssetUrlResolver({ lookup, readFile });
    const urls = await resolver(["a1"]);
    assert.deepEqual(urls, ["https://cdn.example/a1.png"]);
    assert.equal(readFile.mock.callCount(), 0);
  });

  it("converts local files to data URLs", async () => {
    const lookup = mock.fn(async (id: string) => ({
      id,
      url: `file:///workspace/.daireel/materials/${id}.jpg`,
      localPath: `/workspace/.daireel/materials/${id}.jpg`,
      mime: "image/jpeg",
    }));
    const readFile = mock.fn(async () => Buffer.from("FAKE_JPEG_BYTES"));
    const resolver = createAssetUrlResolver({ lookup, readFile });
    const urls = await resolver(["a2"]);
    assert.equal(urls.length, 1);
    assert.ok(urls[0]!.startsWith("data:image/jpeg;base64,"));
    assert.equal(readFile.mock.callCount(), 1);
  });

  it("drops unknown ids without throwing", async () => {
    const lookup = mock.fn(async () => null);
    const readFile = mock.fn(async () => Buffer.from(""));
    const resolver = createAssetUrlResolver({ lookup, readFile });
    const urls = await resolver(["missing"]);
    assert.deepEqual(urls, []);
  });

  it("returns empty array for empty input", async () => {
    const resolver = createAssetUrlResolver({
      lookup: mock.fn(async () => null),
      readFile: mock.fn(async () => Buffer.from("")),
    });
    assert.deepEqual(await resolver([]), []);
  });
});
```

Run: `pnpm --filter @aigc-video/server test`. Expected FAIL — module not found.

- [ ] **Step 2: Implement**

`apps/server/src/modules/material/asset-url-resolver.ts`:

```ts
import { readFile as fsReadFile } from "node:fs/promises";
import { db } from "../../db/client.js";
import { logger } from "../../common/logger.js";

export interface AssetLookupResult {
  id: string;
  url: string;
  localPath?: string;
  mime?: string;
}

export interface AssetUrlResolverDeps {
  lookup: (id: string) => Promise<AssetLookupResult | null>;
  readFile: (path: string) => Promise<Buffer>;
}

const DEFAULT_LOOKUP: AssetUrlResolverDeps["lookup"] = async (id) => {
  const row = await db.getAsset(id);  // existing V1 method on apps/server/src/db/client.ts
  if (!row) return null;
  const mime = (row.metadata as Record<string, unknown> | null)?.mimeType as string | undefined;
  // Asset url can be either an HTTPS URL, a file:// URL, or a local path under storage/uploads or .daireel/materials.
  if (row.url.startsWith("file://")) {
    return { id, url: row.url, localPath: row.url.replace(/^file:\/\//, ""), mime };
  }
  if (row.url.startsWith("http://") || row.url.startsWith("https://")) {
    return { id, url: row.url, mime };
  }
  // Treat as a local path.
  return { id, url: row.url, localPath: row.url, mime };
};

export function createAssetUrlResolver(deps: AssetUrlResolverDeps = { lookup: DEFAULT_LOOKUP, readFile: fsReadFile }) {
  return async function resolveAssetUrls(assetIds: string[]): Promise<string[]> {
    if (assetIds.length === 0) return [];
    const out: string[] = [];
    for (const id of assetIds) {
      const asset = await deps.lookup(id);
      if (!asset) {
        logger.warn("asset-url-resolver: unknown asset id", { id });
        continue;
      }
      if (asset.url.startsWith("https://") || asset.url.startsWith("http://")) {
        out.push(asset.url);
        continue;
      }
      if (asset.localPath) {
        try {
          const bytes = await deps.readFile(asset.localPath);
          const mime = asset.mime ?? "image/png";
          out.push(`data:${mime};base64,${bytes.toString("base64")}`);
        } catch (err) {
          logger.warn("asset-url-resolver: failed to read local file", { id, path: asset.localPath, err: String(err) });
        }
        continue;
      }
      logger.warn("asset-url-resolver: asset has no usable url", { id });
    }
    return out;
  };
}

export const resolveAssetUrls = createAssetUrlResolver();
```

Run: `pnpm --filter @aigc-video/server test`. Expected PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/material/asset-url-resolver.ts apps/server/src/modules/material/asset-url-resolver.unit.test.ts
git commit -m "feat(server): assetUrlResolver maps reference asset ids to URLs / data URLs"
```

---

### Task 4: wire into image.worker.ts

**Files:**
- Modify: `apps/server/src/modules/generation/image.worker.ts`
- Modify: `apps/server/src/modules/generation/image.worker.unit.test.ts`

- [ ] **Step 1: Update worker**

In `image.worker.ts`:

1. Add import:
   ```ts
   import { resolveAssetUrls } from "../material/asset-url-resolver.js";
   ```
2. Add a test override hook next to the existing `__setImageProviderForTests`:
   ```ts
   let resolveAssetUrlsOverride: ((ids: string[]) => Promise<string[]>) | undefined;
   export function __setAssetUrlResolverForTests(fn: ((ids: string[]) => Promise<string[]>) | undefined) {
     resolveAssetUrlsOverride = fn;
   }
   ```
3. In `processGenerateImages`, replace the `referenceImageUrls: []` line with:
   ```ts
   const resolver = resolveAssetUrlsOverride ?? resolveAssetUrls;
   const referenceImageUrls = await resolver(artifact.referenceAssetIds);
   ```
   and pass `referenceImageUrls` into `generateImagesWithArk`.
4. Optionally surface `result.candidateErrors` into the failed-candidate insert loop (write the provider's `code`/`message` into `errorMessage` instead of the generic `"provider_returned_short"` when available).

- [ ] **Step 2: Extend the unit test**

In `image.worker.unit.test.ts`, add:

```ts
it("passes resolved reference image URLs to the provider", async () => {
  const seenArgs: unknown[] = [];
  __setImageProviderForTests(async (args) => {
    seenArgs.push(args);
    return { provider: "ark-seedream", model: "test", candidates: [{ imageUrl: "u" }], candidateErrors: [] };
  });
  __setAssetUrlResolverForTests(async () => ["https://r/1.png", "https://r/2.png"]);

  const fakeDb = makeFakeDb();
  const ctx = await fakeDb.bootstrap("PENDING");
  await processGenerateImages(
    { ...ctx.jobData, count: 1 },
    {
      ...fakeDb.adapter as any,
      getImagePromptArtifact: async () => ({
        id: "art-1", promptText: "p", negativePrompt: null, referenceAssetIds: ["a1", "a2"],
      }),
    } as any,
  );
  assert.deepEqual((seenArgs[0] as any).referenceImageUrls, ["https://r/1.png", "https://r/2.png"]);
  __setAssetUrlResolverForTests(undefined);
});
```

Run: `pnpm --filter @aigc-video/server test`. Expected PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/generation/image.worker.ts apps/server/src/modules/generation/image.worker.unit.test.ts
git commit -m "feat(server): image worker resolves reference asset URLs before provider call"
```

---

## WAVE 3 — Test fixture helper + harness (4 tasks, ~3–4 hours)

Purpose: turn the 5 placeholder integration tests into real end-to-end exercises by adding a single seed-workspace helper that drives the upstream brief→storyboard→shotprompt flow with real providers.

### Task 5: seed-workspace helper

**Files:**
- Create: `apps/server/test/helpers/seed-workspace.ts`
- Create: `apps/server/test/helpers/fixtures/red-apple.png` (a small ≥14×14 PNG — minimum size the image API accepts)

- [ ] **Step 1: Add the PNG fixture**

Generate a tiny 64×64 solid red PNG and commit it under `apps/server/test/helpers/fixtures/red-apple.png`. Example (run once to produce the file):

```bash
mkdir -p apps/server/test/helpers/fixtures
node -e "
const fs = require('fs');
const { PNG } = require('pngjs'); // already a transitive dep; if not, use a literal 64x64 hex PNG
const png = new PNG({ width: 64, height: 64 });
for (let i = 0; i < png.data.length; i += 4) { png.data[i]=220; png.data[i+1]=20; png.data[i+2]=20; png.data[i+3]=255; }
fs.writeFileSync('apps/server/test/helpers/fixtures/red-apple.png', PNG.sync.write(png));
"
```

Or, if `pngjs` isn't present, commit a literal 64×64 red PNG. (Acceptance: file size ~300 bytes, opens in any viewer as a red square.)

- [ ] **Step 2: Write the helper**

`apps/server/test/helpers/seed-workspace.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./api-client.js";
import { pollUntil } from "./poll.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface SeededWorkspace {
  workspaceId: string;
  localPath: string;
  scriptId: string;
  materialAssetIds: string[];
  shotIds: string[];     // sorted by order_index
  cleanup(): Promise<void>;
}

export interface SeedWorkspaceOptions {
  label?: string;
  /** Override the user-intent string the brief workflow sees. Defaults to a generic office-worker apple demo. */
  intent?: string;
}

/**
 * Drives the full upstream V1 flow against the running server (TEST_API_BASE_URL):
 *   POST /api/workspaces -> upload one material -> brief/propose+approve ->
 *   storyboard/propose+approve -> shotprompt/compile+approve -> GET /api/workspaces/:id/shots
 *
 * Returns the workspace + the seeded shot ids in order. Use cleanup() in afterAll().
 *
 * Requires real text + image provider env (the workflows call real Ark).
 */
export async function seedWorkspace(options: SeedWorkspaceOptions = {}): Promise<SeededWorkspace> {
  const label = options.label ?? `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const intent = options.intent ?? "Make an office-worker UGC demo featuring a red apple snack";

  // 1) Create the workspace (V1 envelope: { workspace, manifest })
  const ws = await api<{ workspace: { id: string; localPath: string; currentScriptId: string } }>(
    "/api/workspaces",
    { method: "POST", body: JSON.stringify({ name: label, intent }) },
  );
  const workspaceId = ws.workspace.id;
  const scriptId = ws.workspace.currentScriptId;

  // 2) Upload one material (red apple PNG)
  const pngBytes = await readFile(path.join(here, "fixtures", "red-apple.png"));
  const dataBase64 = pngBytes.toString("base64");
  const materialRes = await api<{ asset: { id: string } }>(
    "/api/workspaces/materials",
    { method: "POST", body: JSON.stringify({ workspaceId, filename: "red-apple.png", dataBase64 }) },
  );
  const materialAssetIds = [materialRes.asset.id];

  // 3) Material intake + brief
  await api(`/api/workspaces/material/intake`, { method: "POST", body: JSON.stringify({ workspaceId }) });
  const brief = await api<{ artifact: { id: string } }>(
    `/api/workspaces/brief/propose`,
    { method: "POST", body: JSON.stringify({ workspaceId }) },
  );
  await api(`/api/workspaces/brief/approve`, {
    method: "POST",
    body: JSON.stringify({ workspaceId, artifactId: brief.artifact.id }),
  });

  // 4) Storyboard
  const storyboard = await api<{ artifact: { id: string } }>(
    `/api/workspaces/storyboard/propose`,
    { method: "POST", body: JSON.stringify({ workspaceId }) },
  );
  await api(`/api/workspaces/storyboard/approve`, {
    method: "POST",
    body: JSON.stringify({ workspaceId, artifactId: storyboard.artifact.id }),
  });

  // 5) Shotprompt — compile is deterministic, approve seeds storyboard_shots
  const shotprompt = await api<{ artifact: { id: string } }>(
    `/api/workspaces/shotprompt/compile`,
    { method: "POST", body: JSON.stringify({ workspaceId }) },
  );
  await api(`/api/workspaces/shotprompt/approve`, {
    method: "POST",
    body: JSON.stringify({ workspaceId, artifactId: shotprompt.artifact.id }),
  });

  // 6) Read seeded shots
  const shots = await api<{ data: Array<{ id: string; orderIndex: number }> }>(
    `/api/workspaces/${workspaceId}/shots`,
  );
  const shotIds = shots.data
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((s) => s.id);

  return {
    workspaceId,
    localPath: ws.workspace.localPath,
    scriptId,
    materialAssetIds,
    shotIds,
    cleanup: async () => {
      if (!process.env.ALLOW_TEST_CLEANUP && process.env.NODE_ENV !== "test") return;
      // Best-effort. The cleanup endpoint matches workspaceId by suffix.
      await fetch(`${process.env.TEST_API_BASE_URL}/api/test-runs/${workspaceId}`, { method: "DELETE" });
    },
  };
}

/**
 * Convenience: seed a workspace AND advance the first shot through image-prompt → batch → select.
 * Returns the shot id and the selected image candidate id.
 *
 * Used by video-flow / final-compose tests.
 */
export async function seedShotWithSelectedImage(
  ws: SeededWorkspace,
  shotIdx = 0,
): Promise<{ shotId: string; imageCandidateId: string; imageGenerationBatchId: string; imagePromptArtifactId: string }> {
  const shotId = ws.shotIds[shotIdx];
  if (!shotId) throw new Error(`no shot at index ${shotIdx}`);

  const proposal = await api<{ data: { id: string } }>(
    `/api/workspaces/${ws.workspaceId}/shots/${shotId}/image-prompts/propose`,
    { method: "POST", body: JSON.stringify({ referenceAssetIds: ws.materialAssetIds }) },
  );

  const batch = await api<{ data: { batchId: string } }>(
    `/api/shots/${shotId}/image-batches`,
    {
      method: "POST",
      headers: { "Idempotency-Key": `seed-${shotId}-${Date.now()}` },
      body: JSON.stringify({ imagePromptArtifactId: proposal.data.id, count: 2, aspectRatio: "9:16" }),
    },
  );

  const final = await pollUntil({
    label: `image batch ${batch.data.batchId}`,
    intervalMs: 3000,
    timeoutMs: 4 * 60_000,
    fetcher: () =>
      api<{ data: { status: string; candidates: Array<{ id: string; imageUrl: string }> } }>(
        `/api/shots/${shotId}/image-batches/${batch.data.batchId}`,
      ),
    isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
  });
  const pick = final.data.candidates.find((c) => c.imageUrl);
  if (!pick) throw new Error(`no usable candidate in batch ${batch.data.batchId}`);

  await api(`/api/shots/${shotId}/selected-image`, {
    method: "POST",
    body: JSON.stringify({ imageCandidateId: pick.id, imageGenerationBatchId: batch.data.batchId }),
  });

  return {
    shotId,
    imageCandidateId: pick.id,
    imageGenerationBatchId: batch.data.batchId,
    imagePromptArtifactId: proposal.data.id,
  };
}
```

**Verify upstream API shapes before committing.** The shapes above assume:
- `POST /api/workspaces` body `{name, intent}` returns `{workspace: {id, localPath, currentScriptId}, manifest}`.
- `POST /api/workspaces/materials` body `{workspaceId, filename, dataBase64}` returns `{asset: {id}, materials?}`.
- `POST /api/workspaces/material/intake`, `brief/propose`/`approve`, `storyboard/propose`/`approve`, `shotprompt/compile`/`approve` all accept `{workspaceId, ...}` bodies.

Open `apps/server/src/modules/workspace/workspace.controller.ts` and confirm each request body schema + response shape; adjust the helper's `api<{...}>(...)` typings and payloads to match. If `material/intake` is a side-effect of `materials POST` rather than a separate endpoint, drop the call.

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/helpers/seed-workspace.ts apps/server/test/helpers/fixtures/red-apple.png
git commit -m "test(server): seed-workspace helper drives upstream V1 flow + per-shot select"
```

---

### Task 6: harness env loading

**Files:**
- Modify: `apps/server/package.json` (integration test scripts)

The test runner doesn't auto-load `.env`. Two options were considered; this plan picks Option A (cross-platform shell prefix).

- [ ] **Step 1: Add a `.env`-loading wrapper script**

There's no portable POSIX one-liner for `source .env` inside an npm script (it depends on the user's shell). Add a tiny Node loader instead.

Create `apps/server/scripts/load-env-then.ts`:

```ts
#!/usr/bin/env tsx
// Load .env from the repo root, then exec the rest of argv as a command.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), "../../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
const [, , cmd, ...args] = process.argv;
const r = spawnSync(cmd!, args, { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
```

- [ ] **Step 2: Prefix the integration scripts**

In `apps/server/package.json`:

```json
"test:integration:smoke":      "tsx scripts/load-env-then.ts node --import tsx --test --test-concurrency=1 \"test/integration/**/*.integration.test.ts\"",
"test:integration:provider":   "tsx scripts/load-env-then.ts node --import tsx --test --test-concurrency=1 \"test/integration/**/*.integration.test.ts\"",
"test:integration:expensive":  "tsx scripts/load-env-then.ts node --import tsx --test --test-concurrency=1 \"test/integration/**/*.integration.test.ts\""
```

Set the gate flags inside `load-env-then.ts` too (or keep them out and pass via the shell). Simplest: set them in the scripts:

```json
"test:integration:smoke":      "RUN_REAL_PROVIDER_TESTS=true TEST_API_BASE_URL=${TEST_API_BASE_URL:-http://localhost:3000} tsx scripts/load-env-then.ts node --import tsx --test --test-concurrency=1 \"test/integration/**/*.integration.test.ts\"",
```

(Use the same pattern for `:provider` and `:expensive`, adding `ALLOW_EXPENSIVE_TESTS=true` to expensive.)

Verify with the provider-smoke test from Wave 1 Task 2:

```bash
# server must already be running
pnpm --filter @aigc-video/server test:integration:smoke
```

Expected: provider-smoke passes without needing `source .env` manually.

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/load-env-then.ts apps/server/package.json
git commit -m "test(server): integration scripts auto-load .env via load-env-then.ts"
```

---

### Task 7: rewrite image-flow integration test

**Files:**
- Modify: `apps/server/test/integration/image-flow.integration.test.ts`

- [ ] **Step 1: Replace the body**

```ts
// @provider — full image flow against real Ark image API, seeded via the upstream V1 flow.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";
import { seedWorkspace, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";

describe("image flow @provider", { skip: !RUN }, () => {
  let ws: SeededWorkspace;
  before(async () => { ws = await seedWorkspace({ label: `it-img-${Date.now()}` }); });
  after(async () => { await ws?.cleanup(); });

  it("propose prompt -> generate 3 candidates -> select first", async () => {
    const shotId = ws.shotIds[0];
    assert.ok(shotId, "seeded workspace had no shots");

    const proposal = await api<{ data: { id: string; promptText: string } }>(
      `/api/workspaces/${ws.workspaceId}/shots/${shotId}/image-prompts/propose`,
      { method: "POST", body: JSON.stringify({ referenceAssetIds: ws.materialAssetIds, userHint: "warm office lighting" }) },
    );
    assert.ok(proposal.data.promptText.length > 20);

    const batch = await api<{ data: { batchId: string } }>(
      `/api/shots/${shotId}/image-batches`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `it-${shotId}-${Date.now()}` },
        body: JSON.stringify({ imagePromptArtifactId: proposal.data.id, count: 3, aspectRatio: "9:16" }),
      },
    );

    const final = await pollUntil({
      label: "image batch",
      intervalMs: 3000,
      timeoutMs: 4 * 60_000,
      fetcher: () =>
        api<{ data: { status: string; succeededCount: number; candidates: Array<{ id: string; imageUrl: string; status: string }> } }>(
          `/api/shots/${shotId}/image-batches/${batch.data.batchId}`,
        ),
      isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
    });

    assert.notEqual(final.data.status, "FAILED");
    assert.ok(final.data.succeededCount >= 1);
    const pick = final.data.candidates.find((c) => c.status === "SUCCEEDED" && c.imageUrl);
    assert.ok(pick && /^https?:\/\//.test(pick.imageUrl));

    const sel = await api<{ shotStatus: string }>(
      `/api/shots/${shotId}/selected-image`,
      { method: "POST", body: JSON.stringify({ imageCandidateId: pick!.id, imageGenerationBatchId: batch.data.batchId }) },
    );
    assert.equal(sel.shotStatus, "IMAGE_SELECTED");
  });
});
```

- [ ] **Step 2: Run**

```bash
# server must be running with real .env
pnpm --filter @aigc-video/server test:integration:provider
```

Expected: 1 passed (image flow). Takes ~3–6 minutes (upstream brief/storyboard/shotprompt + 3-image batch).

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/integration/image-flow.integration.test.ts
git commit -m "test(server): image-flow integration test uses seed-workspace helper"
```

---

### Task 8: rewrite video-flow integration test

**Files:**
- Modify: `apps/server/test/integration/video-flow.integration.test.ts`

- [ ] **Step 1: Replace the body**

```ts
// @expensive — full video flow; per-video takes ~1–5 min, so this suite can take 5–15 min.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";
import { seedWorkspace, seedShotWithSelectedImage, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";
const ALLOW = process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("video flow @expensive", { skip: !RUN || !ALLOW }, () => {
  let ws: SeededWorkspace;
  let ctx: Awaited<ReturnType<typeof seedShotWithSelectedImage>>;

  before(async () => {
    ws = await seedWorkspace({ label: `it-vid-${Date.now()}` });
    ctx = await seedShotWithSelectedImage(ws, 0);
  });
  after(async () => { await ws?.cleanup(); });

  it("propose script -> generate 2 candidates -> select first", async () => {
    const script = await api<{ data: { id: string; durationSec: number } }>(
      `/api/workspaces/${ws.workspaceId}/shots/${ctx.shotId}/video-scripts/propose`,
      { method: "POST", body: JSON.stringify({ durationSec: 4, useNeighborFrames: true }) },
    );
    assert.equal(script.data.durationSec, 4);

    const batch = await api<{ data: { batchId: string } }>(
      `/api/shots/${ctx.shotId}/video-batches`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `it-vid-${ctx.shotId}-${Date.now()}` },
        body: JSON.stringify({ videoScriptArtifactId: script.data.id, count: 2, aspectRatio: "9:16" }),
      },
    );

    const final = await pollUntil({
      label: "video batch",
      intervalMs: 8000,
      timeoutMs: 15 * 60_000,
      fetcher: () =>
        api<{ data: { status: string; succeededCount: number; candidates: Array<{ id: string; videoUrl: string; status: string }> } }>(
          `/api/shots/${ctx.shotId}/video-batches/${batch.data.batchId}`,
        ),
      isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
    });
    assert.notEqual(final.data.status, "FAILED");
    assert.ok(final.data.succeededCount >= 1);

    const pick = final.data.candidates.find((c) => c.status === "SUCCEEDED" && c.videoUrl);
    assert.ok(pick && /^https?:\/\//.test(pick.videoUrl));

    const sel = await api<{ shotStatus: string }>(
      `/api/shots/${ctx.shotId}/selected-video`,
      { method: "POST", body: JSON.stringify({ videoCandidateId: pick!.id, videoGenerationBatchId: batch.data.batchId }) },
    );
    assert.equal(sel.shotStatus, "VIDEO_SELECTED");
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @aigc-video/server test:integration:expensive
```

Expected: 1 passed (video flow). Takes ~10 min total (seed + image + video).

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/integration/video-flow.integration.test.ts
git commit -m "test(server): video-flow integration test uses seed-workspace + selected image"
```

---

## WAVE 4 — Final compose + refresh recovery (3 tasks, ~1 hour)

### Task 9: rewrite final-compose.integration.test.ts

**Files:**
- Modify: `apps/server/test/integration/final-compose.integration.test.ts`

Drives image + video for **every** seeded shot, then composes. Determinism check stays.

- [ ] **Step 1: Replace the body**

```ts
// @expensive — runs image + video for every shot, then composes. Can take 20–40 min for a 4-shot workspace.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";
import { seedWorkspace, seedShotWithSelectedImage, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";
const ALLOW = process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("final compose @expensive", { skip: !RUN || !ALLOW }, () => {
  let ws: SeededWorkspace;

  before(async () => {
    ws = await seedWorkspace({ label: `it-final-${Date.now()}` });
    // Per-shot: image-select, then video-script + video-batch + select
    for (let i = 0; i < ws.shotIds.length; i++) {
      const ctx = await seedShotWithSelectedImage(ws, i);
      const script = await api<{ data: { id: string } }>(
        `/api/workspaces/${ws.workspaceId}/shots/${ctx.shotId}/video-scripts/propose`,
        { method: "POST", body: JSON.stringify({ durationSec: 4, useNeighborFrames: true }) },
      );
      const batch = await api<{ data: { batchId: string } }>(
        `/api/shots/${ctx.shotId}/video-batches`,
        {
          method: "POST",
          headers: { "Idempotency-Key": `it-final-${ctx.shotId}-${Date.now()}` },
          body: JSON.stringify({ videoScriptArtifactId: script.data.id, count: 1, aspectRatio: "9:16" }),
        },
      );
      const done = await pollUntil({
        label: `video batch shot ${i}`,
        intervalMs: 8000,
        timeoutMs: 15 * 60_000,
        fetcher: () =>
          api<{ data: { status: string; candidates: Array<{ id: string; videoUrl: string; status: string }> } }>(
            `/api/shots/${ctx.shotId}/video-batches/${batch.data.batchId}`,
          ),
        isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
      });
      const pick = done.data.candidates.find((c) => c.status === "SUCCEEDED" && c.videoUrl);
      assert.ok(pick, `shot ${i} produced no video`);
      await api(`/api/shots/${ctx.shotId}/selected-video`, {
        method: "POST",
        body: JSON.stringify({ videoCandidateId: pick!.id, videoGenerationBatchId: batch.data.batchId }),
      });
    }
  });
  after(async () => { await ws?.cleanup(); });

  it("composes and produces a deterministic manifest hash across two runs", async () => {
    async function compose(label: string) {
      const start = await api<{ data: { finalVideoJobId: string } }>(
        `/api/workspaces/${ws.workspaceId}/final-videos`,
        { method: "POST", headers: { "Idempotency-Key": `it-${label}-${Date.now()}` }, body: JSON.stringify({ outputAspectRatio: "9:16" }) },
      );
      const done = await pollUntil({
        label,
        intervalMs: 4000,
        timeoutMs: 10 * 60_000,
        fetcher: () =>
          api<{ data: { status: string; compiledManifestHash: string | null; localUrl: string | null } }>(
            `/api/final-videos/${start.data.finalVideoJobId}`,
          ),
        isDone: (v) => ["SUCCEEDED", "FAILED"].includes(v.data.status),
      });
      assert.equal(done.data.status, "SUCCEEDED");
      assert.ok(done.data.compiledManifestHash?.startsWith("sha256:"));
      return done.data;
    }
    const r1 = await compose("run-1");
    const r2 = await compose("run-2");
    assert.equal(r2.compiledManifestHash, r1.compiledManifestHash, "manifest hash should be deterministic");
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/test/integration/final-compose.integration.test.ts
git commit -m "test(server): final-compose integration runs full per-shot seed + compose + determinism"
```

---

### Task 10: rewrite final-compose-contract.integration.test.ts

**Files:**
- Modify: `apps/server/test/integration/final-compose-contract.integration.test.ts`

Uses the same fixture pattern + checks no provider_call rows during compose.

- [ ] **Step 1: Replace body**

```ts
// @expensive — verifies the final-compose worker emits zero text/image/video provider_call traces.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";
import { seedWorkspace, seedShotWithSelectedImage, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";
const ALLOW = process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("final compose contract @expensive", { skip: !RUN || !ALLOW }, () => {
  let ws: SeededWorkspace;
  let composeStartedAt = 0;
  let composeFinishedAt = 0;

  before(async () => {
    ws = await seedWorkspace({ label: `it-contract-${Date.now()}` });
    // Same per-shot loop as Task 9 — copy as shared helper if you prefer.
    for (let i = 0; i < ws.shotIds.length; i++) {
      const ctx = await seedShotWithSelectedImage(ws, i);
      const script = await api<{ data: { id: string } }>(
        `/api/workspaces/${ws.workspaceId}/shots/${ctx.shotId}/video-scripts/propose`,
        { method: "POST", body: JSON.stringify({ durationSec: 4, useNeighborFrames: true }) },
      );
      const batch = await api<{ data: { batchId: string } }>(
        `/api/shots/${ctx.shotId}/video-batches`,
        {
          method: "POST",
          headers: { "Idempotency-Key": `it-contract-${ctx.shotId}-${Date.now()}` },
          body: JSON.stringify({ videoScriptArtifactId: script.data.id, count: 1, aspectRatio: "9:16" }),
        },
      );
      const done = await pollUntil({
        label: `video batch shot ${i}`,
        intervalMs: 8000,
        timeoutMs: 15 * 60_000,
        fetcher: () =>
          api<{ data: { status: string; candidates: Array<{ id: string; videoUrl: string; status: string }> } }>(
            `/api/shots/${ctx.shotId}/video-batches/${batch.data.batchId}`,
          ),
        isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
      });
      const pick = done.data.candidates.find((c) => c.status === "SUCCEEDED" && c.videoUrl);
      assert.ok(pick);
      await api(`/api/shots/${ctx.shotId}/selected-video`, {
        method: "POST",
        body: JSON.stringify({ videoCandidateId: pick!.id, videoGenerationBatchId: batch.data.batchId }),
      });
    }
  });
  after(async () => { await ws?.cleanup(); });

  it("emits no text/image/video provider_call events during compose", async () => {
    composeStartedAt = Date.now();
    const start = await api<{ data: { finalVideoJobId: string } }>(
      `/api/workspaces/${ws.workspaceId}/final-videos`,
      { method: "POST", headers: { "Idempotency-Key": `it-contract-${Date.now()}` }, body: JSON.stringify({ outputAspectRatio: "9:16" }) },
    );
    await pollUntil({
      label: "final compose",
      intervalMs: 4000,
      timeoutMs: 10 * 60_000,
      fetcher: () => api<{ data: { status: string } }>(`/api/final-videos/${start.data.finalVideoJobId}`),
      isDone: (v) => ["SUCCEEDED", "FAILED"].includes(v.data.status),
    });
    composeFinishedAt = Date.now();

    const traces = await api<{ data: Array<{ traceType: string; name: string; createdAt: string; metadata: Record<string, unknown> }> }>(
      `/api/workspaces/${ws.workspaceId}/traces?limit=500`,
    );
    const duringCompose = traces.data.filter((t) => {
      const ts = new Date(t.createdAt).getTime();
      return ts >= composeStartedAt && ts <= composeFinishedAt + 5_000;
    });
    const offendingProviderCalls = duringCompose.filter(
      (t) => t.traceType === "provider_call" &&
        ["ark", "ark-seedream", "seedance"].includes(String(t.metadata.provider ?? "")),
    );
    assert.equal(offendingProviderCalls.length, 0, `unexpected provider_call rows: ${JSON.stringify(offendingProviderCalls)}`);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/test/integration/final-compose-contract.integration.test.ts
git commit -m "test(server): final-compose-contract verifies zero provider calls during compose"
```

---

### Task 11: rewrite refresh-recovery.integration.test.ts

**Files:**
- Modify: `apps/server/test/integration/refresh-recovery.integration.test.ts`

Tagged `@smoke` — needs a seeded workspace but stops short of expensive video.

- [ ] **Step 1: Replace body**

```ts
// @smoke — verifies shot-workflow-status carries enough state to resume polling after a refresh.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { seedWorkspace, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";

describe("refresh recovery @smoke", { skip: !RUN }, () => {
  let ws: SeededWorkspace;
  before(async () => { ws = await seedWorkspace({ label: `it-refresh-${Date.now()}` }); });
  after(async () => { await ws?.cleanup(); });

  it("shot-workflow-status returns one row per seeded shot with status + nextAction", async () => {
    const res = await api<{
      data: {
        workspaceId: string;
        shots: Array<{ shotId: string; orderIndex: number; status: string; nextAction: string; activeImageBatchId?: string | null }>;
        canComposeFinalVideo: boolean;
      };
    }>(`/api/workspaces/${ws.workspaceId}/shot-workflow-status`);

    assert.equal(res.data.workspaceId, ws.workspaceId);
    assert.equal(res.data.shots.length, ws.shotIds.length);
    for (const s of res.data.shots) {
      assert.equal(typeof s.status, "string");
      assert.equal(typeof s.nextAction, "string");
    }
    assert.equal(res.data.canComposeFinalVideo, false);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/test/integration/refresh-recovery.integration.test.ts
git commit -m "test(server): refresh-recovery uses seed-workspace; asserts per-shot status shape"
```

---

## End-to-end manual acceptance (after all waves green)

1. `pnpm --filter @aigc-video/server smoke:providers` exits 0.
2. `pnpm --filter @aigc-video/server test:integration:smoke` passes (provider-smoke + refresh-recovery).
3. `pnpm --filter @aigc-video/server test:integration:provider` passes (image-flow).
4. `pnpm --filter @aigc-video/server test:integration:expensive` passes (video-flow + final-compose + final-compose-contract).
5. Open the web UI:
   - Create a workspace, upload product image.
   - Approve brief / storyboard / shotprompt.
   - For each shot: propose image prompt → generate batch → select → propose video script → generate batch → select.
   - Click **合成最终视频** → poll → download `final.mp4`.
   - Verify the MP4 plays end-to-end with the correct shot order.
6. Confirm `apps/web/public` or `apps/web/dist/index.html` references no removed V1 endpoints.

Tick the gap-closure acceptance checklist in r2 §12 once all of the above pass.

---

## Self-review (before merging to main)

- All waves' commits use conventional-commit prefixes (`feat:` / `test:` / `fix:`).
- No `--no-verify`; all husky hooks pass.
- `pnpm typecheck` green; `pnpm lint` clean on all touched files.
- Server unit-test gate (75 + the new ones from Wave 2) still 100% pass.
- AI unit-test gate (71) unchanged.
- Web unit-test gate (18) unchanged.
- `apps/server/scripts/load-env-then.ts` does not clobber explicit env (uses `??=`).
- `seed-workspace.ts` cleanup is best-effort; failures don't break test runs.
- No new runtime dependencies added.
- No schema changes — confirmed.
- No frontend changes — confirmed.

When all of the above is true, merge `gap-closure/per-shot-pipeline` into `main` with a non-FF merge commit:

```bash
git checkout main
git merge --no-ff gap-closure/per-shot-pipeline -m "Merge gap-closure: provider smoke + asset URL resolver + integration fixtures"
```

Then update spec r2 acceptance checklist (§12) ticking the four gap-closure boxes.
