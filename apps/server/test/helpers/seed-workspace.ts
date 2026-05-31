import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./api-client.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface SeededWorkspace {
  workspaceId: string;
  localPath: string;
  scriptId: string;
  materialAssetIds: string[];
  shotIds: string[];
  cleanup(): Promise<void>;
}

export interface SeedWorkspaceOptions {
  label?: string;
}

interface WorkspaceCreateResponse {
  workspace: {
    id: string;
    localPath: string;
    currentScriptId: string;
  };
}

interface ArtifactProposeResponse {
  artifact: { id: string; data: unknown };
}

interface ShotRow {
  id: string;
  orderIndex: number;
}

export async function seedWorkspace(
  options: SeedWorkspaceOptions = {},
): Promise<SeededWorkspace> {
  const label =
    options.label ?? `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 1) Create workspace. Body schema only accepts {name?}.
  const ws = await api<WorkspaceCreateResponse>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name: label }),
  });
  const workspaceId = ws.workspace.id;
  const scriptId = ws.workspace.currentScriptId;

  // 2) Upload one material PNG (base64 path). Returns {workspace, material: {ref, bytes, url}}
  // — there is no Asset row id on the response.
  const pngBytes = await readFile(path.join(here, "fixtures", "red-apple.png"));
  const dataBase64 = pngBytes.toString("base64");
  await api("/api/workspaces/materials", {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      filename: "red-apple.png",
      dataBase64,
    }),
  });

  // 3) Material intake (hyphenated path).
  await api("/api/workspaces/material-intake", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });

  // 4) Brief: propose -> approve. Approve body must round-trip the propose response's
  // artifact.data so Zod accepts it.
  const brief = await api<ArtifactProposeResponse>(
    "/api/workspaces/brief/propose",
    {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    },
  );
  await api("/api/workspaces/artifacts/brief/approve", {
    method: "POST",
    body: JSON.stringify({ workspaceId, data: brief.artifact.data }),
  });

  // 5) Storyboard: propose -> approve.
  const storyboard = await api<ArtifactProposeResponse>(
    "/api/workspaces/storyboard/propose",
    {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    },
  );
  await api("/api/workspaces/artifacts/storyboard/approve", {
    method: "POST",
    body: JSON.stringify({ workspaceId, data: storyboard.artifact.data }),
  });

  // 6) Shotprompt: compile (deterministic) -> approve. Approve also seeds storyboard_shots
  // via seedShotsFromShotPrompt internally.
  const shotprompt = await api<ArtifactProposeResponse>(
    "/api/workspaces/shotprompt/compile",
    {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    },
  );
  await api("/api/workspaces/artifacts/shotprompt/approve", {
    method: "POST",
    body: JSON.stringify({ workspaceId, data: shotprompt.artifact.data }),
  });

  // 7) List shots. shotWorkflowService.listShots returns { data: [...] }.
  const shotsResp = await api<unknown>(`/api/workspaces/${workspaceId}/shots`);
  const shotsArray = extractShotsArray(shotsResp);
  const shotIds = shotsArray
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((s) => s.id);

  return {
    workspaceId,
    localPath: ws.workspace.localPath,
    scriptId,
    // TODO: V1 material upload returns {ref, url} — there is no V1 route that exposes the
    // Asset row ids that approveShotPrompt's seedShotsFromShotPrompt creates internally.
    // Returning [] means downstream tests exercise the propose/batch/select wiring without
    // product-image conditioning; the reference-image flow itself is covered by the
    // image.worker unit test added in Wave 2 Task 4.
    materialAssetIds: [],
    shotIds,
    cleanup: async () => {
      // Best-effort no-op: no DELETE route exists for test workspaces. The integration
      // runner doesn't depend on cleanup for correctness; each test creates a fresh
      // workspace with a unique label.
    },
  };
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
    `Unexpected /shots response shape: ${JSON.stringify(resp).slice(0, 200)}`,
  );
}

interface ImagePromptProposeResponse {
  data: { id: string };
  batch: { id: string };
  candidates: Array<{ id: string; imageUrl: string; status: string }>;
}

export async function seedShotWithSelectedImage(
  ws: SeededWorkspace,
  shotIdx = 0,
): Promise<{
  shotId: string;
  imageCandidateId: string;
  imageGenerationBatchId: string;
  imagePromptArtifactId: string;
}> {
  const shotId = ws.shotIds[shotIdx];
  if (!shotId) throw new Error(`no shot at index ${shotIdx}`);

  const proposal = await api<ImagePromptProposeResponse>(
    `/api/workspaces/${ws.workspaceId}/shots/${shotId}/image-prompts/propose`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  const batchId = proposal.batch.id;
  const pick = proposal.candidates.find(
    (c) => c.status === "SUCCEEDED" && c.imageUrl,
  );
  if (!pick) throw new Error(`no usable candidate in batch ${batchId}`);

  await api(`/api/workspaces/${ws.workspaceId}/shots/${shotId}/image-candidates/select`, {
    method: "POST",
    body: JSON.stringify({
      imageCandidateId: pick.id,
      imageGenerationBatchId: batchId,
    }),
  });

  return {
    shotId,
    imageCandidateId: pick.id,
    imageGenerationBatchId: batchId,
    imagePromptArtifactId: proposal.data.id,
  };
}
