import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./common/config.js";
import { toHttpError } from "./common/errors.js";
import { db } from "./db/client.js";
import { registerMaterialController } from "./modules/material/material.controller.js";
import { registerPipelineController } from "./modules/pipeline/pipeline.controller.js";
import { registerScriptController } from "./modules/script/script.controller.js";
import { registerWorkspaceController } from "./modules/workspace/workspace.controller.js";
import {
  maxWorkspaceMaterialBytes,
} from "./modules/workspace/workspace.service.js";
import { getWorkspaceStorageAdapter } from "./modules/workspace/storage/workspace-storage-resolver.js";
import { registerShotController } from "./modules/shot/shot.controller.js";
import { registerGenerationController } from "./modules/generation/generation.controller.js";
import { registerCampaignController } from "./modules/campaign/campaign.controller.js";
import {
  registerDashboardVideoArtifactController,
} from "./modules/dashboard/dashboard-video-artifact.controller.js";
import { registerRecommendationController } from "./modules/recommendation/recommendation.controller.js";
import { registerTraceController } from "./modules/trace/trace.routes.js";
import { registerReferenceVideoController } from "./modules/reference-video/reference-video.controller.js";
import { registerSetupTemplateController } from "./modules/setup-template/setup-template.controller.js";
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
  await db.getWorkspace(workspaceId);
  const adapter = await getWorkspaceStorageAdapter(workspaceId);
  const objectPath = `${directoryName}/${relativePath}`;

  if (relativePath.startsWith("/") || relativePath.split(/[\\/]/).includes("..")) {
    return reply.status(400).send({ message: invalidPathMessage });
  }

  return reply.send(await adapter.streamObject(objectPath));
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
      workspaceStorageKind: config.workspaceStorageKind,
      aspectRatios: ["9:16", "16:9", "1:1"]
    }
  }));

  app.get("/api/workspaces/:workspaceId/videos/*", async (request, reply) => {
    const params = request.params as { workspaceId: string; "*": string };
    try {
      return await sendWorkspaceFile(
        params.workspaceId,
        params["*"],
        "videos",
        "Invalid workspace video path",
        reply
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return reply.status(404).send({ message: "Workspace video not found" });
      }
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get("/api/workspaces/:workspaceId/materials/*", async (request, reply) => {
    const params = request.params as { workspaceId: string; "*": string };
    try {
      return await sendWorkspaceFile(
        params.workspaceId,
        params["*"],
        "materials",
        "Invalid workspace material path",
        reply
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return reply.status(404).send({ message: "Workspace material not found" });
      }
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
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
  await registerDashboardVideoArtifactController(app);
  await registerRecommendationController(app);
  await registerTraceController(app);
  await registerReferenceVideoController(app);
  await registerSetupTemplateController(app);

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
