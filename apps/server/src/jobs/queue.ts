import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import {
  GENERATION_QUEUE_NAME,
  type GenerateVideoJobPayload
} from "@aigc-video/shared";
import { config } from "../common/config.js";
import { logger } from "../common/logger.js";
import { db } from "../db/client.js";
import { processScriptGeneration } from "./processors/script-generate.processor.js";
import { processMediaGeneration } from "./processors/media-generate.processor.js";

let queue: Queue<GenerateVideoJobPayload> | undefined;
let worker: Worker<GenerateVideoJobPayload> | undefined;

async function runGeneration(payload: GenerateVideoJobPayload) {
  const { script } = await processScriptGeneration(payload.jobId, payload.product);
  const generated = script.rawJson as Parameters<typeof processMediaGeneration>[2];
  await processMediaGeneration(payload.jobId, payload.product, generated);
}

export async function enqueueGenerationJob(payload: GenerateVideoJobPayload) {
  if (config.useRedisQueue) {
    queue ??= new Queue<GenerateVideoJobPayload>(GENERATION_QUEUE_NAME, {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null })
    });
    await queue.add("generate-video", payload);
    return;
  }

  setTimeout(() => {
    runGeneration(payload).catch((error: unknown) => {
      logger.error("Generation job failed", { error });
      db.updateJob(payload.jobId, {
        status: "failed",
        stage: "failed",
        progress: 100,
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
    });
  }, 0);
}

export function startGenerationWorker() {
  if (!config.useRedisQueue) {
    logger.info("Using in-process generation queue");
    return;
  }

  worker ??= new Worker<GenerateVideoJobPayload>(
    GENERATION_QUEUE_NAME,
    async (job) => {
      await runGeneration(job.data);
    },
    {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
      concurrency: 5
    }
  );

  worker.on("failed", (job, error) => {
    logger.error("BullMQ generation job failed", {
      jobId: job?.data.jobId,
      error: error.message
    });
  });
}
