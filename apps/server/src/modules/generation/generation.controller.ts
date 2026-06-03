import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { generationService } from "./generation.service.js";

function finalVideoDownloadFilename(finalVideoJobId: string) {
  return `final-video-${finalVideoJobId.replace(/[^a-zA-Z0-9_.-]/g, "-")}.mp4`;
}

export async function registerGenerationController(app: FastifyInstance) {
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
        reply.header("Content-Type", "video/mp4");
        if (query.download === "1" || query.download === "true") {
          reply.header(
            "Content-Disposition",
            `attachment; filename="${finalVideoDownloadFilename(row.id)}"`,
          );
        }
        return reply.send(createReadStream(row.localPath));
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );
}
