import { fetchJson, type WorkflowEnvelope } from "./client.js";

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
    durationSec: number;
    useNeighborFrames: boolean;
    userHint?: string;
  },
) {
  return fetchJson<WorkflowEnvelope<VideoScriptArtifact>>(
    `/api/workspaces/${workspaceId}/shots/${shotId}/video-scripts/propose`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function patchVideoScript(
  shotId: string,
  scriptId: string,
  body: {
    baseVersion: number;
    durationSec: number;
    scriptJson: Record<string, unknown>;
    providerPrompt: string;
  },
) {
  return fetchJson<WorkflowEnvelope<VideoScriptArtifact>>(
    `/api/shots/${shotId}/video-scripts/${scriptId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export function listVideoScripts(shotId: string) {
  return fetchJson<{ data: VideoScriptArtifact[] }>(
    `/api/shots/${shotId}/video-scripts`,
  );
}
