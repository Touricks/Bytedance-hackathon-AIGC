import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_REAL_PROVIDER_E2E = process.env.RUN_REAL_PROVIDER_E2E === "true";

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
  artifact: { id: string; data: unknown };
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

  const pngBytes = readFileSync(fixturePath);
  await apiPost(request, "/api/workspaces/materials", {
    workspaceId,
    filename: "red-apple.png",
    dataBase64: pngBytes.toString("base64")
  });
  await apiPost(request, "/api/workspaces/material-intake", { workspaceId });

  const brief = await apiPost<ArtifactProposeResponse>(
    request,
    "/api/workspaces/brief/propose",
    { workspaceId }
  );
  await apiPost(request, "/api/workspaces/artifacts/brief/approve", {
    workspaceId,
    data: brief.artifact.data
  });

  const storyboard = await apiPost<ArtifactProposeResponse>(
    request,
    "/api/workspaces/storyboard/propose",
    { workspaceId }
  );
  await apiPost(request, "/api/workspaces/artifacts/storyboard/approve", {
    workspaceId,
    data: storyboard.artifact.data
  });

  const shotprompt = await apiPost<ArtifactProposeResponse>(
    request,
    "/api/workspaces/shotprompt/compile",
    { workspaceId }
  );
  await apiPost(request, "/api/workspaces/artifacts/shotprompt/approve", {
    workspaceId,
    data: shotprompt.artifact.data
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
// 1) Backend shell — fast. Verifies real backend reachable, managed workspace
//    creation works, and the focus mode shell mounts. No provider calls.
// ---------------------------------------------------------------------------

test("creates a managed workspace via real backend and lands on focus mode", async ({
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
  await page.getByRole("button", { name: "新建托管工作区" }).click();

  await expect(page).toHaveURL(/\/workspaces\/[a-zA-Z0-9_-]+/, {
    timeout: 30_000
  });

  // Workbench shell renders even before the workspace has seeded shots.
  await expect(page.getByRole("heading", { name: "Artifact Pipeline" })).toBeVisible({
    timeout: 15_000
  });
  await expect(page.getByRole("heading", { name: "Shot Workbench" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2) Real provider flow — gated. Drives one shot through:
//      image-prompt propose -> image batch -> select image
//    via the UI against real Ark text + Ark Seedream image endpoints.
//    Skips the @expensive video stage.
// ---------------------------------------------------------------------------

test.describe("real provider flow @provider", () => {
  test.skip(
    !RUN_REAL_PROVIDER_E2E,
    "set RUN_REAL_PROVIDER_E2E=true (and TEXT_*/IMAGE_* in .env on the server) to run"
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
    await expect(page.getByText(firstShotId.slice(0, 6))).toBeVisible({
      timeout: 30_000
    });

    // Step 1: propose image prompt and create the internal image batch.
    await page.getByRole("button", { name: /Image propose/ }).click({
      timeout: 10_000
    });

    // Step 2: wait for at least one SUCCEEDED candidate tile. Image generation
    // typically takes 8–30 s per candidate; we wait up to 4 min.
    const succeededTile = page.locator(".workbench-candidate--good").first();
    await expect(succeededTile).toBeVisible({ timeout: 4 * 60_000 });

    // Step 3: select the first succeeded candidate.
    await succeededTile.click();

    await expect(page.getByText("IMAGE_SELECTED")).toBeVisible({
      timeout: 30_000
    });
  });
});
