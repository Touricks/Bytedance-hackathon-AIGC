import type { AdvanceOneClickFinalVideoJobData } from "@aigc-video/shared";
import { oneClickFinalVideoService } from "./one-click-final-video.service.js";

export async function processOneClickFinalVideo(
  data: AdvanceOneClickFinalVideoJobData,
) {
  await oneClickFinalVideoService.advance({
    oneClickJobId: data.oneClickJobId,
    generationJobId: data.jobId,
    traceId: data.traceId,
  });
}
