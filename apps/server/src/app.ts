import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./common/config.js";
import { db } from "./db/client.js";
import { registerCreationController } from "./modules/creation/creation.controller.js";
import { registerCreativeBlueprintController } from "./modules/creative-blueprint/creative-blueprint.controller.js";
import { registerMaterialController } from "./modules/material/material.controller.js";
import { registerPipelineController } from "./modules/pipeline/pipeline.controller.js";
import { registerScriptController } from "./modules/script/script.controller.js";
import { registerWorkspaceController } from "./modules/workspace/workspace.controller.js";
import { maxWorkspaceMaterialBytes } from "./modules/workspace/workspace.service.js";
import type { WorkspaceDirectorySelectResponse } from "./modules/workspace/workdir-picker.js";

interface BuildServerOptions {
  selectWorkspaceDirectory?: () => Promise<WorkspaceDirectorySelectResponse>;
}

function isLocalUrlPathPrefix(prefix: string) {
  return prefix.startsWith("/");
}

function isInsideDirectory(filePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, filePath);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export async function buildServer(options: BuildServerOptions = {}) {
  await db.initialize();
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: maxWorkspaceMaterialBytes + 1,
      files: 1,
    },
  });

  app.addHook("onClose", async () => {
    await db.close();
  });

  app.get("/api/health", async () => ({
    ok: true,
    runtime: config.runtime,
  }));

  if (isLocalUrlPathPrefix(config.uploadUrlPrefix)) {
    app.get(
      `${config.uploadUrlPrefix}/workspace-videos/:workspaceId/*`,
      async (request, reply) => {
        const params = request.params as { workspaceId: string; "*": string };
        const workspace = await db.getWorkspace(params.workspaceId);
        const videoRoot = path.resolve(
          workspace.localPath,
          ".daireel",
          "videos",
        );
        const filePath = path.resolve(videoRoot, params["*"]);

        if (!isInsideDirectory(filePath, videoRoot)) {
          return reply
            .status(400)
            .send({ message: "Invalid workspace video path" });
        }

        await stat(filePath);
        return reply.send(createReadStream(filePath));
      },
    );

    app.get(
      `${config.uploadUrlPrefix}/workspace-materials/:workspaceId/*`,
      async (request, reply) => {
        const params = request.params as { workspaceId: string; "*": string };
        const workspace = await db.getWorkspace(params.workspaceId);
        const workspaceRoot = path.resolve(
          workspace.localPath,
          ".daireel",
          "materials",
        );
        const filePath = path.resolve(workspaceRoot, params["*"]);

        if (!isInsideDirectory(filePath, workspaceRoot)) {
          return reply
            .status(400)
            .send({ message: "Invalid workspace material path" });
        }

        await stat(filePath);
        return reply.send(createReadStream(filePath));
      },
    );

    app.get(`${config.uploadUrlPrefix}/*`, async (request, reply) => {
      const params = request.params as { "*": string };
      const uploadRoot = path.resolve(config.uploadDir);
      const filePath = path.resolve(uploadRoot, params["*"]);

      if (!isInsideDirectory(filePath, uploadRoot)) {
        return reply.status(400).send({ message: "Invalid upload path" });
      }

      await stat(filePath);
      return reply.send(createReadStream(filePath));
    });
  }

  await registerMaterialController(app);
  await registerPipelineController(app);
  await registerScriptController(app);
  await registerWorkspaceController(app, {
    selectWorkspaceDirectory: options.selectWorkspaceDirectory,
  });
  await registerCreativeBlueprintController(app);
  await registerCreationController(app);

  return app;
}
