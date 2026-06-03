import {
  fetchJson,
  type WorkflowEnvelope,
  type AspectRatio,
} from "./client.js";

export interface FinalVideoJob {
  id: string;
  workspaceId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  localUrl: string | null;
  durationSec: number | null;
  compiledManifestHash: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface FinalVideoJobSummary extends FinalVideoJob {
  updatedAt?: string;
  completedAt?: string | null;
}

export function createFinalVideo(
  workspaceId: string,
  body: { outputAspectRatio: AspectRatio },
  idempotencyKey: string,
) {
  return fetchJson<
    WorkflowEnvelope<{
      finalVideoJobId: string;
      jobId: string;
      status: string;
    }>
  >(`/api/workspaces/${workspaceId}/final-videos`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

export function getFinalVideo(finalVideoJobId: string) {
  return fetchJson<{ data: FinalVideoJob }>(
    `/api/final-videos/${finalVideoJobId}`,
  );
}

export function listFinalVideos(workspaceId: string) {
  return fetchJson<{ data: FinalVideoJobSummary[] }>(
    `/api/workspaces/${workspaceId}/final-videos`,
  );
}

export function finalVideoDownloadUrl(localUrl: string) {
  const separator = localUrl.includes("?") ? "&" : "?";
  return `${localUrl}${separator}download=1`;
}
