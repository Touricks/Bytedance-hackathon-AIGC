import {
  fetchJson,
  type WorkflowEnvelope,
  type AspectRatio,
} from "./client.js";

export interface ImageCandidate {
  id: string;
  imageUrl: string | null;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  errorMessage?: string | null;
}

export interface ImageBatchDetail {
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

export function createImageBatch(
  shotId: string,
  body: {
    imagePromptArtifactId: string;
    count?: number;
    aspectRatio: AspectRatio;
  },
  idempotencyKey: string,
) {
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
