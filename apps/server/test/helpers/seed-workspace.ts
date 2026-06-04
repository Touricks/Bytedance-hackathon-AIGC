import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
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
    localPath: string | null;
    currentScriptId: string;
  };
}

interface ArtifactProposeResponse {
  data: { id: string; data: unknown };
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
  const localPath = await mkdtemp(path.join(os.tmpdir(), `${label}-`));
  await api(`/api/workspaces/${workspaceId}/storage/bind`, {
    method: "POST",
    body: JSON.stringify({ kind: "local", localPath }),
  });

  // 2) Upload one material PNG (base64 path). Returns {workspace, material: {ref, bytes, url}}
  // — there is no Asset row id on the response.
  const pngBytes = await readFile(path.join(here, "fixtures", "red-apple.png"));
  const dataBase64 = pngBytes.toString("base64");
  await api(`/api/workspaces/${workspaceId}/materials`, {
    method: "POST",
    body: JSON.stringify({
      filename: "red-apple.png",
      dataBase64,
    }),
  });

  // 3) Prompt requirements, then material-intake propose -> approve.
  const requirements = await api<ArtifactProposeResponse>(
    `/api/workspaces/${workspaceId}/prompt-requirements/propose`,
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          image: { style: "clean ecommerce product photo" },
          script: { tone: "direct" },
          storyboard: { structure: "hook-benefit-proof-cta" },
          shotImage: { continuity: "preserve product identity" },
          shotVideo: { motion: "stable product-first movement" },
        },
      }),
    },
  );
  await api(`/api/workspaces/${workspaceId}/prompt-requirements/approve`, {
    method: "POST",
    body: JSON.stringify({ artifactId: requirements.data.id }),
  });

  const material = await api<ArtifactProposeResponse>(
    `/api/workspaces/${workspaceId}/material-intake/propose`,
    {
      method: "POST",
      body: JSON.stringify({ selectedMaterialRefs: ["red-apple.png"] }),
    },
  );
  await api(`/api/workspaces/${workspaceId}/material-intake/approve`, {
    method: "POST",
    body: JSON.stringify({ artifactId: material.data.id }),
  });

  // 4) Brief: propose -> approve. Approve body must round-trip the propose response's
  // artifact.data so Zod accepts it.
  const brief = await api<ArtifactProposeResponse>(
    `/api/workspaces/${workspaceId}/product-brief/propose`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  await api(`/api/workspaces/${workspaceId}/product-brief/approve`, {
    method: "POST",
    body: JSON.stringify({ artifactId: brief.data.id }),
  });

  // 5) Storyboard: propose -> approve.
  const storyboard = await api<ArtifactProposeResponse>(
    `/api/workspaces/${workspaceId}/storyboard/propose`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  await api(`/api/workspaces/${workspaceId}/storyboard/approve`, {
    method: "POST",
    body: JSON.stringify({ artifactId: storyboard.data.id }),
  });

  // 6) Shotprompt: propose -> approve, then explicitly apply a shot set.
  const shotprompt = await api<ArtifactProposeResponse>(
    `/api/workspaces/${workspaceId}/shotprompt/propose`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  const approvedShotPrompt = await api<ArtifactProposeResponse>(
    `/api/workspaces/${workspaceId}/shotprompt/approve`,
    {
      method: "POST",
      body: JSON.stringify({ artifactId: shotprompt.data.id }),
    },
  );
  await api(`/api/workspaces/${workspaceId}/shot-sets`, {
    method: "POST",
    body: JSON.stringify({ shotPromptArtifactId: approvedShotPrompt.data.id }),
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
    localPath,
    scriptId,
    materialAssetIds: [],
    shotIds,
    cleanup: async () => {
      await rm(localPath, { recursive: true, force: true });
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
