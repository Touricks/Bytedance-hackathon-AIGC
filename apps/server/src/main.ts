import { config, shouldStartApi, shouldStartWorker } from "./common/config.js";
import { logger } from "./common/logger.js";
import { buildServer } from "./app.js";
import { startGenerationWorker } from "./jobs/queue.js";

if (shouldStartWorker()) {
  startGenerationWorker();
}

if (shouldStartApi()) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`API listening on http://localhost:${config.port}`);
}
