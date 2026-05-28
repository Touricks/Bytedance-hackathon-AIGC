import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { GENERATION_V2_QUEUE_NAME, type GenerationV2JobData } from "@aigc-video/shared";
import { config } from "../../common/config.js";
import { logger } from "../../common/logger.js";

let queue: Queue<GenerationV2JobData> | undefined;
let worker: Worker<GenerationV2JobData> | undefined;

export type Generationv2Processor = (data: GenerationV2JobData) => Promise<void>;
let registeredProcessor: Generationv2Processor | undefined;

export function registerGenerationV2Processor(fn: Generationv2Processor) {
  registeredProcessor = fn;
}

export async function enqueueGenerationV2(data: GenerationV2JobData) {
  if (config.useRedisQueue) {
    queue ??= new Queue<GenerationV2JobData>(GENERATION_V2_QUEUE_NAME, {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
    });
    await queue.add(data.kind, data);
    return;
  }
  setTimeout(() => {
    if (!registeredProcessor) {
      logger.error("No generation_v2 processor registered");
      return;
    }
    registeredProcessor(data).catch((err) => logger.error("generation_v2 job failed", { err }));
  }, 0);
}

export function startGenerationV2Worker() {
  if (!config.useRedisQueue) return;
  worker ??= new Worker<GenerationV2JobData>(
    GENERATION_V2_QUEUE_NAME,
    async (job) => {
      if (!registeredProcessor) throw new Error("No generation_v2 processor registered");
      await registeredProcessor(job.data);
    },
    {
      connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }),
      concurrency: Math.max(1, config.maxImageBatchSize + config.maxVideoBatchSize),
    },
  );
}
