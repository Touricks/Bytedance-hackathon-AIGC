import type { WorkflowStatus } from "../../lib/api/shots.js";

type WorkflowShot = WorkflowStatus["shots"][number];

const ACTIVE_IMAGE_BATCH_STATUSES = new Set(["PENDING", "RUNNING"]);

export function hasActiveImageBatch(
  shot: Pick<WorkflowShot, "activeImageBatchStatus">,
) {
  return Boolean(
    shot.activeImageBatchStatus &&
      ACTIVE_IMAGE_BATCH_STATUSES.has(shot.activeImageBatchStatus),
  );
}

export function hasImageBatch(shot: Pick<WorkflowShot, "activeImageBatchId">) {
  return Boolean(shot.activeImageBatchId);
}

export function isImageAutoSelectionTarget(shot: WorkflowShot) {
  return !shot.selectedImageId && !hasImageBatch(shot);
}

export function getImageAutoSelectionTargets<TShot extends WorkflowShot>(
  shots: TShot[],
) {
  return shots.filter(isImageAutoSelectionTarget);
}

export function imageAutoSelectionActionNote(shots: WorkflowShot[]) {
  if (shots.some(hasActiveImageBatch)) {
    return "分镜图生成中";
  }

  if (shots.length > 0 && shots.every((shot) => Boolean(shot.selectedImageId))) {
    return "分镜图已完成选择";
  }

  if (shots.some(hasImageBatch)) {
    return "已有分镜图候选";
  }

  const targets = getImageAutoSelectionTargets(shots);
  return targets.length > 0
    ? `待生成/选择 ${targets.length} 个分镜`
    : "分镜图已完成选择";
}
