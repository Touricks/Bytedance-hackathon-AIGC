import { nanoid } from "nanoid";
import { GENERATION_V2_QUEUE_NAME } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { HttpError } from "../../common/errors.js";
import { jobRepository } from "../job/job.repository.js";
import { enqueueGenerationV2 } from "../job/job.queue.js";
import { shotWorkflowService } from "../shot/shot.service.js";

export const generationService = {
  async createImageBatch(input: {
    workspaceId: string;
    shotId: string;
    imagePromptArtifactId: string;
    count?: number;
    aspectRatio: "9:16" | "16:9" | "1:1";
    idempotencyKey: string;
  }) {
    const existing = await db.db2.getImageBatchByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { data: existing, deduped: true };
    }
    const count = shotWorkflowService.resolveBatchCount("image", input.count);
    const batch = await db.db2.insertImageBatch({
      id: "imb_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      imagePromptArtifactId: input.imagePromptArtifactId,
      status: "PENDING",
      requestedCount: count,
      succeededCount: 0,
      failedCount: 0,
      provider: "ark-seedream",
      aspectRatio: input.aspectRatio,
      providerRequest: {},
      errorMessage: null,
      idempotencyKey: input.idempotencyKey,
    });
    const job = await jobRepository.insert({
      id: "job_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      jobType: "generate_images",
      status: "PENDING",
      queueName: GENERATION_V2_QUEUE_NAME,
      queueJobId: null,
      relatedBatchType: "image_generation_batch",
      relatedBatchId: batch.id,
      payload: {},
      progress: 0,
      attemptCount: 0,
      maxAttempts: 3,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });
    await db.db2.updateShot(input.shotId, { status: "IMAGE_GENERATING" });
    await enqueueGenerationV2({
      kind: "generate_images",
      jobId: job.id,
      batchId: batch.id,
      shotId: input.shotId,
      workspaceId: input.workspaceId,
      imagePromptArtifactId: input.imagePromptArtifactId,
      count,
      aspectRatio: input.aspectRatio,
      traceId: nanoid(),
    });
    return {
      data: {
        batchId: batch.id,
        jobId: job.id,
        status: batch.status,
        requestedCount: count,
      },
    };
  },

  async createVideoBatch(input: {
    workspaceId: string;
    shotId: string;
    videoScriptArtifactId: string;
    count?: number;
    aspectRatio: "9:16" | "16:9" | "1:1";
    idempotencyKey: string;
  }) {
    const existing = await db.db2.getVideoBatchByIdempotencyKey(input.idempotencyKey);
    if (existing) return { data: existing, deduped: true };
    const script = await db.db2.getVideoScriptArtifact(input.videoScriptArtifactId);
    if (script.status !== "ACTIVE") {
      throw new HttpError(409, "STALE_SCRIPT", "Cannot generate video on stale script");
    }
    const count = shotWorkflowService.resolveBatchCount("video", input.count);
    const batch = await db.db2.insertVideoBatch({
      id: "vbb_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      videoScriptArtifactId: input.videoScriptArtifactId,
      status: "PENDING",
      requestedCount: count,
      succeededCount: 0,
      failedCount: 0,
      provider: "seedance",
      aspectRatio: input.aspectRatio,
      providerRequest: {},
      errorMessage: null,
      idempotencyKey: input.idempotencyKey,
    });
    const job = await jobRepository.insert({
      id: "job_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      jobType: "generate_videos",
      status: "PENDING",
      queueName: GENERATION_V2_QUEUE_NAME,
      queueJobId: null,
      relatedBatchType: "video_generation_batch",
      relatedBatchId: batch.id,
      payload: {},
      progress: 0,
      attemptCount: 0,
      maxAttempts: 3,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });
    await db.db2.updateShot(input.shotId, { status: "VIDEO_GENERATING" });
    await enqueueGenerationV2({
      kind: "generate_videos",
      jobId: job.id,
      batchId: batch.id,
      shotId: input.shotId,
      workspaceId: input.workspaceId,
      videoScriptArtifactId: input.videoScriptArtifactId,
      count,
      aspectRatio: input.aspectRatio,
      traceId: nanoid(),
    });
    return {
      data: {
        batchId: batch.id,
        jobId: job.id,
        status: batch.status,
        requestedCount: count,
      },
    };
  },

  async createFinalCompose(input: {
    workspaceId: string;
    outputAspectRatio: "9:16" | "16:9" | "1:1";
    idempotencyKey: string;
  }) {
    const existing = await db.db2.getFinalVideoJobByIdempotencyKey(input.idempotencyKey);
    if (existing) return { data: existing, deduped: true };
    const shots = await db.db2.listShotsByWorkspace(input.workspaceId);
    const missing = shots.filter((s) => !s.selectedVideoId).map((s) => s.id);
    if (missing.length > 0) {
      throw new HttpError(409, "MISSING_SELECTIONS", JSON.stringify(missing));
    }
    const orderedShots = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
    const sourceShotVideoIds: string[] = [];
    const sourceScriptIds: string[] = [];
    for (const s of orderedShots) {
      sourceShotVideoIds.push(s.selectedVideoId!);
      const script = s.activeVideoScriptArtifactId;
      if (!script) {
        throw new HttpError(409, "STALE_SELECTIONS", `Shot ${s.id} has no active script`);
      }
      sourceScriptIds.push(script);
    }
    const fv = await db.db2.insertFinalVideoJob({
      id: "fnl_" + nanoid(10),
      workspaceId: input.workspaceId,
      status: "PENDING",
      sourceShotVideoIds,
      sourceVideoScriptArtifactIds: sourceScriptIds,
      localPath: null,
      localUrl: null,
      durationSec: null,
      width: null,
      height: null,
      compiledManifest: {},
      compiledManifestHash: null,
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: input.idempotencyKey,
      completedAt: null,
    });
    const job = await jobRepository.insert({
      id: "job_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: null,
      jobType: "compose_final_video",
      status: "PENDING",
      queueName: GENERATION_V2_QUEUE_NAME,
      queueJobId: null,
      relatedBatchType: "final_video_job",
      relatedBatchId: fv.id,
      payload: {},
      progress: 0,
      attemptCount: 0,
      maxAttempts: 1,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });
    await enqueueGenerationV2({
      kind: "compose_final_video",
      jobId: job.id,
      finalVideoJobId: fv.id,
      workspaceId: input.workspaceId,
      traceId: nanoid(),
    });
    return {
      data: {
        finalVideoJobId: fv.id,
        jobId: job.id,
        status: fv.status,
      },
    };
  },
};
