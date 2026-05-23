import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import {
  GENERATION_QUEUE_NAME,
  type GenerateVideoJobPayload
} from "@aigc-video/shared";
import { config } from "../common/config.js";
import { logger } from "../common/logger.js";
import { db } from "../db/client.js";
import { markJobFailed } from "./job-state.js";
import { processMediaGeneration } from "./processors/media-generate.processor.js";

let queue: Queue<GenerateVideoJobPayload> | undefined;
let worker: Worker<GenerateVideoJobPayload> | undefined;

async function runGeneration(payload: GenerateVideoJobPayload) {
  const script = await db.getScript(payload.scriptId);
  const product = await db.getProduct(script.productId);
  const imageAsset = product.mainImageAssetId
    ? await db.getAsset(product.mainImageAssetId)
    : null;

  if (!imageAsset) {
    throw new Error("Product image asset not found for script");
  }

  const creativeBlueprint =
    script.rawJson &&
    typeof script.rawJson === "object" &&
    "creativeBlueprint" in script.rawJson
      ? (script.rawJson as { creativeBlueprint: unknown }).creativeBlueprint
      : script.rawJson;

  await processMediaGeneration(
    payload.jobId,
    { imageUrl: imageAsset.url },
    creativeBlueprint as Parameters<typeof processMediaGeneration>[2]
  );
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
      void markJobFailed(payload.jobId, error);
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
    if (job) {
      void markJobFailed(job.data.jobId, error);
    }
  });
}
