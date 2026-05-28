import { config, shouldStartApi } from "./common/config.js";
import { logger } from "./common/logger.js";
import { buildServer } from "./app.js";
import {
  registerGenerationV2Processor,
  startGenerationV2Worker,
} from "./modules/job/job.queue.js";
import { processGenerateImages } from "./modules/generation/image.worker.js";
import { processGenerateVideos } from "./modules/generation/video.worker.js";
import { processComposeFinalVideo } from "./modules/generation/final-compose.worker.js";
import { assertFfmpegAvailable } from "./modules/generation/ffmpeg.js";

await assertFfmpegAvailable();

registerGenerationV2Processor(async (data) => {
  if (data.kind === "generate_images") return processGenerateImages(data);
  if (data.kind === "generate_videos") return processGenerateVideos(data);
  if (data.kind === "compose_final_video") return processComposeFinalVideo(data);
});
startGenerationV2Worker();

if (shouldStartApi()) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`API listening on http://localhost:${config.port}`);
}
