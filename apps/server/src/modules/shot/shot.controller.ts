import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { shotWorkflowService } from "./shot.service.js";
import {
  patchShotAssetRefsRequest,
  proposeImagePromptRequest,
  proposeVideoScriptRequest,
  regenerateImageCandidatesRequest,
  regenerateImagePromptRequest,
  regenerateVideoCandidatesRequest,
  regenerateVideoScriptRequest,
  retryRequest,
  selectImageRequest,
  selectVideoRequest,
} from "./shot.schema.js";

export async function registerShotController(app: FastifyInstance) {
  app.get("/api/workspaces/:workspaceId/shots", async (req, reply) => {
    try {
      const params = req.params as { workspaceId: string };
      return await shotWorkflowService.listShots(params.workspaceId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      return await shotWorkflowService.getShot(params.shotId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/shots/:shotId/asset-refs", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      return await shotWorkflowService.listShotAssetRefs(params.shotId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.patch("/api/shots/:shotId/asset-refs", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      const body = patchShotAssetRefsRequest.parse(req.body);
      return await shotWorkflowService.replaceShotAssetRefs({
        shotId: params.shotId,
        refs: body.refs,
      });
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get("/api/workspaces/:workspaceId/shot-workflow-status", async (req, reply) => {
    try {
      const params = req.params as { workspaceId: string };
      return await shotWorkflowService.workflowStatus(params.workspaceId);
    } catch (e) {
      const err = toHttpError(e);
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
          userDirection: body.userDirection,
          candidateCount: body.candidateCount,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/shots/:shotId/image-prompts/regenerate",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        const body = regenerateImagePromptRequest.parse(req.body);
        return await shotWorkflowService.regenerateImagePrompt({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
          baseArtifactId: body.baseArtifactId,
          feedbackImageCandidateId: body.feedbackImageCandidateId,
          userDirection: body.userDirection,
          candidateCount: body.candidateCount,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/shots/:shotId/image-candidates/regenerate",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        const body = regenerateImageCandidatesRequest.parse(req.body ?? {});
        return await shotWorkflowService.regenerateImageCandidates({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
          userDirection: body.userDirection,
          candidateCount: body.candidateCount,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.get("/api/shots/:shotId/image-prompts", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      return await shotWorkflowService.listImagePrompts(params.shotId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/shots/:shotId/image-rounds",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        return await shotWorkflowService.listImageRounds({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/shots/:shotId/image-candidates/select",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        const body = selectImageRequest.parse(req.body);
        return await shotWorkflowService.selectImage({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
          imageCandidateId: body.imageCandidateId,
          imageGenerationBatchId: body.imageGenerationBatchId,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

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
          userDirection: body.userDirection,
          candidateCount: body.candidateCount,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/shots/:shotId/video-scripts/regenerate",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        const body = regenerateVideoScriptRequest.parse(req.body);
        return await shotWorkflowService.regenerateVideoScript({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
          baseArtifactId: body.baseArtifactId,
          feedbackVideoCandidateId: body.feedbackVideoCandidateId,
          userDirection: body.userDirection,
          candidateCount: body.candidateCount,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/shots/:shotId/video-candidates/regenerate",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        const body = regenerateVideoCandidatesRequest.parse(req.body ?? {});
        return await shotWorkflowService.regenerateVideoCandidates({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
          userDirection: body.userDirection,
          candidateCount: body.candidateCount,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.get("/api/shots/:shotId/video-scripts", async (req, reply) => {
    try {
      const params = req.params as { shotId: string };
      return await shotWorkflowService.listVideoScripts(params.shotId);
    } catch (e) {
      const err = toHttpError(e);
      return reply.status(err.statusCode).send(err);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/shots/:shotId/video-rounds",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        return await shotWorkflowService.listVideoRounds({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/shots/:shotId/video-candidates/select",
    async (req, reply) => {
      try {
        const params = req.params as { workspaceId: string; shotId: string };
        const body = selectVideoRequest.parse(req.body);
        return await shotWorkflowService.selectVideo({
          workspaceId: params.workspaceId,
          shotId: params.shotId,
          videoCandidateId: body.videoCandidateId,
          videoGenerationBatchId: body.videoGenerationBatchId,
        });
      } catch (e) {
        const err = toHttpError(e);
        return reply.status(err.statusCode).send(err);
      }
    },
  );

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
