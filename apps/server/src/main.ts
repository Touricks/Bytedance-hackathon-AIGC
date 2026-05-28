import { config, shouldStartApi } from "./common/config.js";
import { logger } from "./common/logger.js";
import { buildServer } from "./app.js";
import {
  registerGenerationV2Processor,
  startGenerationV2Worker,
} from "./modules/job/job.queue.js";
import { processGenerateImages } from "./modules/generation/image.worker.js";

registerGenerationV2Processor(async (data) => {
  if (data.kind === "generate_images") return processGenerateImages(data);
  // generate_videos and compose_final_video added in Waves 4 and 5
});
startGenerationV2Worker();

if (shouldStartApi()) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`API listening on http://localhost:${config.port}`);
}
