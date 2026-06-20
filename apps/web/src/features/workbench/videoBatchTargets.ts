import type { WorkflowStatus } from "../../lib/api/shots.js";

type WorkflowShot = WorkflowStatus["shots"][number];

const ACTIVE_VIDEO_BATCH_STATUSES = new Set(["PENDING", "RUNNING"]);

export function hasActiveVideoBatch(shot: Pick<WorkflowShot, "activeVideoBatchStatus">) {
  return Boolean(
    shot.activeVideoBatchStatus &&
      ACTIVE_VIDEO_BATCH_STATUSES.has(shot.activeVideoBatchStatus),
  );
}

export function hasStaleVideoUpstream(shot: Pick<WorkflowShot, "videoUpstream">) {
  return Boolean(shot.videoUpstream?.upstreamChanged);
}

export function isVideoBatchGenerationTarget(shot: WorkflowShot) {
  if (!shot.selectedImageId || hasActiveVideoBatch(shot)) {
    return false;
  }

  const needsFirstVideo = !shot.selectedVideoId && !shot.activeVideoBatchId;
  return needsFirstVideo || hasStaleVideoUpstream(shot);
}

export function getVideoBatchGenerationTargets<TShot extends WorkflowShot>(
  shots: TShot[],
) {
  return shots.filter(isVideoBatchGenerationTarget);
}

function candidateTotalLabel(targetCount: number, candidateCount: number) {
  const safeCandidateCount = Math.max(1, Math.floor(candidateCount));
  return `${targetCount * safeCandidateCount} 条候选视频（覆盖 ${targetCount} 个分镜）`;
}

export function videoBatchActionNote(shots: WorkflowShot[], candidateCount = 1) {
  const targets = getVideoBatchGenerationTargets(shots);
  if (targets.length > 0) {
    const totalLabel = candidateTotalLabel(targets.length, candidateCount);
    return targets.some(hasStaleVideoUpstream)
      ? `待生成/更新 ${totalLabel}`
      : `待生成 ${totalLabel}`;
  }

  return shots.some((shot) => shot.selectedImageId && hasActiveVideoBatch(shot))
    ? "分镜视频生成中"
    : shots.some(
        (shot) =>
          shot.selectedImageId &&
          shot.activeVideoBatchId &&
          !hasActiveVideoBatch(shot) &&
          !shot.selectedVideoId,
      )
      ? "已有视频候选待选择，可重新生成当前分镜"
    : "已有视频候选或已完成选择";
}
