import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { generationService } from "../generation/generation.service.js";
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

  // ----- Image prompt -----
  app.post(
    "/api/workspaces/:workspaceId/shots/:shotId/image-prompts/propose",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        const body = proposeImagePromptRequest.parse(req.body);
        return await shotWorkflowService.proposeImagePrompt({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
          referenceAssetIds: body.referenceAssetIds,
          userHint: body.userHint,
          stylePresetId: body.stylePresetId,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.patch("/api/shots/:shotId/image-prompts/:artifactId", async (req, reply) => {
    try {
      const params = req.params as { shotId: string; artifactId: string };
      const body = patchImagePromptRequest.parse(req.body);
      return await shotWorkflowService.patchImagePrompt({
        shotId: params.shotId,
        artifactId: params.artifactId,
        promptText: body.promptText,
        negativePrompt: body.negativePrompt,
        referenceAssetIds: body.referenceAssetIds,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId/image-prompts", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      return await shotWorkflowService.listImagePrompts(params.shotId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  // ----- Image batches -----
  app.post("/api/shots/:shotId/image-batches", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      const body = createImageBatchRequest.parse(req.body);
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (!idempotencyKey) {
        return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
      }
      const shot = await db.db2.getShot(params.shotId);
      return await generationService.createImageBatch({
        workspaceId: shot.workspaceId,
        shotId: params.shotId,
        imagePromptArtifactId: body.imagePromptArtifactId,
        count: body.count,
        aspectRatio: body.aspectRatio,
        idempotencyKey,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId/image-batches", async (_req, reply) => notImplemented(reply));

  app.get("/api/shots/:shotId/image-batches/:batchId", async (req, reply) => {
    try {
      const params = req.params as { shotId: string; batchId: string };
      const batch = await db.db2.getImageBatch(params.batchId);
      const candidates = await db.db2.listImageCandidatesByBatch(params.batchId);
      return { data: { ...batch, candidates } };
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  // ----- Selected image -----
  app.post("/api/shots/:shotId/selected-image", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      const body = selectImageRequest.parse(req.body);
      return await shotWorkflowService.selectImage({
        shotId: params.shotId,
        imageCandidateId: body.imageCandidateId,
        imageGenerationBatchId: body.imageGenerationBatchId,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId/selected-image", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      const sel = await db.db2.getSelectedImage(params.shotId);
      if (!sel) return reply.status(404).send({ code: "NO_SELECTED_IMAGE" });
      const candidate = await db.db2.getImageCandidate(sel.imageCandidateId);
      return { data: { selection: sel, candidate } };
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  // ----- Video script -----
  app.post(
    "/api/workspaces/:workspaceId/shots/:shotId/video-scripts/propose",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        const body = proposeVideoScriptRequest.parse(req.body);
        return await shotWorkflowService.proposeVideoScript({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
          durationSec: body.durationSec,
          useNeighborFrames: body.useNeighborFrames,
          userHint: body.userHint,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.patch("/api/shots/:shotId/video-scripts/:scriptId", async (req, reply) => {
    try {
      const params = req.params as { shotId: string; scriptId: string };
      const body = patchVideoScriptRequest.parse(req.body);
      return await shotWorkflowService.patchVideoScript({
        shotId: params.shotId,
        scriptId: params.scriptId,
        baseVersion: body.baseVersion,
        durationSec: body.durationSec,
        scriptJson: body.scriptJson,
        providerPrompt: body.providerPrompt,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId/video-scripts", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      return await shotWorkflowService.listVideoScripts(params.shotId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  // ----- Video batches -----
  app.post("/api/shots/:shotId/video-batches", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      const body = createVideoBatchRequest.parse(req.body);
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (!idempotencyKey) {
        return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
      }
      const shot = await db.db2.getShot(params.shotId);
      return await generationService.createVideoBatch({
        workspaceId: shot.workspaceId,
        shotId: params.shotId,
        videoScriptArtifactId: body.videoScriptArtifactId,
        count: body.count,
        aspectRatio: body.aspectRatio,
        idempotencyKey,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId/video-batches", async (_req, reply) => notImplemented(reply));

  app.get("/api/shots/:shotId/video-batches/:batchId", async (req, reply) => {
    try {
      const params = req.params as { shotId: string; batchId: string };
      const batch = await db.db2.getVideoBatch(params.batchId);
      const candidates = await db.db2.listVideoCandidatesByBatch(params.batchId);
      return { data: { ...batch, candidates } };
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  // ----- Selected video -----
  app.post("/api/shots/:shotId/selected-video", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      const body = selectVideoRequest.parse(req.body);
      return await shotWorkflowService.selectVideo({
        shotId: params.shotId,
        videoCandidateId: body.videoCandidateId,
        videoGenerationBatchId: body.videoGenerationBatchId,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId/selected-video", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      const sel = await db.db2.pool().query(
        `select video_candidate_id, video_generation_batch_id from selected_shot_videos where shot_id=$1`,
        [params.shotId],
      );
      if (sel.rows.length === 0) {
        return reply.status(404).send({ code: "NO_SELECTED_VIDEO" });
      }
      const candidate = await db.db2.getVideoCandidate(sel.rows[0].video_candidate_id);
      return {
        data: {
          selection: {
            videoCandidateId: sel.rows[0].video_candidate_id,
            videoGenerationBatchId: sel.rows[0].video_generation_batch_id,
          },
          candidate,
        },
      };
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  // ----- Retry -----
  app.post("/api/shots/:shotId/retry", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      const body = retryRequest.parse(req.body);
      const key = req.headers["idempotency-key"] as string | undefined;
      if (!key) {
        return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED" });
      }
      return await shotWorkflowService.retry({
        shotId: params.shotId,
        what: body.what,
        idempotencyKey: key,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });
}
