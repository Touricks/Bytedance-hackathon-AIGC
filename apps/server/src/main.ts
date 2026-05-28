import { config, shouldStartApi } from "./common/config.js";
import { logger } from "./common/logger.js";
import { buildServer } from "./app.js";

if (shouldStartApi()) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`API listening on http://localhost:${config.port}`);
}
