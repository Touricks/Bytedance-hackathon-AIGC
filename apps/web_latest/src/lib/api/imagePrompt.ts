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
  promptJson?: ImagePromptJson | null;
  sourceFingerprint?: unknown;
  promptAssembly?: unknown;
  baseArtifactId?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ImagePromptReferenceUsage {
  assetId: string;
  usage: "product_identity" | "style_reference" | "scene_reference";
  instruction: string;
}

export interface ImagePromptJson {
  promptText: string;
  negativePrompt: string | null;
  visualStyle: string | null;
  composition: string | null;
  lighting: string | null;
  productVisibilityRule: string;
  referenceImageUsage: ImagePromptReferenceUsage[];
  qualityChecklist: string[];
  context?: unknown;
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

export function regenerateImagePrompt(
  workspaceId: string,
  shotId: string,
  body: {
    baseArtifactId: string;
    userDirection?: string;
  },
) {
  return fetchJson<
    WorkflowEnvelope<ImagePromptArtifact> & {
      artifact: ImagePromptArtifact;
      batch: ImageBatchDetail;
      candidates: ImageCandidate[];
      context?: unknown;
    }
  >(
    `/api/workspaces/${workspaceId}/shots/${shotId}/image-prompts/regenerate`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function listImagePrompts(shotId: string) {
  return fetchJson<{ data: ImagePromptArtifact[] }>(
    `/api/shots/${shotId}/image-prompts`,
  );
}
