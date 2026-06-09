import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { toHttpError } from "../../common/errors.js";
import { referenceVideoService } from "./reference-video.service.js";

const WORKSPACE_ID_SEGMENT = ":workspaceId([A-Za-z0-9_-]+)";
const referenceVideoImportRequestSchema = z.object({
  source: z.object({
    type: z.literal("url"),
    url: z.string().min(1),
  }),
});

export async function registerReferenceVideoController(app: FastifyInstance) {
  app.post(
    `/api/workspaces/${WORKSPACE_ID_SEGMENT}/reference-video/import`,
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        if (!request.isMultipart()) {
          const body = referenceVideoImportRequestSchema.parse(request.body);
          return {
            data: await referenceVideoService.importUrl(params.workspaceId, {
              url: body.source.url,
            }),
          };
        }

        const uploaded: Array<{
          filename: string;
          contentType: string;
          bytes: Buffer;
        }> = [];
        for await (const part of request.files()) {
          uploaded.push({
            filename: part.filename,
            contentType: part.mimetype || "application/octet-stream",
            bytes: await part.toBuffer(),
          });
        }

        if (uploaded.length === 0) {
          return reply.status(400).send({
            code: "REFERENCE_VIDEO_SOURCE_REQUIRED",
            message: "A reference video, image, or text file is required.",
          });
        }

        const first = uploaded[0]!;
        const looksLikeVideo =
          first.contentType.toLowerCase().startsWith("video/") ||
          /\.(mp4|mov|m4v|webm)$/i.test(first.filename);
        if (uploaded.length === 1 && looksLikeVideo) {
          return {
            data: await referenceVideoService.importFile(params.workspaceId, first),
          };
        }

        return {
          data: await referenceVideoService.importReferenceFiles(
            params.workspaceId,
            uploaded,
          ),
        };
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );
}
