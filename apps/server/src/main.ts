import Fastify from "fastify";
import cors from "@fastify/cors";
import { config, shouldStartApi, shouldStartWorker } from "./common/config.js";
import { logger } from "./common/logger.js";
import { startGenerationWorker } from "./jobs/queue.js";
import { registerCreationController } from "./modules/creation/creation.controller.js";
import { registerMaterialController } from "./modules/material/material.controller.js";
import { registerScriptController } from "./modules/script/script.controller.js";

async function buildServer() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/api/health", async () => ({
    ok: true,
    runtime: config.runtime
  }));

  await registerMaterialController(app);
  await registerScriptController(app);
  await registerCreationController(app);

  return app;
}

if (shouldStartWorker()) {
  startGenerationWorker();
}

if (shouldStartApi()) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`API listening on http://localhost:${config.port}`);
}
