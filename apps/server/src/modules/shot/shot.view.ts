import { getNextAction, type NextAction, type ShotStatus } from "./shot.state.js";

export interface WorkflowShotUpstream {
  upstreamChanged: boolean;
  changedSources: string[];
}

export type WorkflowBatchStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export interface WorkflowShotSource {
  id: string;
  orderIndex: number;
  status: string;
  activeImagePromptArtifactId: string | null;
  selectedImageId: string | null;
  activeVideoScriptArtifactId: string | null;
  selectedVideoId: string | null;
}

export interface WorkflowShotExtras {
  activeImageBatchId: string | null;
  activeVideoBatchId: string | null;
  activeVideoBatchStatus: WorkflowBatchStatus | null;
  selectedImageCandidate: { imageUrl: string | null } | null;
  upstream: WorkflowShotUpstream;
  videoUpstream: WorkflowShotUpstream;
}

export interface WorkflowShotRow {
  shotId: string;
  orderIndex: number;
  status: string;
  nextAction: NextAction;
  activeImagePromptArtifactId: string | null;
  selectedImageId: string | null;
  selectedImageUrl: string | null;
  activeVideoScriptArtifactId: string | null;
  selectedVideoId: string | null;
  activeImageBatchId: string | null;
  activeVideoBatchId: string | null;
  activeVideoBatchStatus: WorkflowBatchStatus | null;
  upstream: WorkflowShotUpstream;
  videoUpstream: WorkflowShotUpstream;
}

/**
 * Build the per-shot row returned by the shot-workflow-status endpoint.
 *
 * `selectedImageUrl` resolves the selected image candidate's URL so the
 * creative review shot list can render the chosen thumbnail without an extra
 * per-shot image-rounds request.
 */
export function buildWorkflowShotRow(
  shot: WorkflowShotSource,
  extras: WorkflowShotExtras,
): WorkflowShotRow {
  return {
    shotId: shot.id,
    orderIndex: shot.orderIndex,
    status: shot.status,
    nextAction: getNextAction(shot.status as ShotStatus),
    activeImagePromptArtifactId: shot.activeImagePromptArtifactId,
    selectedImageId: shot.selectedImageId,
    selectedImageUrl: extras.selectedImageCandidate?.imageUrl ?? null,
    activeVideoScriptArtifactId: shot.activeVideoScriptArtifactId,
    selectedVideoId: shot.selectedVideoId,
    activeImageBatchId: extras.activeImageBatchId,
    activeVideoBatchId: extras.activeVideoBatchId,
    activeVideoBatchStatus: extras.activeVideoBatchStatus,
    upstream: extras.upstream,
    videoUpstream: extras.videoUpstream,
  };
}
