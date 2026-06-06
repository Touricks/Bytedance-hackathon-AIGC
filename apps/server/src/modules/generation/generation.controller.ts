import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { materialIntakeArtifactSchema } from "@aigc-video/shared";
import { toHttpError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { getWorkspaceStorageAdapter } from "../workspace/storage/workspace-storage-resolver.js";
import { generationService } from "./generation.service.js";
import { oneClickFinalVideoService } from "./one-click-final-video.service.js";
import { shotImageAutoSelectionService } from "./shot-image-auto-selection.service.js";

const aspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);
const createOneClickFinalVideoRequestSchema = z.object({
  materialIntake: z.object({
    data: materialIntakeArtifactSchema,
  }),
  outputAspectRatio: aspectRatioSchema.optional(),
  autoSelectionStrategy: z.literal("first_success").optional(),
});
const createShotImageAutoSelectionRequestSchema = z.object({
  candidateCount: z.number().int().positive().optional(),
});

function finalVideoDownloadFilename(finalVideoJobId: string) {
  return `final-video-${finalVideoJobId.replace(/[^a-zA-Z0-9_.-]/g, "-")}.mp4`;
}

export async function registerGenerationController(app: FastifyInstance) {
  app.post(
    "/api/workspaces/:workspaceId/shot-image-auto-selections",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string };
        const header = req.headers["idempotency-key"];
        const key = Array.isArray(header) ? header[0] : header;
        if (!key) {
          return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
        }
        const body = createShotImageAutoSelectionRequestSchema.parse(req.body ?? {});
        return await shotImageAutoSelectionService.create({
          workspaceId: params.workspaceId,
          candidateCount: body.candidateCount,
          idempotencyKey: key,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.get("/api/shot-image-auto-selections/:jobId", async (req, reply) => {
    try {
      const params = req.params as { jobId: string };
      return await shotImageAutoSelectionService.get(params.jobId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/shot-image-auto-selections",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string };
        return await shotImageAutoSelectionService.list(params.workspaceId);
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/one-click-final-videos",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string };
        const header = req.headers["idempotency-key"];
        const key = Array.isArray(header) ? header[0] : header;
        if (!key) {
          return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
        }
        const body = createOneClickFinalVideoRequestSchema.parse(req.body ?? {});
        return await oneClickFinalVideoService.create({
          workspaceId: params.workspaceId,
          materialIntake: body.materialIntake,
          outputAspectRatio: body.outputAspectRatio ?? "9:16",
          idempotencyKey: key,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.get("/api/one-click-final-videos/:jobId", async (req, reply) => {
    try {
      const params = req.params as { jobId: string };
      return await oneClickFinalVideoService.get(params.jobId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/one-click-final-videos",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string };
        return await oneClickFinalVideoService.list(params.workspaceId);
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.post("/api/workspaces/:workspaceId/final-videos", async (req, reply) => {
    try {
      const params = req.params as { workspaceId: string };
      const key = req.headers["idempotency-key"] as string | undefined;
      if (!key) {
        return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
      }
      const body = (req.body ?? {}) as { outputAspectRatio?: "9:16" | "16:9" | "1:1" };
      return await generationService.createFinalCompose({
        workspaceId: params.workspaceId,
        outputAspectRatio: body.outputAspectRatio ?? "9:16",
        idempotencyKey: key,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/final-videos/:finalVideoJobId", async (req, reply) => {
    try {
      const params = req.params as { finalVideoJobId: string };
      const row = await db.db2.getFinalVideoJob(params.finalVideoJobId);
      return { data: row };
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/workspaces/:workspaceId/final-videos", async (req, reply) => {
    try {
      const params = req.params as { workspaceId: string };
      const result = await db.db2
        .pool()
        .query(
          `select id,
                  workspace_id as "workspaceId",
                  status,
                  local_url as "localUrl",
                  duration_sec as "durationSec",
                  compiled_manifest_hash as "compiledManifestHash",
                  error_message as "errorMessage",
                  created_at as "createdAt",
                  updated_at as "updatedAt",
                  completed_at as "completedAt"
             from final_video_jobs
            where workspace_id=$1
            order by created_at desc
            limit 50`,
          [params.workspaceId],
        );
      return { data: result.rows };
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file",
    async (req, reply) => {
      try {
        const params = req.params as {
          workspaceId: string;
          finalVideoJobId: string;
        };
        const query = req.query as { download?: string };
        const row = await db.db2.getFinalVideoJob(params.finalVideoJobId);
        if (row.workspaceId !== params.workspaceId) {
          return reply.status(404).send({ code: "NOT_FOUND" });
        }
        if (!row.localPath) return reply.status(404).send({ code: "NOT_READY" });
        const storage = await getWorkspaceStorageAdapter(params.workspaceId);
        reply.header("Content-Type", "video/mp4");
        if (query.download === "1" || query.download === "true") {
          reply.header(
            "Content-Disposition",
            `attachment; filename="${finalVideoDownloadFilename(row.id)}"`,
          );
        }
        return reply.send(await storage.streamObject(row.localPath));
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );
}
