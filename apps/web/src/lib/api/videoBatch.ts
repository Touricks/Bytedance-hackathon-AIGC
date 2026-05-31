import { fetchJson, type WorkflowEnvelope } from "./client.js";
import type { VideoScriptArtifact } from "./videoScript.js";

export interface VideoCandidate {
  id: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  errorMessage?: string | null;
}

export interface VideoBatchDetail {
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
  candidates: VideoCandidate[];
}

interface VideoBatchRow extends Omit<VideoBatchDetail, "batchId" | "candidates"> {
  workspaceId: string;
  shotId: string;
  videoScriptArtifactId: string;
  provider: string;
  aspectRatio: string;
  providerRequest: unknown;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoRound {
  artifact: VideoScriptArtifact;
  batch: VideoBatchRow | null;
  candidates: VideoCandidate[];
  selection: {
    shotId: string;
    selectedCandidateId: string;
    selectedVideoUrl: string;
    duration: number;
    allShotsVideoSelected: boolean;
  } | null;
  frames: {
    firstFrameUrl: string | null;
    lastFrameUrl: string | null;
    firstFrameCandidateId: string | null;
    lastFrameCandidateId: string | null;
  };
  context: unknown;
}

export function listVideoRounds(workspaceId: string, shotId: string) {
  return fetchJson<{ data: VideoRound[] }>(
    `/api/workspaces/${workspaceId}/shots/${shotId}/video-rounds`,
  );
}

export async function getVideoBatch(
  workspaceId: string,
  shotId: string,
  batchId: string,
): Promise<WorkflowEnvelope<VideoBatchDetail>> {
  const rounds = await listVideoRounds(workspaceId, shotId);
  const round = rounds.data.find((item) => item.batch?.id === batchId);
  if (!round?.batch) {
    throw new Error(`Video round ${batchId} was not found`);
  }
  return {
    data: {
      ...round.batch,
      batchId: round.batch.id,
      candidates: round.candidates,
    },
  };
}
