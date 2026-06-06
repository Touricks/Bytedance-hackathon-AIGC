import { shotImageAutoSelectionService } from "./shot-image-auto-selection.service.js";

export async function processShotImageAutoSelection(data: {
  shotImageAutoSelectionJobId: string;
  jobId: string;
  traceId: string;
}) {
  await shotImageAutoSelectionService.advance({
    shotImageAutoSelectionJobId: data.shotImageAutoSelectionJobId,
    generationJobId: data.jobId,
    traceId: data.traceId,
  });
}
