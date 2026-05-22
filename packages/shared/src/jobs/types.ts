import type { CreateGenerationJobRequest } from "../dto/creation.js";

export const GENERATION_QUEUE_NAME = "generation";

export type GenerationJobName = "generate-video";

export interface GenerateVideoJobPayload {
  jobId: string;
  product: CreateGenerationJobRequest;
}
