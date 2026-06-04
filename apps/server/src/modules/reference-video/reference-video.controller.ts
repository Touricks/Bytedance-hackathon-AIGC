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

        const file = await request.file();
        if (file) {
          return {
            data: await referenceVideoService.importFile(params.workspaceId, {
              filename: file.filename,
              contentType: file.mimetype || "application/octet-stream",
              bytes: await file.toBuffer(),
            }),
          };
        }

        return reply.status(400).send({
          code: "REFERENCE_VIDEO_SOURCE_REQUIRED",
          message: "Reference video file is required.",
        });
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );
}
