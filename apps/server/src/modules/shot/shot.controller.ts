import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { shotWorkflowService } from "./shot.service.js";
import {
  createImageBatchRequest,
  createVideoBatchRequest,
  patchImagePromptRequest,
  patchVideoScriptRequest,
  proposeImagePromptRequest,
  proposeVideoScriptRequest,
  retryRequest,
  selectImageRequest,
  selectVideoRequest,
} from "./shot.schema.js";

function notImplemented(reply: any) {
  return reply.status(501).send({ code: "NOT_IMPLEMENTED" });
}

export async function registerShotController(app: FastifyInstance) {
  app.get("/api/workspaces/:workspaceId/shots", async (req, reply) => {
    try {
      return await shotWorkflowService.listShots((req.params as any).workspaceId);
    } catch (e) {
      const err = toHttpError(e);
      if (err.message === "NOT_IMPLEMENTED") return notImplemented(reply);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId", async (req, reply) => {
    try {
      return await shotWorkflowService.getShot((req.params as any).shotId);
    } catch (e) {
      const err = toHttpError(e);
      if (err.message === "NOT_IMPLEMENTED") return notImplemented(reply);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/workspaces/:workspaceId/shot-workflow-status", async (req, reply) => {
    try {
      return await shotWorkflowService.workflowStatus((req.params as any).workspaceId);
    } catch (e) {
      const err = toHttpError(e);
      if (err.message === "NOT_IMPLEMENTED") return notImplemented(reply);
      return reply.status(err.statusCode).send(err);
    }
  });

  // The remaining routes are declared with 501 so the surface is reserved.
  for (const route of [
    { m: "POST",  p: "/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose", schema: proposeImagePromptRequest },
    { m: "PATCH", p: "/api/shots/:shotId/image-prompts/:artifactId",                       schema: patchImagePromptRequest },
    { m: "GET",   p: "/api/shots/:shotId/image-prompts" },
    { m: "POST",  p: "/api/shots/:shotId/image-batches",                                   schema: createImageBatchRequest },
    { m: "GET",   p: "/api/shots/:shotId/image-batches" },
    { m: "GET",   p: "/api/shots/:shotId/image-batches/:batchId" },
    { m: "POST",  p: "/api/shots/:shotId/selected-image",                                  schema: selectImageRequest },
    { m: "GET",   p: "/api/shots/:shotId/selected-image" },
    { m: "POST",  p: "/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose",   schema: proposeVideoScriptRequest },
    { m: "PATCH", p: "/api/shots/:shotId/video-scripts/:scriptId",                          schema: patchVideoScriptRequest },
    { m: "GET",   p: "/api/shots/:shotId/video-scripts" },
    { m: "POST",  p: "/api/shots/:shotId/video-batches",                                   schema: createVideoBatchRequest },
    { m: "GET",   p: "/api/shots/:shotId/video-batches" },
    { m: "GET",   p: "/api/shots/:shotId/video-batches/:batchId" },
    { m: "POST",  p: "/api/shots/:shotId/selected-video",                                  schema: selectVideoRequest },
    { m: "GET",   p: "/api/shots/:shotId/selected-video" },
    { m: "POST",  p: "/api/shots/:shotId/retry",                                            schema: retryRequest },
  ] as const) {
    (app as any)[route.m.toLowerCase()](route.p, async (_req: any, reply: any) => notImplemented(reply));
  }
}
