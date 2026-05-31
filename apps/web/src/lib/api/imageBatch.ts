import { fetchJson, type WorkflowEnvelope } from "./client.js";
import type { ImagePromptArtifact } from "./imagePrompt.js";

export interface ImageCandidate {
  id: string;
  imageUrl: string | null;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  errorMessage?: string | null;
}

export interface ImageBatchDetail {
  id: string;
  batchId: string;
  status:
    | "PENDING"
    | "RUNNING"
    | "SUCCEEDED"
    | "PARTIAL"
    | "FAILED"
    | "CANCELLED";
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  candidates: ImageCandidate[];
}

interface ImageBatchRow extends Omit<ImageBatchDetail, "batchId" | "candidates"> {
  workspaceId: string;
  shotId: string;
  imagePromptArtifactId: string;
  provider: string;
  aspectRatio: string;
  providerRequest: unknown;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageRound {
  artifact: ImagePromptArtifact;
  batch: ImageBatchRow | null;
  candidates: ImageCandidate[];
  selection: {
    shotId: string;
    selectedCandidateId: string;
    selectedImageUrl: string;
    nextShotId: string | null;
    allShotsImageSelected: boolean;
  } | null;
  context: unknown;
}

export function listImageRounds(workspaceId: string, shotId: string) {
  return fetchJson<{ data: ImageRound[] }>(
    `/api/workspaces/${workspaceId}/shots/${shotId}/image-rounds`,
  );
}

export async function getImageBatch(
  workspaceId: string,
  shotId: string,
  batchId: string,
): Promise<WorkflowEnvelope<ImageBatchDetail>> {
  const rounds = await listImageRounds(workspaceId, shotId);
  const round = rounds.data.find((item) => item.batch?.id === batchId);
  if (!round?.batch) {
    throw new Error(`Image round ${batchId} was not found`);
  }
  return {
    data: {
      ...round.batch,
      batchId: round.batch.id,
      candidates: round.candidates,
    },
  };
}
