import {
  fetchJson,
  type WorkflowEnvelope,
  type ShotStatus,
  type NextAction,
  type UpstreamDrift,
  type WorkspaceShotSet,
} from "./client.js";

export interface ShotRow {
  id: string;
  workspaceId: string;
  orderIndex: number;
  title: string;
  objective: string | null;
  defaultDurationSec: number | null;
  status: ShotStatus;
  nextAction: NextAction;
  activeImagePromptArtifactId: string | null;
  selectedImageId: string | null;
  activeVideoScriptArtifactId: string | null;
  selectedVideoId: string | null;
}

export interface ShotSetShot extends ShotRow {
  shotSetId: string;
  requirements: {
    shotImage: unknown;
    shotVideo: unknown;
    sourceShotPromptArtifactId: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ShotSetHistoryMedia {
  candidateId: string;
  batchId: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  status: string | null;
}

export interface ShotSetHistoryVideo extends ShotSetHistoryMedia {
  thumbnailUrl: string | null;
  durationSec: number | null;
}

export interface ShotSetHistoryShot extends ShotSetShot {
  selectedImage: ShotSetHistoryMedia | null;
  selectedVideo: ShotSetHistoryVideo | null;
}

export interface WorkspaceShotSetHistoryItem extends WorkspaceShotSet {
  selectedImageCount: number;
  selectedVideoCount: number;
  shots: ShotSetHistoryShot[];
}

export interface WorkflowStatus {
  workspaceId: string;
  shots: Array<{
    shotId: string;
    orderIndex: number;
    status: ShotStatus;
    nextAction: NextAction;
    activeImagePromptArtifactId: string | null;
    selectedImageId: string | null;
    selectedImageUrl?: string | null;
    activeVideoScriptArtifactId: string | null;
    selectedVideoId: string | null;
    activeImageBatchId?: string | null;
    activeImageBatchStatus?:
      | "PENDING"
      | "RUNNING"
      | "SUCCEEDED"
      | "PARTIAL"
      | "FAILED"
      | "CANCELLED"
      | null;
    activeVideoBatchId?: string | null;
    activeVideoBatchStatus?:
      | "PENDING"
      | "RUNNING"
      | "SUCCEEDED"
      | "PARTIAL"
      | "FAILED"
      | "CANCELLED"
      | null;
    upstream?: UpstreamDrift;
    videoUpstream?: UpstreamDrift;
  }>;
  canComposeFinalVideo: boolean;
}

export function listShots(workspaceId: string) {
  return fetchJson<{ data: ShotSetShot[] }>(
    `/api/workspaces/${workspaceId}/shots`,
  );
}

export function listWorkspaceShotSets(workspaceId: string) {
  return fetchJson<{ data: WorkspaceShotSet[] }>(
    `/api/workspaces/${workspaceId}/shot-sets`,
  );
}

export function listWorkspaceShotSetHistory(workspaceId: string) {
  return fetchJson<{ data: WorkspaceShotSetHistoryItem[] }>(
    `/api/workspaces/${workspaceId}/shot-sets/history`,
  );
}

export function getShot(shotId: string) {
  return fetchJson<{ data: ShotRow }>(`/api/shots/${shotId}`);
}

export function getWorkflowStatus(workspaceId: string) {
  return fetchJson<{ data: WorkflowStatus }>(
    `/api/workspaces/${workspaceId}/shot-workflow-status`,
  );
}

export function retryShot(
  shotId: string,
  what: "image_batch" | "video_batch",
  idempotencyKey: string,
) {
  return fetchJson<WorkflowEnvelope<unknown>>(`/api/shots/${shotId}/retry`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ what }),
  });
}
