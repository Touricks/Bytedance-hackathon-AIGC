# Storyboard → Image → Video Per-Shot Pipeline — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/0528-agent-arc/spec/2026-05-28-storyboard-image-video-pipeline-design.md` (section 10 "Frontend overhaul").

**Companion plan:** `2026-05-28-storyboard-image-video-pipeline-backend.md`. This frontend plan can be developed in parallel with backend Waves 3-5; backend Waves 1-2 (route surface stubbed at 501) must be merged first so the API contract is fixed.

**Goal:** Replace the current single-script wizard (`apps/web/src/routes/App.tsx`, 1647 lines) with a focus-mode workspace UI — LeftRail (shot list + step ladder + final-compose CTA), a single focused step component in the main area, AssetRail (references + materials), and a collapsible TraceDrawer. The UI is driven entirely by the backend `status` + `nextAction` fields; no client-side workflow inference.

**Architecture:** React 19 + Vite + TypeScript. TanStack Query owns all server state and polling. Zustand owns ephemeral UI state (open drawer, focus selection cache). URL params `?shot=&step=` are the canonical focus state (codec round-trips with the Zustand store on `popstate`). Each "step" component renders one of {`image_prompt`, `image_candidates`, `video_script`, `video_candidates`, `review`, `final_compose`}; only one is mounted at a time. Drag-drop uses HTML5 DnD — no library.

**Tech Stack:** React 19, Vite 6, TypeScript 5.7, TanStack Query 5, Zustand 5, react-hook-form 7, lucide-react. Tests use Node's built-in test runner via `tsx` (matches existing `apps/web/package.json` `test` script) for pure-logic tests; component code is verified manually in a browser and via build/typecheck.

**No new runtime dependencies.** Everything needed is already in `apps/web/package.json`. URL state uses native `window.history` + `popstate`; toasts are inline; no router library.

---

## File map

New files:

```
apps/web/src/features/workspace/WorkspaceLayout.tsx
apps/web/src/features/workspace/TopBar.tsx
apps/web/src/features/workspace/LeftRail/LeftRail.tsx
apps/web/src/features/workspace/LeftRail/ShotList.tsx
apps/web/src/features/workspace/LeftRail/StepLadder.tsx
apps/web/src/features/workspace/LeftRail/FinalComposeCta.tsx
apps/web/src/features/workspace/AssetRail/AssetRail.tsx
apps/web/src/features/workspace/AssetRail/AssetTile.tsx
apps/web/src/features/workspace/AssetRail/QuickUpload.tsx
apps/web/src/features/workspace/Focus/FocusRouter.tsx
apps/web/src/features/workspace/Focus/ImagePromptStep.tsx
apps/web/src/features/workspace/Focus/ImageCandidatesStep.tsx
apps/web/src/features/workspace/Focus/VideoScriptStep.tsx
apps/web/src/features/workspace/Focus/VideoCandidatesStep.tsx
apps/web/src/features/workspace/Focus/ReviewStep.tsx
apps/web/src/features/workspace/Focus/FinalComposeStep.tsx
apps/web/src/features/workspace/Focus/AssetStrip.tsx
apps/web/src/features/workspace/Focus/VersionChips.tsx
apps/web/src/features/workspace/Focus/StaleBanner.tsx
apps/web/src/features/workspace/TraceDrawer/TraceDrawer.tsx
apps/web/src/features/workspace/TraceDrawer/TraceEventRow.tsx
apps/web/src/features/workspace/Toasts/ToastHost.tsx

apps/web/src/features/workspace/state/focusStore.ts
apps/web/src/features/workspace/state/focusStore.test.ts
apps/web/src/features/workspace/state/urlState.ts
apps/web/src/features/workspace/state/urlState.test.ts
apps/web/src/features/workspace/state/stepDerivation.ts
apps/web/src/features/workspace/state/stepDerivation.test.ts

apps/web/src/features/workspace/hooks/useShotWorkflowStatus.ts
apps/web/src/features/workspace/hooks/useImageBatch.ts
apps/web/src/features/workspace/hooks/useVideoBatch.ts
apps/web/src/features/workspace/hooks/useFinalVideo.ts
apps/web/src/features/workspace/hooks/useTraceStream.ts
apps/web/src/features/workspace/hooks/useConfigLimits.ts
apps/web/src/features/workspace/hooks/useShotAssetRefs.ts
apps/web/src/features/workspace/hooks/useVisibilityActive.ts

apps/web/src/lib/api/shots.ts
apps/web/src/lib/api/imagePrompt.ts
apps/web/src/lib/api/imageBatch.ts
apps/web/src/lib/api/imageSelect.ts
apps/web/src/lib/api/videoScript.ts
apps/web/src/lib/api/videoBatch.ts
apps/web/src/lib/api/videoSelect.ts
apps/web/src/lib/api/finalVideo.ts
apps/web/src/lib/api/trace.ts
apps/web/src/lib/api/configLimits.ts
apps/web/src/lib/api/assetRefs.ts
```

Modified files:

```
apps/web/src/main.tsx                            (route switch by pathname)
apps/web/src/routes/App.tsx                      (becomes the workspace list landing only)
apps/web/src/lib/api/client.ts                   (remove legacy single-script wizard API; keep brief/storyboard/shotprompt)
apps/web/src/styles.css                          (3-column grid + step components)
apps/web/src/demo-readiness.test.ts              (rewritten or removed)
```

Deleted files:

```
apps/web/src/lib/job/useGenerationJob.ts
apps/web/src/features/creation/JobProgress.tsx
apps/web/src/features/creation/VideoPreview.tsx
```

---

## Conventions used throughout

- **Tests:** existing repo pattern is `node --import tsx --test "src/**/*.test.ts"`. Pure-logic modules (URL codec, focus store, step derivation) have `*.test.ts` files alongside them. Components are verified by `pnpm --filter @aigc-video/web build` + manual browser smoke; no DOM testing library is added.
- **TanStack Query polling:** server state lives in queries with `refetchInterval` driven by an active-jobs flag and tab visibility. Mutations call `queryClient.invalidateQueries(...)` on success; on critical transitions (e.g. user-selects-image) the mutation manually updates the cache to remove a one-tick flicker.
- **URL state:** `?shot=<shotId>&step=<step>` is canonical. The Zustand store mirrors it for ergonomics; both update each other.
- **Styling:** extend the existing `styles.css` (it already uses plain CSS). Naming convention is BEM-ish (`.workspace-layout`, `.left-rail__shot-list`, etc.). No CSS framework added.
- **Commits:** conventional commits; one logical commit per task. Husky pre-commit runs prettier.
- **Workspace UI text:** existing copy is Chinese (`选择工作目录` etc.). Match that tone — Chinese labels for user-facing text, English for code/identifiers.

---

## Coordination with backend

- **Backend prerequisite:** backend Wave 2 (schema + module skeleton; routes return 501) must be merged. The new URL surface and request/response shapes are fixed by Tasks 13/15/17 of the backend plan.
- **Parallelism:** Frontend Waves A-D can be implemented immediately against the 501-returning backend (you'll see real 501 responses in dev and stub-render). Waves E-H light up progressively as backend Waves 3-5 land. Manual browser smoke at the end of each frontend wave catches contract drift.
- **Mocking:** for local dev without provider keys, run the backend in `MODEL_MODE=mock`. The new agents return deterministic fixtures so the focus components render real data through the real API surface without spending tokens.

---

## WAVE A — Teardown + API client (3 tasks)

### Task 1: Remove legacy single-script wizard

**Files:**
- Delete: `apps/web/src/features/creation/JobProgress.tsx`
- Delete: `apps/web/src/features/creation/VideoPreview.tsx`
- Delete: `apps/web/src/lib/job/useGenerationJob.ts`
- Modify: `apps/web/src/lib/api/client.ts` (remove `startWorkspaceVideo` and the `/api/jobs/:jobId` polling helper; keep brief/storyboard/shotprompt builder helpers since they remain valid)
- Modify: `apps/web/src/routes/App.tsx` (becomes a workspace list + "open workspace" buttons; the single-script wizard sections are gone)
- Modify: `apps/web/src/demo-readiness.test.ts` (rewrite to assert build artifacts present and new layout module is exported)

- [ ] **Step 1: Sweep usages**

```bash
grep -rn "startWorkspaceVideo\|useGenerationJob\|features/creation\|workspaces/video/generate" apps/web/src
```

Expected: only the files this task touches.

- [ ] **Step 2: Delete legacy files**

```bash
git rm apps/web/src/features/creation/JobProgress.tsx
git rm apps/web/src/features/creation/VideoPreview.tsx
git rm apps/web/src/lib/job/useGenerationJob.ts
```

- [ ] **Step 3: Strip legacy exports from client.ts**

Open `apps/web/src/lib/api/client.ts`. Delete:
- the `startWorkspaceVideo` function and its result/parameter types (`WorkspaceVideoDetail` etc. — search by `/video/generate`)
- the `getGenerationJob` helper that calls `/api/jobs/:jobId` (search `298` in the current file; locate by `\`${apiBaseUrl}/api/jobs/${jobId}\``)
- any types that only those exports referenced

Keep:
- `selectWorkspaceDirectory`, `initializeWorkspace`, `listWorkspaces`, `getWorkspaceStatus`, `runWorkspaceMaterialIntake`, `proposeWorkspaceBrief`, `approveWorkspaceBrief`, `proposeWorkspaceStoryboard`, `approveWorkspaceStoryboard`, `compileWorkspaceShotPrompt`, `approveWorkspaceShotPrompt`, `routeWorkspaceFeedback`, `uploadWorkspaceMaterial` and the shared `apiBaseUrl` / `postJson` helpers.

- [ ] **Step 4: Trim `App.tsx` to a workspace list**

Replace the entire contents of `apps/web/src/routes/App.tsx` with a slimmed-down list view that lets the user open a workspace:

```tsx
import { useState, useEffect } from "react";
import { FolderOpen, Plus } from "lucide-react";
import {
  listWorkspaces,
  selectWorkspaceDirectory,
  initializeWorkspace,
} from "../lib/api/client.js";
import type { CreativeWorkspace } from "@aigc-video/shared";

function openWorkspace(id: string) {
  window.history.pushState({}, "", `/workspaces/${id}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [workspaces, setWorkspaces] = useState<CreativeWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      setWorkspaces(await listWorkspaces());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const onCreate = async () => {
    const picked = await selectWorkspaceDirectory();
    if (picked.directory) {
      const ws = await initializeWorkspace(picked.directory);
      openWorkspace(ws.id);
    }
  };

  return (
    <div className="workspaces-landing">
      <header>
        <h1>AIGC 视频工作区</h1>
        <button onClick={onCreate}>
          <Plus size={16} /> 新建工作区
        </button>
      </header>
      <main>
        {loading ? (
          <p>加载中…</p>
        ) : workspaces.length === 0 ? (
          <p>暂无工作区。点击右上角新建。</p>
        ) : (
          <ul className="workspaces-list">
            {workspaces.map((w) => (
              <li key={w.id}>
                <button onClick={() => openWorkspace(w.id)}>
                  <FolderOpen size={14} /> {w.localPath}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
```

This intentionally drops everything the old App.tsx did. The brief/storyboard/shotprompt builder lives inside the new WorkspaceLayout (added in Wave B).

- [ ] **Step 5: Replace `demo-readiness.test.ts`**

Open `apps/web/src/demo-readiness.test.ts`. Replace its contents with a thin smoke that imports the new modules created by this plan (they don't exist yet — the test will tolerate that until Wave B):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("App module exports App", async () => {
  const mod = await import("./routes/App.js");
  assert.equal(typeof mod.App, "function");
});
```

- [ ] **Step 6: Build + typecheck**

```bash
pnpm --filter @aigc-video/web typecheck
pnpm --filter @aigc-video/web build
pnpm --filter @aigc-video/web test
```

Expected: all green. If `App.tsx` still has stale imports referring to removed symbols, fix them now.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(web): remove legacy single-script wizard"
```

---

### Task 2: New API client modules

**Files:**
- Create: `apps/web/src/lib/api/shots.ts`
- Create: `apps/web/src/lib/api/imagePrompt.ts`
- Create: `apps/web/src/lib/api/imageBatch.ts`
- Create: `apps/web/src/lib/api/imageSelect.ts`
- Create: `apps/web/src/lib/api/videoScript.ts`
- Create: `apps/web/src/lib/api/videoBatch.ts`
- Create: `apps/web/src/lib/api/videoSelect.ts`
- Create: `apps/web/src/lib/api/finalVideo.ts`
- Create: `apps/web/src/lib/api/trace.ts`
- Create: `apps/web/src/lib/api/configLimits.ts`
- Create: `apps/web/src/lib/api/assetRefs.ts`

- [ ] **Step 1: Shared types module**

Append to `apps/web/src/lib/api/client.ts` (top of file, after existing exports of `apiBaseUrl` and `postJson`; verify those helpers exist — if not, lift them out into a new `apps/web/src/lib/api/http.ts`):

```ts
// ----- v2 envelope -----
export interface WorkflowEnvelope<T> {
  data: T;
  shotStatus?: string;
  nextAction?: string;
  warnings?: string[];
  traceId?: string;
}

export type ShotStatus =
  | "DRAFT" | "IMAGE_PROMPT_PROPOSING" | "IMAGE_PROMPT_READY" | "IMAGE_PROMPT_EDITED"
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

export type AspectRatio = "9:16" | "16:9" | "1:1";
```

If `postJson` doesn't exist yet, add this helper:

```ts
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  return body as T;
}
```

- [ ] **Step 2: One module per endpoint group**

Create each of the modules below. Keep them tiny and typed; no logic beyond fetch + URL construction.

`apps/web/src/lib/api/shots.ts`:

```ts
import { fetchJson, type WorkflowEnvelope, type ShotStatus, type NextAction } from "./client.js";

export interface ShotRow {
  id: string;
  workspaceId: string;
  orderIndex: number;
  title: string;
  objective: string | null;
  defaultDurationSec: number | null;
  status: ShotStatus;
  nextAction: NextAction;
  activeImagePromptArtifactId: string | null;
  selectedImageId: string | null;
  activeVideoScriptArtifactId: string | null;
  selectedVideoId: string | null;
}

export interface WorkflowStatus {
  workspaceId: string;
  shots: Array<{
    shotId: string;
    orderIndex: number;
    status: ShotStatus;
    nextAction: NextAction;
    activeImagePromptArtifactId: string | null;
    selectedImageId: string | null;
    activeVideoScriptArtifactId: string | null;
    selectedVideoId: string | null;
    activeImageBatchId?: string | null;
    activeVideoBatchId?: string | null;
  }>;
  canComposeFinalVideo: boolean;
}

export function listShots(workspaceId: string) {
  return fetchJson<{ data: ShotRow[] }>(`/api/workspaces/${workspaceId}/shots`);
}

export function getShot(shotId: string) {
  return fetchJson<{ data: ShotRow }>(`/api/shots/${shotId}`);
}

export function getWorkflowStatus(workspaceId: string) {
  return fetchJson<{ data: WorkflowStatus }>(
    `/api/workspaces/${workspaceId}/shot-workflow-status`,
  );
}

export function retryShot(shotId: string, what: "image_batch" | "video_batch", idempotencyKey: string) {
  return fetchJson<WorkflowEnvelope<unknown>>(`/api/shots/${shotId}/retry`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ what }),
  });
}
```

`apps/web/src/lib/api/imagePrompt.ts`:

```ts
import { fetchJson, type WorkflowEnvelope } from "./client.js";

export interface ImagePromptArtifact {
  id: string;
  shotId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "APPROVED" | "STALE" | "ARCHIVED";
  promptText: string;
  negativePrompt: string | null;
  referenceAssetIds: string[];
  createdBy: string;
  createdAt: string;
}

export function proposeImagePrompt(workspaceId: string, shotId: string, body: {
  referenceAssetIds: string[];
  userHint?: string;
  stylePresetId?: string;
}) {
  return fetchJson<WorkflowEnvelope<ImagePromptArtifact>>(
    `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function patchImagePrompt(shotId: string, artifactId: string, body: {
  promptText: string;
  negativePrompt?: string;
  referenceAssetIds: string[];
}) {
  return fetchJson<WorkflowEnvelope<ImagePromptArtifact>>(
    `/api/shots/${shotId}/image-prompts/${artifactId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function listImagePrompts(shotId: string) {
  return fetchJson<{ data: ImagePromptArtifact[] }>(`/api/shots/${shotId}/image-prompts`);
}
```

`apps/web/src/lib/api/imageBatch.ts`:

```ts
import { fetchJson, type WorkflowEnvelope, type AspectRatio } from "./client.js";

export interface ImageCandidate {
  id: string;
  imageUrl: string | null;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  errorMessage?: string | null;
}

export interface ImageBatchDetail {
  batchId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED";
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  candidates: ImageCandidate[];
}

export function createImageBatch(shotId: string, body: {
  imagePromptArtifactId: string;
  count?: number;
  aspectRatio: AspectRatio;
}, idempotencyKey: string) {
  return fetchJson<WorkflowEnvelope<{ batchId: string; jobId: string }>>(
    `/api/shots/${shotId}/image-batches`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    },
  );
}

export function getImageBatch(shotId: string, batchId: string) {
  return fetchJson<WorkflowEnvelope<ImageBatchDetail>>(
    `/api/shots/${shotId}/image-batches/${batchId}`,
  );
}
```

`apps/web/src/lib/api/imageSelect.ts`:

```ts
import { fetchJson, type WorkflowEnvelope } from "./client.js";

export function selectImage(shotId: string, body: { imageCandidateId: string; imageGenerationBatchId: string }) {
  return fetchJson<WorkflowEnvelope<{ selectedImageId: string }>>(
    `/api/shots/${shotId}/selected-image`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function getSelectedImage(shotId: string) {
  return fetchJson<{ data: { imageCandidateId: string; imageGenerationBatchId: string } | null }>(
    `/api/shots/${shotId}/selected-image`,
  );
}
```

`apps/web/src/lib/api/videoScript.ts`:

```ts
import { fetchJson, type WorkflowEnvelope } from "./client.js";

export interface VideoScriptArtifact {
  id: string;
  shotId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "APPROVED" | "STALE" | "ARCHIVED";
  durationSec: number;
  scriptJson: Record<string, unknown>;
  providerPrompt: string;
  basedOnImageCandidateId: string;
  basedOnPrevImageCandidateId: string | null;
  basedOnNextImageCandidateId: string | null;
  createdBy: string;
  createdAt: string;
}

export function proposeVideoScript(workspaceId: string, shotId: string, body: {
  durationSec: number;
  useNeighborFrames: boolean;
  userHint?: string;
}) {
  return fetchJson<WorkflowEnvelope<VideoScriptArtifact>>(
    `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/propose`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function patchVideoScript(shotId: string, scriptId: string, body: {
  baseVersion: number;
  durationSec: number;
  scriptJson: Record<string, unknown>;
  providerPrompt: string;
}) {
  return fetchJson<WorkflowEnvelope<VideoScriptArtifact>>(
    `/api/shots/${shotId}/video-scripts/${scriptId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function listVideoScripts(shotId: string) {
  return fetchJson<{ data: VideoScriptArtifact[] }>(`/api/shots/${shotId}/video-scripts`);
}
```

`apps/web/src/lib/api/videoBatch.ts`:

```ts
import { fetchJson, type WorkflowEnvelope, type AspectRatio } from "./client.js";

export interface VideoCandidate {
  id: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  errorMessage?: string | null;
}

export interface VideoBatchDetail {
  batchId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED";
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  candidates: VideoCandidate[];
}

export function createVideoBatch(shotId: string, body: {
  videoScriptArtifactId: string;
  count?: number;
  aspectRatio: AspectRatio;
}, idempotencyKey: string) {
  return fetchJson<WorkflowEnvelope<{ batchId: string; jobId: string }>>(
    `/api/shots/${shotId}/video-batches`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    },
  );
}

export function getVideoBatch(shotId: string, batchId: string) {
  return fetchJson<WorkflowEnvelope<VideoBatchDetail>>(
    `/api/shots/${shotId}/video-batches/${batchId}`,
  );
}
```

`apps/web/src/lib/api/videoSelect.ts`:

```ts
import { fetchJson, type WorkflowEnvelope } from "./client.js";

export function selectVideo(shotId: string, body: { videoCandidateId: string; videoGenerationBatchId: string }) {
  return fetchJson<WorkflowEnvelope<{ selectedVideoId: string }>>(
    `/api/shots/${shotId}/selected-video`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
```

`apps/web/src/lib/api/finalVideo.ts`:

```ts
import { fetchJson, type WorkflowEnvelope, type AspectRatio } from "./client.js";

export interface FinalVideoJob {
  id: string;
  workspaceId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  localUrl: string | null;
  durationSec: number | null;
  compiledManifestHash: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export function createFinalVideo(workspaceId: string, body: { outputAspectRatio: AspectRatio }, idempotencyKey: string) {
  return fetchJson<WorkflowEnvelope<{ finalVideoJobId: string; jobId: string; status: string }>>(
    `/api/workspaces/${workspaceId}/final-videos`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    },
  );
}

export function getFinalVideo(finalVideoJobId: string) {
  return fetchJson<{ data: FinalVideoJob }>(`/api/final-videos/${finalVideoJobId}`);
}
```

`apps/web/src/lib/api/trace.ts`:

```ts
import { fetchJson } from "./client.js";

export interface TraceEventRow {
  id: string;
  workspaceId: string;
  shotId: string | null;
  traceType: "agent_run" | "provider_call" | "job_event" | "state_transition" | "user_action";
  name: string;
  inputPreview: string | null;
  outputPreview: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function listWorkspaceTraces(workspaceId: string, params: { limit?: number; cursor?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  return fetchJson<{ data: TraceEventRow[] }>(
    `/api/workspaces/${workspaceId}/traces${qs.toString() ? `?${qs}` : ""}`,
  );
}

export function listShotTraces(shotId: string, params: { limit?: number; cursor?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  return fetchJson<{ data: TraceEventRow[] }>(
    `/api/shots/${shotId}/traces${qs.toString() ? `?${qs}` : ""}`,
  );
}
```

`apps/web/src/lib/api/configLimits.ts`:

```ts
import { fetchJson } from "./client.js";

export interface ConfigLimits {
  defaultImageBatchSize: number;
  maxImageBatchSize: number;
  defaultVideoBatchSize: number;
  maxVideoBatchSize: number;
  aspectRatios: Array<"9:16" | "16:9" | "1:1">;
}

export function getConfigLimits() {
  return fetchJson<{ data: ConfigLimits }>(`/api/config/limits`);
}
```

`apps/web/src/lib/api/assetRefs.ts`:

```ts
import { fetchJson } from "./client.js";

export interface ShotAssetRef {
  id: string;
  shotId: string;
  assetId: string;
  role: "product_identity" | "reference_style" | "reference_scene" | "first_frame_hint" | "other";
  weight: number;
}

export function patchShotAssetRefs(shotId: string, refs: Array<{ assetId: string; role: ShotAssetRef["role"]; weight?: number }>) {
  return fetchJson<{ data: ShotAssetRef[] }>(`/api/shots/${shotId}/asset-refs`, {
    method: "PATCH",
    body: JSON.stringify({ refs }),
  });
}
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @aigc-video/web typecheck
git add apps/web/src/lib/api/
git commit -m "feat(web): API client modules for v2 endpoints"
```

---

### Task 3: Pure-logic modules (URL codec, focus store, step derivation) — TDD

**Files:**
- Create: `apps/web/src/features/workspace/state/urlState.ts`
- Create: `apps/web/src/features/workspace/state/urlState.test.ts`
- Create: `apps/web/src/features/workspace/state/focusStore.ts`
- Create: `apps/web/src/features/workspace/state/focusStore.test.ts`
- Create: `apps/web/src/features/workspace/state/stepDerivation.ts`
- Create: `apps/web/src/features/workspace/state/stepDerivation.test.ts`

- [ ] **Step 1: Failing tests for URL codec**

`apps/web/src/features/workspace/state/urlState.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkspaceUrl, buildWorkspaceUrl } from "./urlState.js";

test("parses workspaceId from /workspaces/:id", () => {
  const parsed = parseWorkspaceUrl("/workspaces/wsp_1", "");
  assert.equal(parsed.workspaceId, "wsp_1");
  assert.equal(parsed.shotId, null);
  assert.equal(parsed.step, null);
});

test("parses shot + step from query", () => {
  const parsed = parseWorkspaceUrl("/workspaces/wsp_1", "?shot=shot_2&step=video_script");
  assert.equal(parsed.workspaceId, "wsp_1");
  assert.equal(parsed.shotId, "shot_2");
  assert.equal(parsed.step, "video_script");
});

test("buildWorkspaceUrl is the inverse of parse", () => {
  const url = buildWorkspaceUrl({ workspaceId: "wsp_1", shotId: "shot_2", step: "image_candidates" });
  assert.equal(url, "/workspaces/wsp_1?shot=shot_2&step=image_candidates");
});

test("buildWorkspaceUrl drops null shot/step", () => {
  assert.equal(buildWorkspaceUrl({ workspaceId: "wsp_1", shotId: null, step: null }), "/workspaces/wsp_1");
});

test("rejects unknown step values", () => {
  const parsed = parseWorkspaceUrl("/workspaces/wsp_1", "?step=bogus");
  assert.equal(parsed.step, null);
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --filter @aigc-video/web test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement URL codec**

`apps/web/src/features/workspace/state/urlState.ts`:

```ts
export type FocusedStep =
  | "image_prompt"
  | "image_candidates"
  | "video_script"
  | "video_candidates"
  | "review"
  | "final_compose";

const ALLOWED_STEPS: readonly FocusedStep[] = [
  "image_prompt",
  "image_candidates",
  "video_script",
  "video_candidates",
  "review",
  "final_compose",
];

export interface ParsedWorkspaceUrl {
  workspaceId: string | null;
  shotId: string | null;
  step: FocusedStep | null;
}

export function parseWorkspaceUrl(pathname: string, search: string): ParsedWorkspaceUrl {
  const match = pathname.match(/^\/workspaces\/([^/]+)/);
  const workspaceId = match ? decodeURIComponent(match[1]) : null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const stepRaw = params.get("step");
  const step = stepRaw && (ALLOWED_STEPS as readonly string[]).includes(stepRaw)
    ? (stepRaw as FocusedStep)
    : null;
  return { workspaceId, shotId: params.get("shot"), step };
}

export interface BuildWorkspaceUrlInput {
  workspaceId: string;
  shotId: string | null;
  step: FocusedStep | null;
}

export function buildWorkspaceUrl(input: BuildWorkspaceUrlInput): string {
  const params = new URLSearchParams();
  if (input.shotId) params.set("shot", input.shotId);
  if (input.step) params.set("step", input.step);
  const qs = params.toString();
  return `/workspaces/${encodeURIComponent(input.workspaceId)}${qs ? `?${qs}` : ""}`;
}
```

- [ ] **Step 4: Run, see pass**

```bash
pnpm --filter @aigc-video/web test
```

Expected: PASS.

- [ ] **Step 5: Tests + impl for focus store**

`apps/web/src/features/workspace/state/focusStore.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFocusStore } from "./focusStore.js";

test("setFocus updates fields independently", () => {
  const store = createFocusStore();
  store.getState().setFocus({ shotId: "shot_1" });
  assert.equal(store.getState().shotId, "shot_1");
  assert.equal(store.getState().step, null);
  store.getState().setFocus({ step: "image_prompt" });
  assert.equal(store.getState().step, "image_prompt");
  assert.equal(store.getState().shotId, "shot_1");
});

test("reset clears focus", () => {
  const store = createFocusStore();
  store.getState().setFocus({ shotId: "shot_1", step: "image_prompt" });
  store.getState().reset();
  assert.equal(store.getState().shotId, null);
  assert.equal(store.getState().step, null);
});
```

`apps/web/src/features/workspace/state/focusStore.ts`:

```ts
import { createStore } from "zustand/vanilla";
import type { FocusedStep } from "./urlState.js";

export interface FocusState {
  shotId: string | null;
  step: FocusedStep | null;
  setFocus: (next: Partial<Pick<FocusState, "shotId" | "step">>) => void;
  reset: () => void;
}

export function createFocusStore() {
  return createStore<FocusState>((set) => ({
    shotId: null,
    step: null,
    setFocus: (next) => set((prev) => ({ ...prev, ...next })),
    reset: () => set({ shotId: null, step: null }),
  }));
}

// React-side hook bound to a singleton store, exported separately so unit tests
// can construct their own store without React.
import { useStore } from "zustand";
const singleton = createFocusStore();
export function useFocusStore<T>(selector: (s: FocusState) => T): T {
  return useStore(singleton, selector);
}
export function getFocusStore() {
  return singleton;
}
```

- [ ] **Step 6: Tests + impl for step derivation**

`apps/web/src/features/workspace/state/stepDerivation.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultStepForStatus, isStepReachable } from "./stepDerivation.js";

test("defaultStepForStatus", () => {
  assert.equal(defaultStepForStatus("DRAFT"), "image_prompt");
  assert.equal(defaultStepForStatus("IMAGE_PROMPT_READY"), "image_prompt");
  assert.equal(defaultStepForStatus("IMAGE_GENERATING"), "image_candidates");
  assert.equal(defaultStepForStatus("IMAGE_CANDIDATES_READY"), "image_candidates");
  assert.equal(defaultStepForStatus("IMAGE_SELECTED"), "video_script");
  assert.equal(defaultStepForStatus("VIDEO_SCRIPT_READY"), "video_script");
  assert.equal(defaultStepForStatus("VIDEO_GENERATING"), "video_candidates");
  assert.equal(defaultStepForStatus("VIDEO_CANDIDATES_READY"), "video_candidates");
  assert.equal(defaultStepForStatus("VIDEO_SELECTED"), "review");
  assert.equal(defaultStepForStatus("FAILED"), "image_prompt");
});

test("isStepReachable", () => {
  assert.equal(isStepReachable("image_prompt", "DRAFT"), true);
  assert.equal(isStepReachable("image_candidates", "DRAFT"), false);
  assert.equal(isStepReachable("video_script", "IMAGE_SELECTED"), true);
  assert.equal(isStepReachable("video_candidates", "IMAGE_SELECTED"), false);
  assert.equal(isStepReachable("review", "VIDEO_SELECTED"), true);
  assert.equal(isStepReachable("review", "VIDEO_CANDIDATES_READY"), false);
});
```

`apps/web/src/features/workspace/state/stepDerivation.ts`:

```ts
import type { FocusedStep } from "./urlState.js";
import type { ShotStatus } from "../../../lib/api/client.js";

export function defaultStepForStatus(status: ShotStatus): FocusedStep {
  switch (status) {
    case "DRAFT":
    case "IMAGE_PROMPT_PROPOSING":
    case "IMAGE_PROMPT_READY":
    case "IMAGE_PROMPT_EDITED":
      return "image_prompt";
    case "IMAGE_GENERATING":
    case "IMAGE_CANDIDATES_READY":
      return "image_candidates";
    case "IMAGE_SELECTED":
    case "VIDEO_SCRIPT_PROPOSING":
    case "VIDEO_SCRIPT_READY":
    case "VIDEO_SCRIPT_EDITED":
      return "video_script";
    case "VIDEO_GENERATING":
    case "VIDEO_CANDIDATES_READY":
      return "video_candidates";
    case "VIDEO_SELECTED":
      return "review";
    case "FAILED":
      return "image_prompt";
  }
}

const STEP_ORDER: FocusedStep[] = [
  "image_prompt",
  "image_candidates",
  "video_script",
  "video_candidates",
  "review",
];

function statusRank(status: ShotStatus): number {
  switch (status) {
    case "DRAFT":
    case "IMAGE_PROMPT_PROPOSING":
    case "IMAGE_PROMPT_READY":
    case "IMAGE_PROMPT_EDITED":
      return 0; // image_prompt reachable
    case "IMAGE_GENERATING":
    case "IMAGE_CANDIDATES_READY":
      return 1; // image_candidates reachable
    case "IMAGE_SELECTED":
    case "VIDEO_SCRIPT_PROPOSING":
    case "VIDEO_SCRIPT_READY":
    case "VIDEO_SCRIPT_EDITED":
      return 2;
    case "VIDEO_GENERATING":
    case "VIDEO_CANDIDATES_READY":
      return 3;
    case "VIDEO_SELECTED":
      return 4;
    case "FAILED":
      return 0;
  }
}

export function isStepReachable(step: FocusedStep, status: ShotStatus): boolean {
  if (step === "final_compose") return false; // workspace-level CTA, not a shot step
  const i = STEP_ORDER.indexOf(step);
  return i >= 0 && i <= statusRank(status);
}
```

- [ ] **Step 7: Run all tests, commit**

```bash
pnpm --filter @aigc-video/web test
git add apps/web/src/features/workspace/state/
git commit -m "feat(web): URL codec + focus store + step derivation (tested)"
```

---

## WAVE B — Layout shell + routing (3 tasks)

### Task 4: Route switch in `main.tsx`

**Files:**
- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/src/features/workspace/WorkspaceLayout.tsx` (skeleton; filled in Task 5)

- [ ] **Step 1: Switch on pathname**

Replace contents of `apps/web/src/main.tsx`:

```tsx
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./routes/App.js";
import { WorkspaceLayout } from "./features/workspace/WorkspaceLayout.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Root() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  if (pathname.startsWith("/workspaces/")) {
    return <WorkspaceLayout />;
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Placeholder WorkspaceLayout**

`apps/web/src/features/workspace/WorkspaceLayout.tsx`:

```tsx
export function WorkspaceLayout() {
  return <div className="workspace-layout">Workspace layout (Task 5)</div>;
}
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @aigc-video/web typecheck
pnpm --filter @aigc-video/web build
git add apps/web/src/main.tsx apps/web/src/features/workspace/WorkspaceLayout.tsx
git commit -m "feat(web): pathname-based route switch to WorkspaceLayout"
```

---

### Task 5: WorkspaceLayout shell + TopBar

**Files:**
- Modify: `apps/web/src/features/workspace/WorkspaceLayout.tsx`
- Create: `apps/web/src/features/workspace/TopBar.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: TopBar component**

`apps/web/src/features/workspace/TopBar.tsx`:

```tsx
import { ChevronLeft, Layers, FileText } from "lucide-react";

export interface TopBarProps {
  workspaceLabel: string;
  activeShotLabel: string | null;
  onBack(): void;
  onToggleTrace(): void;
}

export function TopBar({ workspaceLabel, activeShotLabel, onBack, onToggleTrace }: TopBarProps) {
  return (
    <header className="top-bar">
      <button className="top-bar__back" onClick={onBack} title="返回工作区列表">
        <ChevronLeft size={16} />
      </button>
      <div className="top-bar__crumbs">
        <Layers size={14} /> <span>{workspaceLabel}</span>
        {activeShotLabel ? (
          <>
            <span className="top-bar__sep">/</span>
            <span>{activeShotLabel}</span>
          </>
        ) : null}
      </div>
      <div className="top-bar__spacer" />
      <button className="top-bar__trace" onClick={onToggleTrace} title="打开 Trace 面板">
        <FileText size={14} /> Trace
      </button>
    </header>
  );
}
```

- [ ] **Step 2: WorkspaceLayout grid**

Replace `apps/web/src/features/workspace/WorkspaceLayout.tsx`:

```tsx
import { useEffect, useState } from "react";
import { TopBar } from "./TopBar.js";
import { parseWorkspaceUrl, buildWorkspaceUrl, type FocusedStep } from "./state/urlState.js";
import { getFocusStore } from "./state/focusStore.js";

function useUrlState() {
  const [parsed, setParsed] = useState(() => parseWorkspaceUrl(window.location.pathname, window.location.search));
  useEffect(() => {
    const onPop = () => setParsed(parseWorkspaceUrl(window.location.pathname, window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // mirror URL into store
  useEffect(() => {
    getFocusStore().setState({ shotId: parsed.shotId, step: parsed.step });
  }, [parsed.shotId, parsed.step]);
  return parsed;
}

export function navigateFocus(input: { workspaceId: string; shotId: string | null; step: FocusedStep | null }) {
  const url = buildWorkspaceUrl(input);
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function WorkspaceLayout() {
  const parsed = useUrlState();
  const [traceOpen, setTraceOpen] = useState(false);
  const workspaceId = parsed.workspaceId;
  if (!workspaceId) {
    return <div className="workspace-layout__empty">未指定工作区</div>;
  }
  return (
    <div className={`workspace-layout ${traceOpen ? "workspace-layout--trace-open" : ""}`}>
      <TopBar
        workspaceLabel={workspaceId}
        activeShotLabel={parsed.shotId}
        onBack={() => {
          window.history.pushState({}, "", "/");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        onToggleTrace={() => setTraceOpen((v) => !v)}
      />
      <aside className="workspace-layout__left-rail">LeftRail (Wave C)</aside>
      <main className="workspace-layout__focus">Focus panel (Waves E-G)</main>
      <aside className="workspace-layout__asset-rail">AssetRail (Wave D)</aside>
      {traceOpen ? <aside className="workspace-layout__trace">TraceDrawer (Wave H)</aside> : null}
    </div>
  );
}
```

- [ ] **Step 3: Grid CSS**

Append to `apps/web/src/styles.css`:

```css
.workspace-layout {
  display: grid;
  grid-template-areas:
    "top top top"
    "left main right";
  grid-template-rows: 56px 1fr;
  grid-template-columns: 240px 1fr 280px;
  height: 100vh;
}
.workspace-layout--trace-open {
  grid-template-columns: 240px 1fr 280px 360px;
  grid-template-areas:
    "top top top top"
    "left main right trace";
}
.top-bar { grid-area: top; display: flex; align-items: center; gap: 12px; padding: 0 16px; border-bottom: 1px solid #e7e7eb; }
.workspace-layout__left-rail { grid-area: left; border-right: 1px solid #e7e7eb; overflow-y: auto; }
.workspace-layout__focus { grid-area: main; overflow-y: auto; padding: 16px 24px; }
.workspace-layout__asset-rail { grid-area: right; border-left: 1px solid #e7e7eb; overflow-y: auto; }
.workspace-layout__trace { grid-area: trace; border-left: 1px solid #e7e7eb; overflow-y: auto; }
.workspace-layout__empty { display: grid; place-items: center; height: 100vh; }
.top-bar__spacer { flex: 1; }
.top-bar__crumbs { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #444; }
.top-bar__sep { color: #999; }
```

- [ ] **Step 4: Manual smoke**

```bash
pnpm --filter @aigc-video/web dev
```

Open `http://localhost:5173/workspaces/anything`. Expect: shell renders with three columns + top bar + trace toggle works.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/workspace/ apps/web/src/styles.css
git commit -m "feat(web): WorkspaceLayout shell + TopBar"
```

---

### Task 6: `useConfigLimits` + `useVisibilityActive` hooks

**Files:**
- Create: `apps/web/src/features/workspace/hooks/useConfigLimits.ts`
- Create: `apps/web/src/features/workspace/hooks/useVisibilityActive.ts`

- [ ] **Step 1: `useConfigLimits`**

```ts
import { useQuery } from "@tanstack/react-query";
import { getConfigLimits, type ConfigLimits } from "../../../lib/api/configLimits.js";

const FALLBACK: ConfigLimits = {
  defaultImageBatchSize: 3,
  maxImageBatchSize: 6,
  defaultVideoBatchSize: 5,
  maxVideoBatchSize: 10,
  aspectRatios: ["9:16", "16:9", "1:1"],
};

export function useConfigLimits(): ConfigLimits {
  const { data } = useQuery({
    queryKey: ["config", "limits"],
    queryFn: getConfigLimits,
    staleTime: 5 * 60_000,
  });
  return data?.data ?? FALLBACK;
}
```

- [ ] **Step 2: `useVisibilityActive`**

```ts
import { useEffect, useState } from "react";

export function useVisibilityActive(): boolean {
  const [active, setActive] = useState(typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const onChange = () => setActive(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return active;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/workspace/hooks/
git commit -m "feat(web): useConfigLimits + useVisibilityActive hooks"
```

---

## WAVE C — LeftRail (3 tasks)

### Task 7: `useShotWorkflowStatus` hook

**Files:**
- Create: `apps/web/src/features/workspace/hooks/useShotWorkflowStatus.ts`

- [ ] **Step 1: Hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { getWorkflowStatus } from "../../../lib/api/shots.js";
import { useVisibilityActive } from "./useVisibilityActive.js";

const ACTIVE_STATUSES = new Set(["IMAGE_GENERATING", "VIDEO_GENERATING", "IMAGE_PROMPT_PROPOSING", "VIDEO_SCRIPT_PROPOSING"]);

export function useShotWorkflowStatus(workspaceId: string | null) {
  const visible = useVisibilityActive();
  return useQuery({
    queryKey: ["workflow-status", workspaceId],
    queryFn: () => getWorkflowStatus(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: (query) => {
      if (!visible) return false;
      const data = query.state.data?.data;
      if (!data) return 5_000;
      const anyActive = data.shots.some((s) => ACTIVE_STATUSES.has(s.status));
      return anyActive ? 3_000 : 30_000;
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/workspace/hooks/useShotWorkflowStatus.ts
git commit -m "feat(web): adaptive polling hook for workflow status"
```

---

### Task 8: `ShotList` + `StepLadder`

**Files:**
- Create: `apps/web/src/features/workspace/LeftRail/LeftRail.tsx`
- Create: `apps/web/src/features/workspace/LeftRail/ShotList.tsx`
- Create: `apps/web/src/features/workspace/LeftRail/StepLadder.tsx`
- Modify: `apps/web/src/features/workspace/WorkspaceLayout.tsx` (mount LeftRail)
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: `ShotList`**

```tsx
import { Check, Clock, AlertCircle } from "lucide-react";
import type { WorkflowStatus } from "../../../lib/api/shots.js";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  IMAGE_PROMPT_PROPOSING: "生成图 Prompt 中",
  IMAGE_PROMPT_READY: "等待生成图",
  IMAGE_PROMPT_EDITED: "已编辑 Prompt",
  IMAGE_GENERATING: "图生成中",
  IMAGE_CANDIDATES_READY: "等待选图",
  IMAGE_SELECTED: "已选图",
  VIDEO_SCRIPT_PROPOSING: "生成剧本中",
  VIDEO_SCRIPT_READY: "剧本就绪",
  VIDEO_SCRIPT_EDITED: "已编辑剧本",
  VIDEO_GENERATING: "视频生成中",
  VIDEO_CANDIDATES_READY: "等待选视频",
  VIDEO_SELECTED: "已选视频",
  FAILED: "失败",
};

export interface ShotListProps {
  shots: WorkflowStatus["shots"];
  activeShotId: string | null;
  onSelect(shotId: string): void;
}

export function ShotList({ shots, activeShotId, onSelect }: ShotListProps) {
  return (
    <ul className="shot-list">
      {shots
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((s) => {
          const isActive = s.shotId === activeShotId;
          const done = s.status === "VIDEO_SELECTED";
          const failed = s.status === "FAILED";
          const inProgress = s.status.endsWith("_GENERATING") || s.status.endsWith("_PROPOSING");
          return (
            <li key={s.shotId} className={`shot-list__row ${isActive ? "shot-list__row--active" : ""}`}>
              <button onClick={() => onSelect(s.shotId)}>
                <span className="shot-list__idx">{s.orderIndex + 1}</span>
                <span className="shot-list__label">{STATUS_LABEL[s.status] ?? s.status}</span>
                {done ? <Check size={14} className="shot-list__icon shot-list__icon--ok" /> : null}
                {inProgress ? <Clock size={14} className="shot-list__icon shot-list__icon--busy" /> : null}
                {failed ? <AlertCircle size={14} className="shot-list__icon shot-list__icon--err" /> : null}
              </button>
            </li>
          );
        })}
    </ul>
  );
}
```

- [ ] **Step 2: `StepLadder`**

```tsx
import { useFocusStore } from "../state/focusStore.js";
import { defaultStepForStatus, isStepReachable } from "../state/stepDerivation.js";
import type { FocusedStep } from "../state/urlState.js";
import type { ShotStatus } from "../../../lib/api/client.js";
import { navigateFocus } from "../WorkspaceLayout.js";

const STEP_LABEL: Record<FocusedStep, string> = {
  image_prompt: "1. 图 Prompt",
  image_candidates: "2. 选图",
  video_script: "3. 视频剧本",
  video_candidates: "4. 选视频",
  review: "5. 审阅",
  final_compose: "6. 最终合成",
};

export interface StepLadderProps {
  workspaceId: string;
  shotId: string;
  status: ShotStatus;
}

export function StepLadder({ workspaceId, shotId, status }: StepLadderProps) {
  const current = useFocusStore((s) => s.step) ?? defaultStepForStatus(status);
  return (
    <ol className="step-ladder">
      {(Object.keys(STEP_LABEL) as FocusedStep[])
        .filter((s) => s !== "final_compose")
        .map((step) => {
          const reachable = isStepReachable(step, status);
          const active = current === step;
          return (
            <li key={step} className={`step-ladder__row ${active ? "step-ladder__row--active" : ""} ${reachable ? "" : "step-ladder__row--locked"}`}>
              <button
                disabled={!reachable}
                onClick={() => navigateFocus({ workspaceId, shotId, step })}
              >
                {STEP_LABEL[step]}
              </button>
            </li>
          );
        })}
    </ol>
  );
}
```

- [ ] **Step 3: `LeftRail` composition**

```tsx
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { useFocusStore } from "../state/focusStore.js";
import { ShotList } from "./ShotList.js";
import { StepLadder } from "./StepLadder.js";
import { navigateFocus } from "../WorkspaceLayout.js";
import { defaultStepForStatus } from "../state/stepDerivation.js";
import { FinalComposeCta } from "./FinalComposeCta.js";

export interface LeftRailProps {
  workspaceId: string;
}

export function LeftRail({ workspaceId }: LeftRailProps) {
  const { data, isLoading } = useShotWorkflowStatus(workspaceId);
  const activeShotId = useFocusStore((s) => s.shotId);
  const shots = data?.data.shots ?? [];
  const activeShot = shots.find((s) => s.shotId === activeShotId);

  return (
    <div className="left-rail">
      {isLoading ? <p>加载中…</p> : (
        <ShotList
          shots={shots}
          activeShotId={activeShotId}
          onSelect={(shotId) => {
            const status = shots.find((s) => s.shotId === shotId)?.status ?? "DRAFT";
            navigateFocus({ workspaceId, shotId, step: defaultStepForStatus(status) });
          }}
        />
      )}
      {activeShot ? <StepLadder workspaceId={workspaceId} shotId={activeShot.shotId} status={activeShot.status} /> : null}
      <FinalComposeCta workspaceId={workspaceId} canCompose={data?.data.canComposeFinalVideo ?? false} />
    </div>
  );
}
```

- [ ] **Step 4: `FinalComposeCta` (placeholder; full impl in Task 16)**

```tsx
import { navigateFocus } from "../WorkspaceLayout.js";

export function FinalComposeCta({ workspaceId, canCompose }: { workspaceId: string; canCompose: boolean }) {
  return (
    <div className="final-compose-cta">
      <button disabled={!canCompose} onClick={() => navigateFocus({ workspaceId, shotId: null, step: "final_compose" })}>
        合成最终视频
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Mount in WorkspaceLayout**

Replace the `<aside className="workspace-layout__left-rail">…</aside>` line in `WorkspaceLayout.tsx` with `<LeftRail workspaceId={workspaceId} />` and add the import.

- [ ] **Step 6: CSS**

Append to `styles.css`:

```css
.shot-list { list-style: none; padding: 0; margin: 0; }
.shot-list__row > button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px; background: none; border: 0; border-bottom: 1px solid #f0f0f3; text-align: left; cursor: pointer; }
.shot-list__row--active > button { background: #f4f6ff; font-weight: 600; }
.shot-list__idx { width: 24px; height: 24px; border-radius: 50%; background: #e7e7eb; display: grid; place-items: center; font-size: 12px; }
.shot-list__label { flex: 1; font-size: 13px; }
.shot-list__icon--ok { color: #2bb673; }
.shot-list__icon--busy { color: #f29c33; }
.shot-list__icon--err { color: #d23b3b; }

.step-ladder { list-style: none; padding: 12px; margin: 0; }
.step-ladder__row { padding: 6px 0; }
.step-ladder__row > button { background: none; border: 0; cursor: pointer; font-size: 13px; padding: 4px 0; }
.step-ladder__row--locked > button { color: #bbb; cursor: not-allowed; }
.step-ladder__row--active > button { font-weight: 700; }

.final-compose-cta { padding: 12px; border-top: 1px solid #e7e7eb; }
.final-compose-cta > button { width: 100%; padding: 10px; background: #2c3aff; color: white; border: 0; border-radius: 6px; cursor: pointer; }
.final-compose-cta > button:disabled { background: #c9cbe7; cursor: not-allowed; }
```

- [ ] **Step 7: Smoke + commit**

`pnpm --filter @aigc-video/web dev` and visit `/workspaces/<some-id>`. Expect: shot list renders (data may be empty/0 shots if backend hasn't seeded any).

```bash
git add -A
git commit -m "feat(web): LeftRail with ShotList, StepLadder, FinalComposeCta"
```

---

### Task 9: AssetRail

**Files:**
- Create: `apps/web/src/features/workspace/AssetRail/AssetRail.tsx`
- Create: `apps/web/src/features/workspace/AssetRail/AssetTile.tsx`
- Create: `apps/web/src/features/workspace/AssetRail/QuickUpload.tsx`
- Create: `apps/web/src/features/workspace/hooks/useShotAssetRefs.ts`
- Modify: `apps/web/src/features/workspace/WorkspaceLayout.tsx` (mount AssetRail)
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: `useShotAssetRefs`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { patchShotAssetRefs, type ShotAssetRef } from "../../../lib/api/assetRefs.js";

export function useShotAssetRefs(shotId: string | null) {
  // P0: refs are returned by the shot detail endpoint; this hook is a thin wrapper.
  // For now, derive from a future GET /api/shots/:id/asset-refs (placeholder).
  const refsQuery = useQuery({
    queryKey: ["shot-asset-refs", shotId],
    queryFn: async () => {
      if (!shotId) return { data: [] as ShotAssetRef[] };
      const res = await fetch(`/api/shots/${shotId}/asset-refs`);
      if (!res.ok) return { data: [] as ShotAssetRef[] };
      return res.json() as Promise<{ data: ShotAssetRef[] }>;
    },
    enabled: Boolean(shotId),
  });

  const qc = useQueryClient();
  const setRefs = useMutation({
    mutationFn: async (refs: Array<{ assetId: string; role: ShotAssetRef["role"]; weight?: number }>) => {
      if (!shotId) return { data: [] as ShotAssetRef[] };
      return patchShotAssetRefs(shotId, refs);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shot-asset-refs", shotId] }),
  });

  return { refs: refsQuery.data?.data ?? [], setRefs };
}
```

- [ ] **Step 2: `AssetTile` (drag source)**

```tsx
export interface AssetTileProps {
  assetId: string;
  url: string;
  label: string;
  selected?: boolean;
  onToggle?(): void;
}

export function AssetTile({ assetId, url, label, selected, onToggle }: AssetTileProps) {
  return (
    <button
      className={`asset-tile ${selected ? "asset-tile--selected" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-asset-id", assetId);
      }}
      onClick={onToggle}
      title={label}
    >
      <img src={url} alt={label} />
    </button>
  );
}
```

- [ ] **Step 3: `QuickUpload` (reuses existing `uploadWorkspaceMaterial`)**

```tsx
import { useState } from "react";
import { Upload } from "lucide-react";
import { uploadWorkspaceMaterial } from "../../../lib/api/client.js";

export function QuickUpload({ workspaceId, onUploaded }: { workspaceId: string; onUploaded(): void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`quick-upload ${busy ? "quick-upload--busy" : ""}`}>
      <Upload size={14} /> 上传素材
      <input
        type="file"
        hidden
        accept="image/*,video/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            const buf = await file.arrayBuffer();
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            await uploadWorkspaceMaterial({ workspaceId, filename: file.name, dataBase64: b64 });
            onUploaded();
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}
```

- [ ] **Step 4: `AssetRail` composition**

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorkspaceStatus } from "../../../lib/api/client.js";
import { useFocusStore } from "../state/focusStore.js";
import { useShotAssetRefs } from "../hooks/useShotAssetRefs.js";
import { AssetTile } from "./AssetTile.js";
import { QuickUpload } from "./QuickUpload.js";

export function AssetRail({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const ws = useQuery({
    queryKey: ["workspace-status", workspaceId],
    queryFn: () => getWorkspaceStatus({ workspaceId }),
  });
  const activeShotId = useFocusStore((s) => s.shotId);
  const { refs, setRefs } = useShotAssetRefs(activeShotId);

  const materials = ws.data?.materials?.assets ?? [];

  return (
    <div className="asset-rail">
      <section>
        <h4>当前分镜引用</h4>
        {!activeShotId ? <p>未选择分镜。</p> : refs.length === 0 ? <p>无引用素材。</p> : (
          <ul className="asset-rail__refs">
            {refs.map((r) => (
              <li key={r.id}>
                <span className="asset-rail__role">{r.role}</span>
                <span className="asset-rail__id">{r.assetId.slice(0, 8)}…</span>
                <button onClick={() => setRefs.mutate(refs.filter((x) => x.id !== r.id).map((x) => ({ assetId: x.assetId, role: x.role, weight: x.weight })))}>
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4>素材库</h4>
        <div className="asset-rail__grid">
          {materials.map((a) => (
            <AssetTile
              key={a.ref}
              assetId={a.ref}
              url={a.previewUrl ?? a.ref}
              label={a.description}
              selected={refs.some((r) => r.assetId === a.ref)}
              onToggle={() => {
                const exists = refs.find((r) => r.assetId === a.ref);
                if (!activeShotId) return;
                const next = exists
                  ? refs.filter((r) => r !== exists).map((r) => ({ assetId: r.assetId, role: r.role, weight: r.weight }))
                  : [...refs.map((r) => ({ assetId: r.assetId, role: r.role, weight: r.weight })), { assetId: a.ref, role: "product_identity" as const }];
                setRefs.mutate(next);
              }}
            />
          ))}
        </div>
        <QuickUpload workspaceId={workspaceId} onUploaded={() => qc.invalidateQueries({ queryKey: ["workspace-status", workspaceId] })} />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Mount, CSS, commit**

Replace the AssetRail aside in WorkspaceLayout with `<AssetRail workspaceId={workspaceId} />` and import. Append CSS:

```css
.asset-rail { padding: 12px; }
.asset-rail h4 { margin: 12px 0 8px; font-size: 13px; color: #555; }
.asset-rail__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.asset-tile { padding: 0; border: 1px solid transparent; border-radius: 6px; overflow: hidden; cursor: pointer; }
.asset-tile--selected { border-color: #2c3aff; box-shadow: 0 0 0 2px rgba(44, 58, 255, 0.18); }
.asset-tile > img { width: 100%; height: 80px; object-fit: cover; display: block; }
.asset-rail__refs { list-style: none; padding: 0; margin: 0; font-size: 12px; }
.asset-rail__refs > li { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.asset-rail__role { color: #888; font-family: monospace; font-size: 11px; }
.quick-upload { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px dashed #c8c8d0; border-radius: 6px; cursor: pointer; margin-top: 8px; font-size: 13px; }
.quick-upload--busy { opacity: 0.5; }
```

```bash
git add -A
git commit -m "feat(web): AssetRail with drag source and shot-asset-refs editor"
```

---

## WAVE D — Focus image side (3 tasks)

### Task 10: `FocusRouter` + scaffold step components

**Files:**
- Create: `apps/web/src/features/workspace/Focus/FocusRouter.tsx`
- Create: `apps/web/src/features/workspace/Focus/AssetStrip.tsx`
- Create: `apps/web/src/features/workspace/Focus/VersionChips.tsx`
- Create: `apps/web/src/features/workspace/Focus/StaleBanner.tsx`
- Create: scaffold files for `ImagePromptStep.tsx`, `ImageCandidatesStep.tsx`, `VideoScriptStep.tsx`, `VideoCandidatesStep.tsx`, `ReviewStep.tsx`, `FinalComposeStep.tsx` — each exports a component that says "Step coming soon".
- Modify: `apps/web/src/features/workspace/WorkspaceLayout.tsx` (mount FocusRouter)

- [ ] **Step 1: Reusable bits**

`AssetStrip.tsx`:

```tsx
import { useShotAssetRefs } from "../hooks/useShotAssetRefs.js";

export function AssetStrip({ shotId }: { shotId: string }) {
  const { refs } = useShotAssetRefs(shotId);
  if (refs.length === 0) return null;
  return (
    <div className="asset-strip">
      <span className="asset-strip__label">引用：</span>
      {refs.map((r) => (
        <span key={r.id} className="asset-strip__chip">
          {r.role} · {r.assetId.slice(0, 8)}
        </span>
      ))}
    </div>
  );
}
```

`VersionChips.tsx`:

```tsx
export interface VersionChipsProps<T extends { id: string; version: number }> {
  versions: T[];
  activeId: string | null;
  onPick(version: T): void;
}
export function VersionChips<T extends { id: string; version: number }>({ versions, activeId, onPick }: VersionChipsProps<T>) {
  return (
    <div className="version-chips">
      {versions.map((v) => (
        <button key={v.id} className={`version-chip ${v.id === activeId ? "version-chip--active" : ""}`} onClick={() => onPick(v)}>
          v{v.version}
        </button>
      ))}
    </div>
  );
}
```

`StaleBanner.tsx`:

```tsx
export function StaleBanner({ message }: { message: string }) {
  return <div className="stale-banner">{message}</div>;
}
```

- [ ] **Step 2: `FocusRouter`**

```tsx
import { useFocusStore } from "../state/focusStore.js";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { ImagePromptStep } from "./ImagePromptStep.js";
import { ImageCandidatesStep } from "./ImageCandidatesStep.js";
import { VideoScriptStep } from "./VideoScriptStep.js";
import { VideoCandidatesStep } from "./VideoCandidatesStep.js";
import { ReviewStep } from "./ReviewStep.js";
import { FinalComposeStep } from "./FinalComposeStep.js";
import { defaultStepForStatus } from "../state/stepDerivation.js";

export function FocusRouter({ workspaceId }: { workspaceId: string }) {
  const shotId = useFocusStore((s) => s.shotId);
  const step = useFocusStore((s) => s.step);
  const { data } = useShotWorkflowStatus(workspaceId);
  if (step === "final_compose") return <FinalComposeStep workspaceId={workspaceId} />;
  if (!shotId) return <div className="focus-empty">从左侧选择一个分镜开始</div>;
  const shot = data?.data.shots.find((s) => s.shotId === shotId);
  const effective = step ?? (shot ? defaultStepForStatus(shot.status) : "image_prompt");
  switch (effective) {
    case "image_prompt": return <ImagePromptStep workspaceId={workspaceId} shotId={shotId} />;
    case "image_candidates": return <ImageCandidatesStep workspaceId={workspaceId} shotId={shotId} />;
    case "video_script": return <VideoScriptStep workspaceId={workspaceId} shotId={shotId} />;
    case "video_candidates": return <VideoCandidatesStep workspaceId={workspaceId} shotId={shotId} />;
    case "review": return <ReviewStep workspaceId={workspaceId} shotId={shotId} />;
  }
}
```

- [ ] **Step 3: Scaffold the six step files**

Each is a placeholder for now, e.g.:

```tsx
// ImagePromptStep.tsx
export function ImagePromptStep({ workspaceId, shotId }: { workspaceId: string; shotId: string }) {
  return <div>Image prompt step (Task 11) for {shotId} / {workspaceId}</div>;
}
```

Repeat for the other five files with their own component name and the same signature (`final_compose` only takes `workspaceId`).

- [ ] **Step 4: Mount FocusRouter**

Replace the `<main className="workspace-layout__focus">Focus panel (Waves E-G)</main>` in WorkspaceLayout with `<main className="workspace-layout__focus"><FocusRouter workspaceId={workspaceId} /></main>`.

- [ ] **Step 5: CSS + commit**

```css
.asset-strip { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f7f7fa; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
.asset-strip__chip { padding: 2px 8px; background: #fff; border: 1px solid #e0e0e6; border-radius: 999px; }
.version-chips { display: flex; gap: 6px; margin-top: 8px; }
.version-chip { padding: 3px 10px; border: 1px solid #d0d0d8; border-radius: 999px; background: white; cursor: pointer; font-size: 12px; }
.version-chip--active { border-color: #2c3aff; color: #2c3aff; font-weight: 600; }
.stale-banner { padding: 8px 12px; background: #fff3e0; border: 1px solid #ffd098; color: #8a4400; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.focus-empty { display: grid; place-items: center; height: 100%; color: #888; }
```

```bash
git add -A
git commit -m "feat(web): FocusRouter + shared step pieces (AssetStrip, VersionChips, StaleBanner)"
```

---

### Task 11: `ImagePromptStep`

**Files:**
- Modify: `apps/web/src/features/workspace/Focus/ImagePromptStep.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { listImagePrompts, patchImagePrompt, proposeImagePrompt, type ImagePromptArtifact } from "../../../lib/api/imagePrompt.js";
import { createImageBatch } from "../../../lib/api/imageBatch.js";
import { useConfigLimits } from "../hooks/useConfigLimits.js";
import { useShotAssetRefs } from "../hooks/useShotAssetRefs.js";
import { AssetStrip } from "./AssetStrip.js";
import { VersionChips } from "./VersionChips.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function ImagePromptStep({ workspaceId, shotId }: { workspaceId: string; shotId: string }) {
  const qc = useQueryClient();
  const limits = useConfigLimits();
  const { refs } = useShotAssetRefs(shotId);
  const refIds = refs.map((r) => r.assetId);

  const versions = useQuery({
    queryKey: ["image-prompts", shotId],
    queryFn: () => listImagePrompts(shotId),
  });
  const list = versions.data?.data ?? [];
  const active = list.find((v) => v.status === "ACTIVE") ?? list[0];
  const [selectedId, setSelectedId] = useState<string | null>(active?.id ?? null);
  const showing = list.find((v) => v.id === (selectedId ?? active?.id)) ?? null;

  const { register, handleSubmit, reset } = useForm<{ promptText: string; negativePrompt: string }>({
    defaultValues: { promptText: showing?.promptText ?? "", negativePrompt: showing?.negativePrompt ?? "" },
    values: { promptText: showing?.promptText ?? "", negativePrompt: showing?.negativePrompt ?? "" },
  });

  const propose = useMutation({
    mutationFn: () => proposeImagePrompt(workspaceId, shotId, { referenceAssetIds: refIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image-prompts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const patch = useMutation({
    mutationFn: (body: { promptText: string; negativePrompt: string }) =>
      patchImagePrompt(shotId, active!.id, { promptText: body.promptText, negativePrompt: body.negativePrompt, referenceAssetIds: refIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image-prompts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const [count, setCount] = useState(limits.defaultImageBatchSize);
  const startBatch = useMutation({
    mutationFn: () => {
      const key = `${workspaceId}:${shotId}:image-batch:${active!.id}:${Date.now()}`;
      return createImageBatch(shotId, { imagePromptArtifactId: active!.id, count, aspectRatio: "9:16" }, key);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      navigateFocus({ workspaceId, shotId, step: "image_candidates" });
    },
  });

  if (!active && !propose.isPending) {
    return (
      <div className="step-card">
        <AssetStrip shotId={shotId} />
        <h2>分镜图 Prompt</h2>
        <p>当前分镜还没有图 prompt。</p>
        <button onClick={() => propose.mutate()}>生成初始 Prompt</button>
      </div>
    );
  }

  if (propose.isPending || versions.isLoading) return <div className="step-card">加载中…</div>;

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>分镜图 Prompt</h2>
      <VersionChips versions={list} activeId={showing?.id ?? null} onPick={(v) => { setSelectedId(v.id); reset({ promptText: v.promptText, negativePrompt: v.negativePrompt ?? "" }); }} />
      <form
        className="image-prompt-form"
        onSubmit={handleSubmit((body) => patch.mutate(body))}
      >
        <label>
          Prompt
          <textarea rows={8} {...register("promptText", { required: true })} />
        </label>
        <label>
          Negative Prompt
          <input {...register("negativePrompt")} />
        </label>
        <div className="step-card__actions">
          <button type="submit" disabled={patch.isPending}>保存为新版本</button>
          <div className="step-card__count">
            <label>
              数量
              <input
                type="number"
                min={1}
                max={limits.maxImageBatchSize}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <button type="button" disabled={!active || startBatch.isPending} onClick={() => startBatch.mutate()}>
              生成 {count} 张图
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: CSS**

```css
.step-card { background: white; border: 1px solid #e7e7eb; border-radius: 8px; padding: 20px; max-width: 760px; }
.step-card h2 { margin-top: 0; }
.step-card__actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 16px; }
.step-card__count { display: flex; align-items: center; gap: 8px; }
.step-card__count input[type="number"] { width: 64px; }
.image-prompt-form label { display: block; margin: 12px 0 4px; font-size: 13px; color: #555; }
.image-prompt-form textarea, .image-prompt-form input { width: 100%; font: inherit; padding: 8px; border: 1px solid #c8c8d0; border-radius: 6px; }
```

- [ ] **Step 3: Smoke + commit**

Manual: navigate to `/workspaces/<id>?shot=<shotId>&step=image_prompt`. Expect: prompt panel renders, "生成初始 Prompt" works in `MODEL_MODE=mock`.

```bash
git add -A
git commit -m "feat(web): ImagePromptStep with version chips and batch trigger"
```

---

### Task 12: `ImageCandidatesStep`

**Files:**
- Modify: `apps/web/src/features/workspace/Focus/ImageCandidatesStep.tsx`
- Create: `apps/web/src/features/workspace/hooks/useImageBatch.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: `useImageBatch` hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { getImageBatch } from "../../../lib/api/imageBatch.js";
import { useVisibilityActive } from "./useVisibilityActive.js";

const TERMINAL = new Set(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]);

export function useImageBatch(shotId: string | null, batchId: string | null) {
  const visible = useVisibilityActive();
  return useQuery({
    queryKey: ["image-batch", shotId, batchId],
    queryFn: () => getImageBatch(shotId!, batchId!),
    enabled: Boolean(shotId && batchId),
    refetchInterval: (q) => {
      const data = q.state.data?.data;
      if (!visible) return false;
      if (!data) return 3_000;
      return TERMINAL.has(data.status) ? false : 3_000;
    },
  });
}
```

- [ ] **Step 2: `ImageCandidatesStep`**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { useImageBatch } from "../hooks/useImageBatch.js";
import { selectImage } from "../../../lib/api/imageSelect.js";
import { AssetStrip } from "./AssetStrip.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function ImageCandidatesStep({ workspaceId, shotId }: { workspaceId: string; shotId: string }) {
  const qc = useQueryClient();
  const status = useShotWorkflowStatus(workspaceId);
  const shot = status.data?.data.shots.find((s) => s.shotId === shotId);
  const batchId = shot?.activeImageBatchId ?? null;
  const batch = useImageBatch(shotId, batchId);

  const select = useMutation({
    mutationFn: (candId: string) => selectImage(shotId, { imageCandidateId: candId, imageGenerationBatchId: batchId! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      navigateFocus({ workspaceId, shotId, step: "video_script" });
    },
  });

  if (!batchId) return <div className="step-card">尚未发起图生成。请回到 Prompt 步骤。</div>;
  const detail = batch.data?.data;
  if (!detail) return <div className="step-card">加载中…</div>;
  const inflight = detail.status === "PENDING" || detail.status === "RUNNING";

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>选择分镜图</h2>
      <p className="step-card__meta">状态 {detail.status} · {detail.succeededCount}/{detail.requestedCount}</p>
      {inflight ? <div className="progress-strip"><div className="progress-strip__fill" /></div> : null}
      <div className="candidates-grid">
        {detail.candidates.map((c) => (
          <button key={c.id} className={`candidate-tile candidate-tile--${c.status.toLowerCase()}`}
            disabled={c.status !== "SUCCEEDED"}
            onClick={() => select.mutate(c.id)}
          >
            {c.imageUrl ? <img src={c.imageUrl} alt={c.id} /> : <span className="candidate-tile__missing">{c.errorMessage ?? c.status}</span>}
          </button>
        ))}
      </div>
      <div className="step-card__actions">
        <button onClick={() => navigateFocus({ workspaceId, shotId, step: "image_prompt" })}>← 编辑 Prompt 重新生成</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CSS**

```css
.candidates-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
.candidate-tile { padding: 0; border: 2px solid transparent; border-radius: 8px; cursor: pointer; background: #f7f7fa; aspect-ratio: 9/16; overflow: hidden; }
.candidate-tile:hover:not(:disabled) { border-color: #2c3aff; }
.candidate-tile > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.candidate-tile--failed { background: #ffefef; }
.candidate-tile__missing { display: grid; place-items: center; height: 100%; color: #b3434c; font-size: 12px; }
.progress-strip { height: 6px; background: #f0f0f3; border-radius: 999px; overflow: hidden; margin: 8px 0; }
.progress-strip__fill { width: 30%; height: 100%; background: #2c3aff; animation: progress-pulse 1.5s ease-in-out infinite; }
@keyframes progress-pulse { 0% { margin-left: 0; } 100% { margin-left: 70%; } }
.step-card__meta { color: #888; font-size: 12px; }
```

- [ ] **Step 4: Smoke + commit**

```bash
git add -A
git commit -m "feat(web): ImageCandidatesStep with batch polling + select-image"
```

---

## WAVE E — Focus video side (3 tasks)

### Task 13: `VideoScriptStep`

**Files:**
- Modify: `apps/web/src/features/workspace/Focus/VideoScriptStep.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Implement**

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listVideoScripts,
  patchVideoScript,
  proposeVideoScript,
  type VideoScriptArtifact,
} from "../../../lib/api/videoScript.js";
import { createVideoBatch } from "../../../lib/api/videoBatch.js";
import { useConfigLimits } from "../hooks/useConfigLimits.js";
import { AssetStrip } from "./AssetStrip.js";
import { VersionChips } from "./VersionChips.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function VideoScriptStep({ workspaceId, shotId }: { workspaceId: string; shotId: string }) {
  const qc = useQueryClient();
  const limits = useConfigLimits();
  const versions = useQuery({ queryKey: ["video-scripts", shotId], queryFn: () => listVideoScripts(shotId) });
  const list = versions.data?.data ?? [];
  const active = list.find((v) => v.status === "ACTIVE") ?? list[0];
  const [selectedId, setSelectedId] = useState<string | null>(active?.id ?? null);
  const showing = list.find((v) => v.id === (selectedId ?? active?.id));
  const { register, handleSubmit, reset } = useForm<{
    durationSec: number; cameraMotion: string; subjectMotion: string; providerPrompt: string; voiceover: string;
  }>({
    values: showing
      ? {
          durationSec: showing.durationSec,
          cameraMotion: String((showing.scriptJson as any).cameraMotion ?? ""),
          subjectMotion: String((showing.scriptJson as any).subjectMotion ?? ""),
          providerPrompt: showing.providerPrompt,
          voiceover: String((showing.scriptJson as any).voiceover ?? ""),
        }
      : { durationSec: 4, cameraMotion: "", subjectMotion: "", providerPrompt: "", voiceover: "" },
  });

  const propose = useMutation({
    mutationFn: (durationSec: number) => proposeVideoScript(workspaceId, shotId, { durationSec, useNeighborFrames: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-scripts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const patch = useMutation({
    mutationFn: (body: { durationSec: number; cameraMotion: string; subjectMotion: string; providerPrompt: string; voiceover: string }) =>
      patchVideoScript(shotId, active!.id, {
        baseVersion: active!.version,
        durationSec: body.durationSec,
        providerPrompt: body.providerPrompt,
        scriptJson: { ...((showing?.scriptJson as object) ?? {}), cameraMotion: body.cameraMotion, subjectMotion: body.subjectMotion, voiceover: body.voiceover },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-scripts", shotId] });
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const [count, setCount] = useState(limits.defaultVideoBatchSize);
  const startBatch = useMutation({
    mutationFn: () => {
      const key = `${workspaceId}:${shotId}:video-batch:${active!.id}:${Date.now()}`;
      return createVideoBatch(shotId, { videoScriptArtifactId: active!.id, count, aspectRatio: "9:16" }, key);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      navigateFocus({ workspaceId, shotId, step: "video_candidates" });
    },
  });

  if (!active) {
    return (
      <div className="step-card">
        <AssetStrip shotId={shotId} />
        <h2>视频剧本</h2>
        <p>当前分镜还没有视频剧本。</p>
        <button onClick={() => propose.mutate(4)}>生成初始剧本（4 秒）</button>
      </div>
    );
  }

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>视频剧本</h2>
      <VersionChips versions={list} activeId={showing?.id ?? null} onPick={(v) => { setSelectedId(v.id); reset({
        durationSec: v.durationSec,
        cameraMotion: String((v.scriptJson as any).cameraMotion ?? ""),
        subjectMotion: String((v.scriptJson as any).subjectMotion ?? ""),
        providerPrompt: v.providerPrompt,
        voiceover: String((v.scriptJson as any).voiceover ?? ""),
      }); }} />
      <form className="video-script-form" onSubmit={handleSubmit((body) => patch.mutate(body))}>
        <label>时长(秒)<input type="number" min={1} max={8} {...register("durationSec", { valueAsNumber: true, required: true })} /></label>
        <label>镜头运动<input {...register("cameraMotion", { required: true })} /></label>
        <label>主体运动<input {...register("subjectMotion", { required: true })} /></label>
        <label>解说<input {...register("voiceover")} /></label>
        <label>Provider Prompt<textarea rows={6} {...register("providerPrompt", { required: true, minLength: 30 })} /></label>
        <div className="step-card__actions">
          <button type="submit" disabled={patch.isPending}>保存为新版本</button>
          <div className="step-card__count">
            <label>数量<input type="number" min={1} max={limits.maxVideoBatchSize} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
            <button type="button" onClick={() => startBatch.mutate()} disabled={startBatch.isPending}>生成 {count} 个视频</button>
          </div>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: CSS**

```css
.video-script-form label { display: block; margin: 10px 0 4px; font-size: 13px; color: #555; }
.video-script-form input, .video-script-form textarea { width: 100%; font: inherit; padding: 8px; border: 1px solid #c8c8d0; border-radius: 6px; }
```

- [ ] **Step 3: Smoke + commit**

```bash
git add -A
git commit -m "feat(web): VideoScriptStep with structured form + version chips + batch trigger"
```

---

### Task 14: `VideoCandidatesStep`

**Files:**
- Modify: `apps/web/src/features/workspace/Focus/VideoCandidatesStep.tsx`
- Create: `apps/web/src/features/workspace/hooks/useVideoBatch.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: `useVideoBatch`**

```ts
import { useQuery } from "@tanstack/react-query";
import { getVideoBatch } from "../../../lib/api/videoBatch.js";
import { useVisibilityActive } from "./useVisibilityActive.js";

const TERMINAL = new Set(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]);

export function useVideoBatch(shotId: string | null, batchId: string | null) {
  const visible = useVisibilityActive();
  return useQuery({
    queryKey: ["video-batch", shotId, batchId],
    queryFn: () => getVideoBatch(shotId!, batchId!),
    enabled: Boolean(shotId && batchId),
    refetchInterval: (q) => {
      if (!visible) return false;
      const d = q.state.data?.data;
      if (!d) return 5_000;
      return TERMINAL.has(d.status) ? false : 5_000;
    },
  });
}
```

- [ ] **Step 2: Component**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { useVideoBatch } from "../hooks/useVideoBatch.js";
import { selectVideo } from "../../../lib/api/videoSelect.js";
import { AssetStrip } from "./AssetStrip.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function VideoCandidatesStep({ workspaceId, shotId }: { workspaceId: string; shotId: string }) {
  const qc = useQueryClient();
  const status = useShotWorkflowStatus(workspaceId);
  const shot = status.data?.data.shots.find((s) => s.shotId === shotId);
  const batchId = shot?.activeVideoBatchId ?? null;
  const batch = useVideoBatch(shotId, batchId);

  const select = useMutation({
    mutationFn: (candId: string) => selectVideo(shotId, { videoCandidateId: candId, videoGenerationBatchId: batchId! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      navigateFocus({ workspaceId, shotId, step: "review" });
    },
  });

  if (!batchId) return <div className="step-card">尚未生成视频。请返回剧本步骤。</div>;
  const d = batch.data?.data;
  if (!d) return <div className="step-card">加载中…</div>;
  const inflight = d.status === "PENDING" || d.status === "RUNNING";

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>选择分镜视频</h2>
      <p className="step-card__meta">状态 {d.status} · {d.succeededCount}/{d.requestedCount}</p>
      {inflight ? <div className="progress-strip"><div className="progress-strip__fill" /></div> : null}
      <div className="candidates-grid candidates-grid--videos">
        {d.candidates.map((c) => (
          <div key={c.id} className={`candidate-tile candidate-tile--${c.status.toLowerCase()}`}>
            {c.videoUrl ? (
              <video src={c.videoUrl} controls preload="metadata" />
            ) : (
              <span className="candidate-tile__missing">{c.errorMessage ?? c.status}</span>
            )}
            <button disabled={c.status !== "SUCCEEDED"} onClick={() => select.mutate(c.id)}>选这个</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CSS adjustment**

```css
.candidates-grid--videos { grid-template-columns: repeat(2, 1fr); }
.candidate-tile > video { width: 100%; aspect-ratio: 9/16; display: block; background: black; }
.candidate-tile > button { display: block; width: 100%; padding: 6px; border: 0; border-top: 1px solid #e7e7eb; background: white; cursor: pointer; font-size: 12px; }
.candidate-tile > button:disabled { color: #aaa; cursor: not-allowed; }
```

- [ ] **Step 4: Smoke + commit**

```bash
git add -A
git commit -m "feat(web): VideoCandidatesStep with mp4 preview + select-video"
```

---

### Task 15: `ReviewStep`

**Files:**
- Modify: `apps/web/src/features/workspace/Focus/ReviewStep.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useQuery } from "@tanstack/react-query";
import { getVideoBatch } from "../../../lib/api/videoBatch.js";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { AssetStrip } from "./AssetStrip.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function ReviewStep({ workspaceId, shotId }: { workspaceId: string; shotId: string }) {
  const status = useShotWorkflowStatus(workspaceId);
  const shot = status.data?.data.shots.find((s) => s.shotId === shotId);
  const batchId = shot?.activeVideoBatchId;
  const batch = useQuery({ queryKey: ["video-batch", shotId, batchId], queryFn: () => getVideoBatch(shotId, batchId!), enabled: Boolean(batchId) });
  const selectedId = shot?.selectedVideoId;
  const chosen = batch.data?.data.candidates.find((c) => c.id === selectedId);

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>已确认分镜视频</h2>
      {chosen?.videoUrl ? <video src={chosen.videoUrl} controls className="review-video" /> : <p>加载中…</p>}
      <div className="step-card__actions">
        <button onClick={() => navigateFocus({ workspaceId, shotId, step: "image_prompt" })}>重新编辑图 Prompt</button>
        <button onClick={() => navigateFocus({ workspaceId, shotId, step: "video_script" })}>重新编辑剧本</button>
        <button onClick={() => navigateFocus({ workspaceId, shotId, step: "video_candidates" })}>重新选视频</button>
      </div>
    </div>
  );
}
```

Append CSS: `.review-video { width: 100%; max-width: 480px; aspect-ratio: 9/16; }`.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(web): ReviewStep with locked thumbnail + back-edit shortcuts"
```

---

## WAVE F — Final compose + trace + polish (3 tasks)

### Task 16: `FinalComposeStep`

**Files:**
- Modify: `apps/web/src/features/workspace/Focus/FinalComposeStep.tsx`
- Create: `apps/web/src/features/workspace/hooks/useFinalVideo.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: `useFinalVideo`**

```ts
import { useQuery } from "@tanstack/react-query";
import { getFinalVideo } from "../../../lib/api/finalVideo.js";
import { useVisibilityActive } from "./useVisibilityActive.js";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

export function useFinalVideo(finalVideoJobId: string | null) {
  const visible = useVisibilityActive();
  return useQuery({
    queryKey: ["final-video", finalVideoJobId],
    queryFn: () => getFinalVideo(finalVideoJobId!),
    enabled: Boolean(finalVideoJobId),
    refetchInterval: (q) => {
      if (!visible) return false;
      const d = q.state.data?.data;
      if (!d) return 5_000;
      return TERMINAL.has(d.status) ? false : 5_000;
    },
  });
}
```

- [ ] **Step 2: Component**

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { createFinalVideo, type FinalVideoJob } from "../../../lib/api/finalVideo.js";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { useFinalVideo } from "../hooks/useFinalVideo.js";

export function FinalComposeStep({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const status = useShotWorkflowStatus(workspaceId);
  const can = status.data?.data.canComposeFinalVideo ?? false;
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const result = useFinalVideo(activeJobId);

  const start = useMutation({
    mutationFn: () => createFinalVideo(workspaceId, { outputAspectRatio: "9:16" }, `${workspaceId}:final:${Date.now()}`),
    onSuccess: (res) => {
      setActiveJobId(res.data.finalVideoJobId);
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const job: FinalVideoJob | undefined = result.data?.data;

  return (
    <div className="step-card">
      <h2>最终合成</h2>
      {!can ? <p>请确保所有分镜都已选中视频。</p> : (
        <>
          {!activeJobId && <button onClick={() => start.mutate()} disabled={start.isPending}>开始合成</button>}
          {activeJobId && job ? (
            <>
              <p>状态：{job.status}</p>
              {job.status === "SUCCEEDED" && job.localUrl ? (
                <>
                  <video src={job.localUrl} controls className="review-video" />
                  <a className="download-link" href={job.localUrl} download>
                    <Download size={14} /> 下载 MP4
                  </a>
                  <button onClick={() => start.mutate()}>再次合成</button>
                </>
              ) : (
                <div className="progress-strip"><div className="progress-strip__fill" /></div>
              )}
              {job.status === "FAILED" ? <p className="error-banner">合成失败：{job.errorMessage}</p> : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
```

CSS:

```css
.download-link { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; background: #2c3aff; color: white; border-radius: 6px; text-decoration: none; }
.error-banner { padding: 8px 12px; background: #ffefef; border: 1px solid #f3a8a8; color: #8a1a1a; border-radius: 6px; }
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(web): FinalComposeStep with polling + download"
```

---

### Task 17: `TraceDrawer`

**Files:**
- Create: `apps/web/src/features/workspace/TraceDrawer/TraceDrawer.tsx`
- Create: `apps/web/src/features/workspace/TraceDrawer/TraceEventRow.tsx`
- Create: `apps/web/src/features/workspace/hooks/useTraceStream.ts`
- Modify: `apps/web/src/features/workspace/WorkspaceLayout.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Hook**

```ts
import { useInfiniteQuery } from "@tanstack/react-query";
import { listWorkspaceTraces, type TraceEventRow } from "../../../lib/api/trace.js";

export function useTraceStream(workspaceId: string) {
  return useInfiniteQuery({
    queryKey: ["traces", workspaceId],
    queryFn: ({ pageParam }) => listWorkspaceTraces(workspaceId, { limit: 50, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => {
      const rows = last.data as TraceEventRow[];
      return rows.length === 50 ? rows.at(-1)?.id : undefined;
    },
  });
}
```

- [ ] **Step 2: Row component**

```tsx
import type { TraceEventRow } from "../../../lib/api/trace.js";

export function TraceEventRowView({ row }: { row: TraceEventRow }) {
  return (
    <li className={`trace-row trace-row--${row.traceType}`}>
      <div className="trace-row__head">
        <span className="trace-row__type">{row.traceType}</span>
        <span className="trace-row__name">{row.name}</span>
        <span className="trace-row__time">{new Date(row.createdAt).toLocaleTimeString()}</span>
      </div>
      {row.outputPreview ? <pre className="trace-row__preview">{row.outputPreview}</pre> : null}
    </li>
  );
}
```

- [ ] **Step 3: Drawer**

```tsx
import { useState } from "react";
import { useTraceStream } from "../hooks/useTraceStream.js";
import { TraceEventRowView } from "./TraceEventRow.js";

const TYPES = ["agent_run", "provider_call", "job_event", "state_transition", "user_action"] as const;

export function TraceDrawer({ workspaceId }: { workspaceId: string }) {
  const { data, fetchNextPage, hasNextPage } = useTraceStream(workspaceId);
  const [filter, setFilter] = useState<(typeof TYPES)[number] | "all">("all");
  const rows = (data?.pages ?? []).flatMap((p) => p.data);
  const filtered = filter === "all" ? rows : rows.filter((r) => r.traceType === filter);
  return (
    <div className="trace-drawer">
      <header className="trace-drawer__filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">全部</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </header>
      <ul className="trace-drawer__list">
        {filtered.map((r) => <TraceEventRowView key={r.id} row={r} />)}
      </ul>
      {hasNextPage ? <button className="trace-drawer__more" onClick={() => fetchNextPage()}>加载更多</button> : null}
    </div>
  );
}
```

- [ ] **Step 4: Mount in WorkspaceLayout**

Replace the placeholder `<aside className="workspace-layout__trace">…</aside>` with `<aside className="workspace-layout__trace"><TraceDrawer workspaceId={workspaceId} /></aside>`.

- [ ] **Step 5: CSS**

```css
.trace-drawer { padding: 12px; height: 100%; display: flex; flex-direction: column; }
.trace-drawer__list { list-style: none; padding: 0; margin: 12px 0; flex: 1; overflow-y: auto; }
.trace-row { padding: 8px 0; border-bottom: 1px solid #f0f0f3; font-size: 12px; }
.trace-row__head { display: flex; gap: 8px; align-items: center; }
.trace-row__type { padding: 1px 6px; background: #f0f0f3; border-radius: 999px; font-size: 11px; }
.trace-row__name { flex: 1; font-weight: 600; }
.trace-row__time { color: #888; font-size: 11px; }
.trace-row__preview { background: #fafafd; padding: 6px; border-radius: 4px; font-size: 11px; overflow-x: auto; }
.trace-drawer__more { margin-top: 8px; padding: 6px 12px; border: 1px solid #c8c8d0; border-radius: 6px; background: white; cursor: pointer; }
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): TraceDrawer with type filter + cursor pagination"
```

---

### Task 18: Toasts + active-job notifications

**Files:**
- Create: `apps/web/src/features/workspace/Toasts/ToastHost.tsx`
- Modify: `apps/web/src/features/workspace/WorkspaceLayout.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Inline toast store**

```tsx
// ToastHost.tsx
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { useEffect } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";

interface Toast { id: string; level: "info" | "success" | "error"; text: string; }
interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, "id">): void;
  dismiss(id: string): void;
}
const store = createStore<ToastState>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: `tst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function notify(level: Toast["level"], text: string) {
  store.getState().push({ level, text });
  setTimeout(() => {
    const cur = store.getState().toasts;
    if (cur.length) store.getState().dismiss(cur[0].id);
  }, 4000);
}

export function ToastHost() {
  const toasts = useStore(store, (s) => s.toasts);
  useEffect(() => undefined, []);
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.level}`}>
          {t.level === "success" ? <CheckCircle size={14} /> : t.level === "error" ? <AlertTriangle size={14} /> : null}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Active-job side-effect in WorkspaceLayout**

Inside WorkspaceLayout, observe `useShotWorkflowStatus(workspaceId)` and when a previously-active shot transitions to `VIDEO_CANDIDATES_READY`/`IMAGE_CANDIDATES_READY`/`VIDEO_SELECTED`, call `notify("success", "Shot X 完成")`. Implement via `useEffect` tracking the previous statuses in a ref.

```tsx
import { useEffect, useRef } from "react";
import { useShotWorkflowStatus } from "./hooks/useShotWorkflowStatus.js";
import { ToastHost, notify } from "./Toasts/ToastHost.js";

function useShotCompletionToasts(workspaceId: string) {
  const { data } = useShotWorkflowStatus(workspaceId);
  const prev = useRef<Record<string, string>>({});
  useEffect(() => {
    const shots = data?.data.shots ?? [];
    for (const s of shots) {
      const last = prev.current[s.shotId];
      if (last && last !== s.status && ["IMAGE_CANDIDATES_READY", "VIDEO_CANDIDATES_READY", "VIDEO_SELECTED"].includes(s.status)) {
        notify("success", `Shot ${s.orderIndex + 1} → ${s.status}`);
      }
      prev.current[s.shotId] = s.status;
    }
  }, [data]);
}
```

Call `useShotCompletionToasts(workspaceId)` inside the layout, and render `<ToastHost />` at the bottom.

- [ ] **Step 3: CSS**

```css
.toast-host { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 100; }
.toast { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: white; border: 1px solid #e0e0e6; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); font-size: 13px; }
.toast--success { border-color: #b8e0c5; }
.toast--error { border-color: #f3a8a8; background: #fff5f5; }
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): toast notifications for shot status transitions"
```

---

## WAVE G — Final polish (2 tasks)

### Task 19: Retry / stale handling

**Files:**
- Modify: `apps/web/src/features/workspace/Focus/ImageCandidatesStep.tsx`
- Modify: `apps/web/src/features/workspace/Focus/VideoCandidatesStep.tsx`
- Modify: `apps/web/src/features/workspace/Focus/VideoScriptStep.tsx`
- Modify: `apps/web/src/features/workspace/LeftRail/ShotList.tsx`

- [ ] **Step 1: Add a "Retry" button on FAILED status**

In `ImageCandidatesStep` and `VideoCandidatesStep`, when `detail.status === "FAILED"`, render a button calling `retryShot(shotId, "image_batch" | "video_batch", key)` (import from `lib/api/shots`). Invalidate workflow-status on success.

- [ ] **Step 2: Add stale banner on edited script**

In `VideoScriptStep`, when the active script's status is `STALE` (shouldn't be — versioning helper marks prior STALE) OR when the user-edited version's `baseVersion` no longer matches the current active, show `<StaleBanner message="基础版本已变化，请重新加载" />`.

- [ ] **Step 3: Status icon on ShotList FAILED rows**

Already done in Task 8 via `AlertCircle`. Verify and adjust copy.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): retry buttons + stale banners across step components"
```

---

### Task 20: Final smoke + acceptance

- [ ] **Step 1: Full build + tests**

```bash
pnpm typecheck
pnpm --filter @aigc-video/web build
pnpm --filter @aigc-video/web test
pnpm --filter @aigc-video/web lint
```

Expected: all green.

- [ ] **Step 2: End-to-end manual acceptance (against `MODEL_MODE=mock` backend)**

1. Open `/` — workspace list renders. Create a workspace.
2. Use existing brief/storyboard/shotprompt builder UI (still works via legacy routes) to produce a storyboard and approve shotprompt.
3. Navigate to `/workspaces/<id>?shot=<first-shot>&step=image_prompt`.
4. Generate initial prompt → 3 images → select one.
5. Edit video script → generate 5 videos → select one.
6. Walk through remaining shots.
7. Click "合成最终视频" → poll → mp4 plays inline → download works.
8. Open Trace drawer; rows appear and pagination works.

- [ ] **Step 3: Acceptance against real providers**

Repeat with `MODEL_MODE=real` and a real Ark text + image + Seedance video config. Verify candidate images and videos actually render.

- [ ] **Step 4: Tag**

```bash
git tag -m "Frontend overhaul complete" frontend-overhaul-complete
```

---

## Self-review

- **Spec coverage:** §10.1 layout (Tasks 4-5, 8-9). §10.2 focus model (Task 3 store + Task 10 router + auto-advance in Tasks 11-15). §10.3 step components (Tasks 11-15 + 16 for final compose). §10.4 LeftRail aggregate + final-compose CTA (Tasks 8 + 16). §10.5 AssetRail (Task 9). §10.6 polling strategy with visibility (Tasks 6 + 7 + 12 + 14 + 16). §10.7 module tree matches the new files exactly. §10.8 removals (Task 1).
- **Configurable counts:** all step components read `useConfigLimits()` and never hard-code 3 or 5 (Tasks 11, 13).
- **Idempotency:** every batch POST in this plan generates a per-click key including workspaceId+shotId+artifactId+timestamp (Tasks 11, 13, 16).
- **No placeholders:** every step has actual code or an explicit follow-up reference.
- **Test framework consistency:** tests use `node --test` via `tsx`, matching existing `package.json` script. No new test deps added.
- **Cross-file references:** `navigateFocus` exported from `WorkspaceLayout.tsx` (Task 5) and imported by Tasks 8, 10, 11, 12, 13, 14, 15, 16. `useFocusStore` defined in Task 3 and used in Tasks 8, 10. `notify` exported from `ToastHost.tsx` (Task 18) used inside the layout effect in the same task. `parseWorkspaceUrl`/`buildWorkspaceUrl` defined in Task 3, used in Task 5. All consistent.

---
