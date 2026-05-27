import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import {
  GENERATION_QUEUE_NAME,
  shotPromptArtifactSchema,
  type GenerateVideoJobPayload,
} from "@aigc-video/shared";
import { config } from "../common/config.js";
import { logger } from "../common/logger.js";
import { db } from "../db/client.js";
import { markJobFailed } from "./job-state.js";
import {
  processMediaGeneration,
  type MediaGenerationPromptSource,
} from "./processors/media-generate.processor.js";

let queue: Queue<GenerateVideoJobPayload> | undefined;
let worker: Worker<GenerateVideoJobPayload> | undefined;

function resolvePromptSource(input: {
  payload: Record<string, unknown>;
}): MediaGenerationPromptSource {
  const shotPromptResult = shotPromptArtifactSchema.safeParse(
    input.payload.shotprompt,
  );
  if (!shotPromptResult.success) {
    throw new Error(
      "V1 video generation requires a valid job.payload.shotprompt",
    );
  }

  return {
    kind: "shotprompt",
    shotPrompt: shotPromptResult.data,
  };
}

async function runGeneration(payload: GenerateVideoJobPayload) {
  const script = await db.getScript(payload.scriptId);
  const product = await db.getProduct(script.productId);
  const imageAsset = product.mainImageAssetId
    ? await db.getAsset(product.mainImageAssetId)
    : null;

  if (!imageAsset) {
    throw new Error("Product image asset not found for script");
  }

  const job = await db.getJob(payload.jobId);
  const promptSource = resolvePromptSource({
    payload: job.payload,
  });

  await processMediaGeneration(
    payload.jobId,
    { imageAsset, scriptId: payload.scriptId },
    promptSource,
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
