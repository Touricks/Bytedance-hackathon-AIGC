import { config, shouldStartApi, shouldStartWorker } from "./common/config.js";
import { logger } from "./common/logger.js";
import { buildServer } from "./app.js";
import { db } from "./db/client.js";
import {
  registerGenerationV2Processor,
  startGenerationV2Worker,
  recoverInflightGenerationJobs,
} from "./modules/job/job.queue.js";
import { processGenerateImages } from "./modules/generation/image.worker.js";
import { processGenerateImageCandidate } from "./modules/generation/image.worker.js";
import {
  processGenerateVideos,
  processGenerateVideoCandidate,
} from "./modules/generation/video.worker.js";
import { processComposeFinalVideo } from "./modules/generation/final-compose.worker.js";
import { processOneClickFinalVideo } from "./modules/generation/one-click-final-video.worker.js";
import { assertFfmpegAvailable } from "./modules/generation/ffmpeg.js";

await assertFfmpegAvailable();

registerGenerationV2Processor(async (data, meta) => {
  if (data.kind === "generate_images") return processGenerateImages(data);
  if (data.kind === "generate_image_candidate") {
    return processGenerateImageCandidate(data, db.db2, meta);
  }
  if (data.kind === "generate_videos") return processGenerateVideos(data);
  if (data.kind === "generate_video_candidate") {
    return processGenerateVideoCandidate(data, db.db2, meta);
  }
  if (data.kind === "compose_final_video") return processComposeFinalVideo(data);
  if (data.kind === "advance_one_click_final_video") {
    return processOneClickFinalVideo(data);
  }
});
if (shouldStartWorker()) {
  startGenerationV2Worker();
}

if (shouldStartApi()) {
  const app = await buildServer();
  // Sweep any in-flight jobs left over from a previous boot.
  if (shouldStartWorker()) {
    try {
      await recoverInflightGenerationJobs();
    } catch (err) {
      logger.error("recoverInflightGenerationJobs failed", { err });
    }
  }
  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`API listening on http://localhost:${config.port}`);
}
