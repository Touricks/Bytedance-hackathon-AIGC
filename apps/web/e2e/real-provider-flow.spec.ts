import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";

const fixturePath = path.resolve(
  here,
  "../../server/test/helpers/fixtures/red-apple.png"
);

async function apiPost<T>(
  request: APIRequestContext,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<T> {
  const res = await request.post(`${API_BASE_URL}${path}`, {
    headers: { "content-type": "application/json", ...(headers ?? {}) },
    data: body === undefined ? "" : JSON.stringify(body),
    timeout: 90_000
  });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`POST ${path} -> ${res.status()}: ${text}`);
  }
  return (await res.json()) as T;
}

async function apiGet<T>(
  request: APIRequestContext,
  path: string
): Promise<T> {
  const res = await request.get(`${API_BASE_URL}${path}`, { timeout: 30_000 });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`GET ${path} -> ${res.status()}: ${text}`);
  }
  return (await res.json()) as T;
}

interface CreatedWorkspace {
  workspace: { id: string; localPath: string; currentScriptId: string };
}
interface ArtifactProposeResponse {
  data: { id: string; data: unknown };
}
interface ShotRow {
  id: string;
  orderIndex: number;
}

async function seedWorkspaceViaApi(request: APIRequestContext): Promise<{
  workspaceId: string;
  scriptId: string;
  firstShotId: string;
}> {
  const label = `e2e-${Date.now()}`;
  const ws = await apiPost<CreatedWorkspace>(request, "/api/workspaces", {
    name: label
  });
  const workspaceId = ws.workspace.id;
  const scriptId = ws.workspace.currentScriptId;
  const workspaceDirectory = await mkdtemp(path.join(os.tmpdir(), "web-e2e-"));
  await apiPost(request, `/api/workspaces/${workspaceId}/storage/bind`, {
    kind: "local",
    localPath: workspaceDirectory
  });

  const pngBytes = readFileSync(fixturePath);
  await apiPost(request, `/api/workspaces/${workspaceId}/materials`, {
    filename: "red-apple.png",
    dataBase64: pngBytes.toString("base64")
  });
  const requirements = await apiPost<ArtifactProposeResponse>(
    request,
    `/api/workspaces/${workspaceId}/prompt-requirements/propose`,
    {
      data: {
        image: { style: "clean ecommerce product photography" },
        script: { tone: "confident and concise" },
        storyboard: { rhythm: "fast product reveal" },
        shotImage: { continuity: "preserve product identity" },
        shotVideo: { motion: "smooth and stable" }
      }
    }
  );
  await apiPost(request, `/api/workspaces/${workspaceId}/prompt-requirements/approve`, {
    artifactId: requirements.data.id
  });

  const material = await apiPost<ArtifactProposeResponse>(
    request,
    `/api/workspaces/${workspaceId}/material-intake/propose`,
    { selectedMaterialRefs: ["red-apple.png"] }
  );
  await apiPost(request, `/api/workspaces/${workspaceId}/material-intake/approve`, {
    artifactId: material.data.id
  });

  const brief = await apiPost<ArtifactProposeResponse>(
    request,
    `/api/workspaces/${workspaceId}/product-brief/propose`,
    {}
  );
  await apiPost(request, `/api/workspaces/${workspaceId}/product-brief/approve`, {
    artifactId: brief.data.id
  });

  const storyboard = await apiPost<ArtifactProposeResponse>(
    request,
    `/api/workspaces/${workspaceId}/storyboard/propose`,
    {}
  );
  await apiPost(request, `/api/workspaces/${workspaceId}/storyboard/approve`, {
    artifactId: storyboard.data.id
  });

  const shotprompt = await apiPost<ArtifactProposeResponse>(
    request,
    `/api/workspaces/${workspaceId}/shotprompt/propose`,
    {}
  );
  const approvedShotPrompt = await apiPost<ArtifactProposeResponse>(
    request,
    `/api/workspaces/${workspaceId}/shotprompt/approve`,
    { artifactId: shotprompt.data.id }
  );
  await apiPost(request, `/api/workspaces/${workspaceId}/shot-sets`, {
    shotPromptArtifactId: approvedShotPrompt.data.id
  });

  const shotsResp = await apiGet<unknown>(
    request,
    `/api/workspaces/${workspaceId}/shots`
  );
  const shots = extractShotsArray(shotsResp).sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  if (shots.length === 0) {
    throw new Error("no shots seeded after shotprompt approve");
  }

  return { workspaceId, scriptId, firstShotId: shots[0]!.id };
}

function extractShotsArray(resp: unknown): ShotRow[] {
  if (Array.isArray(resp)) return resp as ShotRow[];
  if (typeof resp === "object" && resp !== null) {
    const o = resp as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as ShotRow[];
    if (Array.isArray(o.shots)) return o.shots as ShotRow[];
    if (
      o.data &&
      typeof o.data === "object" &&
      Array.isArray((o.data as { shots?: unknown }).shots)
    ) {
      return (o.data as { shots: ShotRow[] }).shots;
    }
  }
  throw new Error(
    `Unexpected /shots response shape: ${JSON.stringify(resp).slice(0, 200)}`
  );
}

// ---------------------------------------------------------------------------
// 1) Backend shell — fast. Verifies real backend reachable, local workspace
//    initialization works, and the focus mode shell mounts. No provider calls.
// ---------------------------------------------------------------------------

test("opens a local workspace via real backend and lands on focus mode", async ({
  page,
  request
}) => {
  // Sanity: backend reachable.
  let backendReachable = false;
  let backendStatus = "unreachable";
  try {
    const health = await request.get(`${API_BASE_URL}/api/config/limits`);
    backendReachable = health.ok();
    backendStatus = String(health.status());
  } catch {
    backendReachable = false;
  }
  test.skip(
    !backendReachable,
    `backend not reachable at ${API_BASE_URL} (status ${backendStatus}); start pnpm dev`
  );

  await page.goto("/");
  const workspaceDirectory = await mkdtemp(path.join(os.tmpdir(), "web-shell-"));
  await page.getByLabel("工作目录路径").fill(workspaceDirectory);
  await page.getByRole("button", { name: "打开" }).click();

  await expect(page).toHaveURL(/\/workspaces\/[a-zA-Z0-9_-]+/, {
    timeout: 30_000
  });

  // Review desk shell renders even before the workspace has seeded shots.
  await expect(page.getByText("创作审核台")).toBeVisible({
    timeout: 15_000
  });
  await expect(page.getByRole("heading", { name: "创作要求 + 上传素材" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2) Real provider flow — disabled. It used to drive one shot through:
//      image-prompt propose -> image batch -> select image
//    via the UI against real Ark text + Ark Seedream image endpoints.
//    Use scripts/ provider probes for direct provider diagnosis instead.
// ---------------------------------------------------------------------------

test.describe("real provider flow @provider", () => {
  test.skip(
    true,
    "disabled: no official real-provider smoke package script; use scripts/ provider probes for direct provider diagnosis"
  );
  test.setTimeout(8 * 60_000);

  let workspaceId: string;
  let firstShotId: string;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(6 * 60_000);
    const seeded = await seedWorkspaceViaApi(request);
    workspaceId = seeded.workspaceId;
    firstShotId = seeded.firstShotId;
  });

  test("propose prompt -> generate images -> select first SUCCEEDED candidate", async ({
    page
  }) => {
    await page.goto(`/workspaces/${workspaceId}`);
    await expect(page.getByRole("heading", { name: "分镜图选择" })).toBeVisible({
      timeout: 30_000
    });

    // Step 1: propose image prompt and create the internal image batch.
    await page.getByRole("button", { name: /生成分镜图候选/ }).click({
      timeout: 10_000
    });

    // Step 2: wait for at least one SUCCEEDED candidate tile. Image generation
    // typically takes 8–30 s per candidate; we wait up to 4 min.
    const succeededTile = page.locator(".review-candidate--good").first();
    await expect(succeededTile).toBeVisible({ timeout: 4 * 60_000 });

    // Step 3: select the first succeeded candidate.
    await succeededTile.click();

    await expect(page.getByText("IMAGE_SELECTED")).toBeVisible({
      timeout: 30_000
    });
  });
});
