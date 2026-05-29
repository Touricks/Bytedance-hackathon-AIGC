import {
  fetchJson,
  type WorkflowEnvelope,
  type AspectRatio,
} from "./client.js";

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
  candidates: VideoCandidate[];
}

export function createVideoBatch(
  shotId: string,
  body: {
    videoScriptArtifactId: string;
    count?: number;
    aspectRatio: AspectRatio;
  },
  idempotencyKey: string,
) {
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
