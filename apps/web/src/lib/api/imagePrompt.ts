import { fetchJson, type WorkflowEnvelope } from "./client.js";
import type { ImageBatchDetail, ImageCandidate } from "./imageBatch.js";

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
    userDirection?: string;
  },
) {
  return fetchJson<
    WorkflowEnvelope<ImagePromptArtifact> & {
      artifact: ImagePromptArtifact;
      batch: ImageBatchDetail;
      candidates: ImageCandidate[];
      created?: number;
      usage?: unknown;
      context?: unknown;
    }
  >(
    `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/propose`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function listImagePrompts(shotId: string) {
  return fetchJson<{ data: ImagePromptArtifact[] }>(
    `/api/shots/${shotId}/image-prompts`,
  );
}
