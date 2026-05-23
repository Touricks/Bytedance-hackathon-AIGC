import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./common/config.js";
import { db } from "./db/client.js";
import { registerCreationController } from "./modules/creation/creation.controller.js";
import { registerCreativeBlueprintController } from "./modules/creative-blueprint/creative-blueprint.controller.js";
import { registerMaterialController } from "./modules/material/material.controller.js";
import { registerScriptController } from "./modules/script/script.controller.js";

export async function buildServer() {
  await db.initialize();
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.addHook("onClose", async () => {
    await db.close();
  });

  app.get("/api/health", async () => ({
    ok: true,
    runtime: config.runtime
  }));

  app.get("/uploads/*", async (request, reply) => {
    const params = request.params as { "*": string };
    const uploadRoot = path.resolve(config.uploadDir);
    const filePath = path.resolve(uploadRoot, params["*"]);

    if (!filePath.startsWith(uploadRoot)) {
      return reply.status(400).send({ message: "Invalid upload path" });
    }

    await stat(filePath);
    return reply.send(createReadStream(filePath));
  });

  await registerMaterialController(app);
  await registerScriptController(app);
  await registerCreativeBlueprintController(app);
  await registerCreationController(app);

  return app;
}
