import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./common/config.js";
import { registerCreationController } from "./modules/creation/creation.controller.js";
import { registerCreativeBlueprintController } from "./modules/creative-blueprint/creative-blueprint.controller.js";
import { registerMaterialController } from "./modules/material/material.controller.js";
import { registerScriptController } from "./modules/script/script.controller.js";

export async function buildServer() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/api/health", async () => ({
    ok: true,
    runtime: config.runtime
  }));

  await registerMaterialController(app);
  await registerScriptController(app);
  await registerCreativeBlueprintController(app);
  await registerCreationController(app);

  return app;
}
