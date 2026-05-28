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

export function proposeImagePrompt(
  workspaceId: string,
  shotId: string,
  body: {
    referenceAssetIds: string[];
    userHint?: string;
    stylePresetId?: string;
  },
) {
  return fetchJson<WorkflowEnvelope<ImagePromptArtifact>>(
    `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function patchImagePrompt(
  shotId: string,
  artifactId: string,
  body: {
    promptText: string;
    negativePrompt?: string;
    referenceAssetIds: string[];
  },
) {
  return fetchJson<WorkflowEnvelope<ImagePromptArtifact>>(
    `/api/shots/${shotId}/image-prompts/${artifactId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function listImagePrompts(shotId: string) {
  return fetchJson<{ data: ImagePromptArtifact[] }>(
    `/api/shots/${shotId}/image-prompts`,
  );
}
