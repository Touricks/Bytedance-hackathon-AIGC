import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { GENERATION_V2_QUEUE_NAME, type GenerationV2JobData } from "@aigc-video/shared";
import { config } from "../../common/config.js";
import { logger } from "../../common/logger.js";
import { db } from "../../db/client.js";
import { resolveWorkerConcurrency } from "./concurrency.js";
import { shouldReenqueueInflightJob } from "./job.recovery.js";

let queue: Queue<GenerationV2JobData> | undefined;
let worker: Worker<GenerationV2JobData> | undefined;

export interface GenerationV2JobMeta {
  attemptsMade: number;
  attempts: number;
}

export type Generationv2Processor = (
  data: GenerationV2JobData,
  meta?: GenerationV2JobMeta
) => Promise<void>;
let registeredProcessor: Generationv2Processor | undefined;

interface EnqueueGenerationV2Options {
  delayMs?: number;
}

export function registerGenerationV2Processor(fn: Generationv2Processor) {
  registeredProcessor = fn;
}

function createRedisConnection() {
  return new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
}

function getGenerationV2Queue() {
  queue ??= new Queue<GenerationV2JobData>(GENERATION_V2_QUEUE_NAME, {
    connection: createRedisConnection()
  });
  return queue;
}

async function getQueueJobState(queueJobId: string | null) {
  if (!config.useRedisQueue || !queueJobId) return null;
  const job = await getGenerationV2Queue().getJob(queueJobId);
  return job ? job.getState() : null;
}

function recordValue(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

interface InflightGenerationJob {
  id: string;
  jobType: string;
  queueJobId: string | null;
  relatedBatchId: string | null;
  payload: Record<string, unknown>;
}

function toInflightGenerationJob(row: Record<string, unknown>): InflightGenerationJob {
  return {
    id: String(row.id),
    jobType: String(row.job_type),
    queueJobId: typeof row.queue_job_id === "string" ? row.queue_job_id : null,
    relatedBatchId:
      typeof row.related_batch_id === "string" ? row.related_batch_id : null,
    payload: recordValue(row.payload)
  };
}

async function prepareGenerationJobForReplay(
  job: InflightGenerationJob,
  queueJobState: string | null
) {
  const pool = db.db2.pool();
  const errorMessage = job.queueJobId
    ? `Recovered ${GENERATION_V2_QUEUE_NAME} job ${job.queueJobId} from ${
        queueJobState ?? "missing"
      } state`
    : null;
  await db.db2.updateGenerationJob(job.id, {
    status: "PENDING",
    queueJobId: null,
    errorMessage,
    startedAt: null,
    completedAt: null
  });

  const payload = job.payload;
  if (
    job.jobType === "generate_image_candidate" &&
    typeof payload.batchId === "string" &&
    typeof payload.candidateId === "string" &&
    typeof payload.shotId === "string"
  ) {
    await pool.query(
      `update image_generation_batches
       set status = 'PENDING', error_message = null, updated_at = now()
       where id = $1 and status in ('PENDING','RUNNING','FAILED')`,
      [payload.batchId]
    );
    await pool.query(
      `update image_candidates
       set status = 'PENDING', error_message = null
       where id = $1 and status in ('PENDING','RUNNING','FAILED')`,
      [payload.candidateId]
    );
    await pool.query(
      `update storyboard_shots
       set status = 'IMAGE_GENERATING', last_error = null, updated_at = now()
       where id = $1 and status in ('IMAGE_GENERATING','FAILED')`,
      [payload.shotId]
    );
  }

  if (
    job.jobType === "generate_video_candidate" &&
    typeof payload.batchId === "string" &&
    typeof payload.candidateId === "string" &&
    typeof payload.shotId === "string"
  ) {
    await pool.query(
      `update video_generation_batches
       set status = 'PENDING', error_message = null, updated_at = now()
       where id = $1 and status in ('PENDING','RUNNING','FAILED')`,
      [payload.batchId]
    );
    await pool.query(
      `update video_candidates
       set status = 'PENDING', error_message = null
       where id = $1 and status in ('PENDING','RUNNING','FAILED')`,
      [payload.candidateId]
    );
    await pool.query(
      `update storyboard_shots
       set status = 'VIDEO_GENERATING', last_error = null, updated_at = now()
       where id = $1 and status in ('VIDEO_GENERATING','FAILED')`,
      [payload.shotId]
    );
  }

  if (job.jobType === "compose_final_video" && job.relatedBatchId) {
    await pool.query(
      `update final_video_jobs
       set status = 'PENDING', error_message = null, updated_at = now()
       where id = $1 and status in ('PENDING','RUNNING','FAILED')`,
      [job.relatedBatchId]
    );
  }

  if (job.jobType === "advance_one_click_final_video" && job.relatedBatchId) {
    await pool.query(
      `update one_click_final_video_jobs
       set status = 'PENDING', updated_at = now()
       where id = $1 and status in ('PENDING','RUNNING','WAITING')`,
      [job.relatedBatchId]
    );
  }
}

export async function enqueueGenerationV2(
  data: GenerationV2JobData,
  options: EnqueueGenerationV2Options = {},
) {
  if (config.useRedisQueue) {
    const job = await getGenerationV2Queue().add(data.kind, data, {
      attempts: 3,
      delay: options.delayMs ?? 0,
      backoff: { type: "exponential", delay: 5_000 }
    });
    return String(job.id);
  }
  setTimeout(() => {
    if (!registeredProcessor) {
      logger.error("No generation_v2 processor registered");
      return;
    }
    registeredProcessor(data, { attemptsMade: 0, attempts: 1 }).catch((err) =>
      logger.error("generation_v2 job failed", { err })
    );
  }, options.delayMs ?? 0);
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
        attempts: job.opts.attempts ?? 1
      });
    },
    {
      connection: createRedisConnection(),
      concurrency: resolveWorkerConcurrency({
        generationWorkerConcurrency: config.generationWorkerConcurrency
      }),
      lockDuration: 300_000,
      maxStalledCount: 3
    }
  );
}

export async function recoverInflightGenerationJobs() {
  const pool = db.db2.pool();
  const result = await pool.query(
    `select * from generation_jobs where status in ('PENDING','RUNNING')`
  );
  const rows = result.rows.map((row) =>
    toInflightGenerationJob(row as Record<string, unknown>)
  );
  // Bump RUNNING batches back to PENDING (workers are idempotent on status check)
  await pool.query(
    `update image_generation_batches set status='PENDING' where status='RUNNING'`
  );
  await pool.query(`update image_candidates set status='PENDING' where status='RUNNING'`);
  await pool.query(
    `update video_generation_batches set status='PENDING' where status='RUNNING'`
  );
  await pool.query(`update video_candidates set status='PENDING' where status='RUNNING'`);
  for (const r of rows) {
    const queueJobState = await getQueueJobState(r.queueJobId);
    if (
      !shouldReenqueueInflightJob({
        useRedisQueue: config.useRedisQueue,
        queueJobId: r.queueJobId,
        queueJobState
      })
    ) {
      continue;
    }
    await prepareGenerationJobForReplay(r, queueJobState);
    // Re-enqueue based on job_type + related_batch_id
    if (r.jobType === "generate_images" && r.relatedBatchId) {
      const batch = await db.db2.getImageBatch(r.relatedBatchId);
      await enqueueGenerationV2({
        kind: "generate_images",
        jobId: r.id,
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        imagePromptArtifactId: batch.imagePromptArtifactId,
        count: batch.requestedCount,
        aspectRatio: batch.aspectRatio as "9:16" | "16:9" | "1:1",
        traceId: "recover"
      });
    }
    if (r.jobType === "generate_image_candidate") {
      const payload = r.payload;
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
            typeof payload.candidateIndex === "number" ? payload.candidateIndex : 0,
          shotId: payload.shotId,
          workspaceId: payload.workspaceId,
          imagePromptArtifactId: payload.imagePromptArtifactId,
          aspectRatio: payload.aspectRatio as "9:16" | "16:9" | "1:1",
          referenceImageUrls: Array.isArray(payload.referenceImageUrls)
            ? payload.referenceImageUrls.filter(
                (url): url is string => typeof url === "string"
              )
            : undefined,
          referenceImageUrlsAfterAssets: Array.isArray(payload.referenceImageUrlsAfterAssets)
            ? payload.referenceImageUrlsAfterAssets.filter(
                (url): url is string => typeof url === "string"
              )
            : undefined,
          traceId: "recover"
        });
        if (queueJobId) {
          await db.db2.updateGenerationJob(r.id, { queueJobId });
        }
      }
    }
    if (r.jobType === "generate_videos" && r.relatedBatchId) {
      const batch = await db.db2.getVideoBatch(r.relatedBatchId);
      await enqueueGenerationV2({
        kind: "generate_videos",
        jobId: r.id,
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        videoScriptArtifactId: batch.videoScriptArtifactId,
        count: batch.requestedCount,
        aspectRatio: batch.aspectRatio as "9:16" | "16:9" | "1:1",
        traceId: "recover"
      });
    }
    if (r.jobType === "generate_video_candidate") {
      const payload = r.payload;
      if (
        typeof payload.batchId === "string" &&
        typeof payload.candidateId === "string" &&
        typeof payload.shotId === "string" &&
        typeof payload.workspaceId === "string" &&
        typeof payload.videoScriptArtifactId === "string" &&
        typeof payload.aspectRatio === "string"
      ) {
        const queueJobId = await enqueueGenerationV2({
          kind: "generate_video_candidate",
          jobId: r.id,
          batchId: payload.batchId,
          candidateId: payload.candidateId,
          candidateIndex:
            typeof payload.candidateIndex === "number" ? payload.candidateIndex : 0,
          shotId: payload.shotId,
          workspaceId: payload.workspaceId,
          videoScriptArtifactId: payload.videoScriptArtifactId,
          aspectRatio: payload.aspectRatio as "9:16" | "16:9" | "1:1",
          traceId: "recover"
        });
        if (queueJobId) {
          await db.db2.updateGenerationJob(r.id, { queueJobId });
        }
      }
    }
    if (r.jobType === "compose_final_video" && r.relatedBatchId) {
      const job = await db.db2.getFinalVideoJob(r.relatedBatchId);
      await enqueueGenerationV2({
        kind: "compose_final_video",
        jobId: r.id,
        finalVideoJobId: job.id,
        workspaceId: job.workspaceId,
        traceId: "recover"
      });
    }
    if (r.jobType === "advance_one_click_final_video" && r.relatedBatchId) {
      let workspaceId =
        typeof r.payload.workspaceId === "string" ? r.payload.workspaceId : null;
      if (!workspaceId) {
        const result = await pool.query(
          `select workspace_id from one_click_final_video_jobs where id = $1 limit 1`,
          [r.relatedBatchId],
        );
        workspaceId =
          typeof result.rows[0]?.workspace_id === "string"
            ? result.rows[0].workspace_id
            : null;
      }
      if (workspaceId) {
        const queueJobId = await enqueueGenerationV2({
          kind: "advance_one_click_final_video",
          jobId: r.id,
          oneClickJobId: r.relatedBatchId,
          workspaceId,
          traceId: "recover",
        });
        if (queueJobId) {
          await db.db2.updateGenerationJob(r.id, { queueJobId });
        }
      }
    }
  }
}
