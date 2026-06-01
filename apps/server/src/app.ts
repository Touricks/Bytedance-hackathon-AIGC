import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./common/config.js";
import { db } from "./db/client.js";
import { registerMaterialController } from "./modules/material/material.controller.js";
import { registerPipelineController } from "./modules/pipeline/pipeline.controller.js";
import { registerScriptController } from "./modules/script/script.controller.js";
import { registerWorkspaceController } from "./modules/workspace/workspace.controller.js";
import {
  maxWorkspaceMaterialBytes,
  resolveWorkspaceStorageLocalPath
} from "./modules/workspace/workspace.service.js";
import { registerShotController } from "./modules/shot/shot.controller.js";
import { registerGenerationController } from "./modules/generation/generation.controller.js";
import { registerCampaignController } from "./modules/campaign/campaign.controller.js";
import { registerTraceController } from "./modules/trace/trace.routes.js";
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

async function sendWorkspaceFile(
  workspaceId: string,
  relativePath: string,
  directoryName: "materials" | "videos",
  invalidPathMessage: string,
  reply: FastifyReply
) {
  const workspaceLocalPath = await resolveWorkspaceStorageLocalPath(workspaceId);
  const root = path.resolve(workspaceLocalPath, ".daireel", directoryName);
  const filePath = path.resolve(root, relativePath);

  if (!isInsideDirectory(filePath, root)) {
    return reply.status(400).send({ message: invalidPathMessage });
  }

  await stat(filePath);
  return reply.send(createReadStream(filePath));
}

export async function buildServer(options: BuildServerOptions = {}) {
  await db.initialize();
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: maxWorkspaceMaterialBytes + 1,
      files: 1
    }
  });

  app.addHook("onClose", async () => {
    await db.close();
  });

  app.get("/api/health", async () => ({
    ok: true,
    runtime: config.runtime
  }));

  app.get("/api/config/limits", async () => ({
    data: {
      defaultImageCandidates: config.defaultImageCandidates,
      maxImageCandidatesPerShot: config.maxImageCandidatesPerShot,
      defaultVideoCandidates: config.defaultVideoCandidates,
      maxVideoCandidatesPerShot: config.maxVideoCandidatesPerShot,
      generationWorkerConcurrency: config.generationWorkerConcurrency,
      providerConcurrency: {
        text: config.textProviderConcurrency,
        image: config.imageProviderConcurrency,
        video: config.videoProviderConcurrency
      },
      aspectRatios: ["9:16", "16:9", "1:1"]
    }
  }));

  app.get("/api/workspaces/:workspaceId/videos/*", async (request, reply) => {
    const params = request.params as { workspaceId: string; "*": string };
    return sendWorkspaceFile(
      params.workspaceId,
      params["*"],
      "videos",
      "Invalid workspace video path",
      reply
    );
  });

  app.get("/api/workspaces/:workspaceId/materials/*", async (request, reply) => {
    const params = request.params as { workspaceId: string; "*": string };
    return sendWorkspaceFile(
      params.workspaceId,
      params["*"],
      "materials",
      "Invalid workspace material path",
      reply
    );
  });

  const legacyUploadDir = config.uploadDir;
  const legacyUploadUrlPrefix = config.uploadUrlPrefix;
  if (
    legacyUploadUrlPrefix &&
    legacyUploadDir &&
    isLocalUrlPathPrefix(legacyUploadUrlPrefix)
  ) {
    app.get(
      `${legacyUploadUrlPrefix}/workspace-videos/:workspaceId/*`,
      async (request, reply) => {
        const params = request.params as { workspaceId: string; "*": string };
        return sendWorkspaceFile(
          params.workspaceId,
          params["*"],
          "videos",
          "Invalid workspace video path",
          reply
        );
      }
    );

    app.get(
      `${legacyUploadUrlPrefix}/workspace-materials/:workspaceId/*`,
      async (request, reply) => {
        const params = request.params as { workspaceId: string; "*": string };
        return sendWorkspaceFile(
          params.workspaceId,
          params["*"],
          "materials",
          "Invalid workspace material path",
          reply
        );
      }
    );

    app.get(`${legacyUploadUrlPrefix}/*`, async (request, reply) => {
      const params = request.params as { "*": string };
      const uploadRoot = path.resolve(legacyUploadDir);
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
    selectWorkspaceDirectory: options.selectWorkspaceDirectory
  });
  await registerShotController(app);
  await registerGenerationController(app);
  await registerCampaignController(app);
  await registerTraceController(app);

  app.delete("/api/test-runs/:runId", async (req, reply) => {
    if (process.env.ALLOW_TEST_CLEANUP !== "true") {
      return reply.status(403).send({ code: "DISABLED_IN_THIS_ENV" });
    }
    const params = req.params as { runId: string };
    const pool = db.db2.pool();
    // Wipe creative_workspace rows by id-prefix; cascade handles downstream.
    await pool.query("delete from creative_workspace where id like $1", [
      `%${params.runId}%`
    ]);
    return { data: { ok: true } };
  });

  return app;
}
