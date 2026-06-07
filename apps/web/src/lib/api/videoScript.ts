import { fetchJson, type WorkflowEnvelope } from "./client.js";
import type { VideoBatchDetail, VideoCandidate } from "./videoBatch.js";

export interface VideoScriptArtifact {
  id: string;
  shotId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "APPROVED" | "STALE" | "ARCHIVED";
  durationSec: number;
  scriptJson: Record<string, unknown>;
  providerPrompt: string;
  basedOnImageCandidateId: string;
  basedOnPrevImageCandidateId: string | null;
  basedOnNextImageCandidateId: string | null;
  createdBy: string;
  createdAt: string;
}

export function proposeVideoScript(
  workspaceId: string,
  shotId: string,
  body: {
    userDirection?: string;
    candidateCount?: number;
  },
) {
  return fetchJson<
    WorkflowEnvelope<VideoScriptArtifact> & {
      artifact: VideoScriptArtifact;
      batch: VideoBatchDetail;
      candidates: VideoCandidate[];
      context?: unknown;
      frames?: {
        firstFrameCandidateId: string;
        lastFrameCandidateId: string | null;
        firstFrameUrl: string | null;
        lastFrameUrl: string | null;
      };
    }
  >(
    `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/propose`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function regenerateVideoScript(
  workspaceId: string,
  shotId: string,
  body: {
    baseArtifactId: string;
    feedbackVideoCandidateId: string;
    userDirection: string;
    candidateCount?: number;
  },
) {
  return fetchJson<
    WorkflowEnvelope<VideoScriptArtifact> & {
      artifact: VideoScriptArtifact;
      batch: VideoBatchDetail;
      candidates: VideoCandidate[];
      context?: unknown;
      frames?: {
        firstFrameCandidateId: string;
        lastFrameCandidateId: string | null;
        firstFrameUrl: string | null;
        lastFrameUrl: string | null;
      };
    }
  >(
    `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/regenerate`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function listVideoScripts(shotId: string) {
  return fetchJson<{ data: VideoScriptArtifact[] }>(
    `/api/shots/${shotId}/video-scripts`,
  );
}
