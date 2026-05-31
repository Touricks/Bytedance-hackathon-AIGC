import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { GENERATION_V2_QUEUE_NAME, type GenerationV2JobData } from "@aigc-video/shared";
import { config } from "../../common/config.js";
import { logger } from "../../common/logger.js";
import { db } from "../../db/client.js";

let queue: Queue<GenerationV2JobData> | undefined;
let worker: Worker<GenerationV2JobData> | undefined;

export interface GenerationV2JobMeta {
  attemptsMade: number;
  attempts: number;
}

export type Generationv2Processor = (
  data: GenerationV2JobData,
  meta?: GenerationV2JobMeta,
) => Promise<void>;
let registeredProcessor: Generationv2Processor | undefined;

export function registerGenerationV2Processor(fn: Generationv2Processor) {
  registeredProcessor = fn;
}

export async function enqueueGenerationV2(data: GenerationV2JobData) {
  if (config.useRedisQueue) {
    queue ??= new Queue<GenerationV2JobData>(GENERATION_V2_QUEUE_NAME, {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
    });
    const job = await queue.add(data.kind, data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
    });
    return String(job.id);
  }
  setTimeout(() => {
    if (!registeredProcessor) {
      logger.error("No generation_v2 processor registered");
      return;
    }
    registeredProcessor(data, { attemptsMade: 0, attempts: 1 }).catch((err) =>
      logger.error("generation_v2 job failed", { err }),
    );
  }, 0);
  return null;
}

export function startGenerationV2Worker() {
  if (!config.useRedisQueue) return;
  worker ??= new Worker<GenerationV2JobData>(
    GENERATION_V2_QUEUE_NAME,
    async (job) => {
      if (!registeredProcessor) throw new Error("No generation_v2 processor registered");
      await registeredProcessor(job.data, {
        attemptsMade: job.attemptsMade,
        attempts: job.opts.attempts ?? 1,
      });
    },
    {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
      concurrency: Math.max(1, config.maxImageBatchSize + config.maxVideoBatchSize),
    },
  );
}

export async function recoverInflightGenerationJobs() {
  const pool = db.db2.pool();
  const { rows } = await pool.query(
    `select * from generation_jobs where status in ('PENDING','RUNNING') and queue_job_id is null`,
  );
  // Bump RUNNING batches back to PENDING (workers are idempotent on status check)
  await pool.query(
    `update image_generation_batches set status='PENDING' where status='RUNNING'`,
  );
  await pool.query(
    `update image_candidates set status='PENDING' where status='RUNNING'`,
  );
  await pool.query(
    `update video_generation_batches set status='PENDING' where status='RUNNING'`,
  );
  for (const r of rows) {
    // Re-enqueue based on job_type + related_batch_id
    if (r.job_type === "generate_images" && r.related_batch_id) {
      const batch = await db.db2.getImageBatch(r.related_batch_id);
      await enqueueGenerationV2({
        kind: "generate_images",
        jobId: r.id,
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        imagePromptArtifactId: batch.imagePromptArtifactId,
        count: batch.requestedCount,
        aspectRatio: batch.aspectRatio as "9:16" | "16:9" | "1:1",
        traceId: "recover",
      });
    }
    if (r.job_type === "generate_image_candidate") {
      const payload = r.payload as Record<string, unknown>;
      if (
        typeof payload.batchId === "string" &&
        typeof payload.candidateId === "string" &&
        typeof payload.shotId === "string" &&
        typeof payload.workspaceId === "string" &&
        typeof payload.imagePromptArtifactId === "string" &&
        typeof payload.aspectRatio === "string"
      ) {
        const queueJobId = await enqueueGenerationV2({
          kind: "generate_image_candidate",
          jobId: r.id,
          batchId: payload.batchId,
          candidateId: payload.candidateId,
          candidateIndex:
            typeof payload.candidateIndex === "number"
              ? payload.candidateIndex
              : 0,
          shotId: payload.shotId,
          workspaceId: payload.workspaceId,
          imagePromptArtifactId: payload.imagePromptArtifactId,
          aspectRatio: payload.aspectRatio as "9:16" | "16:9" | "1:1",
          referenceImageUrls: Array.isArray(payload.referenceImageUrls)
            ? payload.referenceImageUrls.filter(
                (url): url is string => typeof url === "string",
              )
            : undefined,
          traceId: "recover",
        });
        if (queueJobId) {
          await db.db2.updateGenerationJob(r.id, { queueJobId });
        }
      }
    }
    if (r.job_type === "generate_videos" && r.related_batch_id) {
      const batch = await db.db2.getVideoBatch(r.related_batch_id);
      await enqueueGenerationV2({
        kind: "generate_videos",
        jobId: r.id,
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        videoScriptArtifactId: batch.videoScriptArtifactId,
        count: batch.requestedCount,
        aspectRatio: batch.aspectRatio as "9:16" | "16:9" | "1:1",
        traceId: "recover",
      });
    }
    if (r.job_type === "compose_final_video" && r.related_batch_id) {
      const job = await db.db2.getFinalVideoJob(r.related_batch_id);
      await enqueueGenerationV2({
        kind: "compose_final_video",
        jobId: r.id,
        finalVideoJobId: job.id,
        workspaceId: job.workspaceId,
        traceId: "recover",
      });
    }
  }
}
