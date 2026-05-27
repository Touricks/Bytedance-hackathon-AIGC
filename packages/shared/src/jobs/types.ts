export const GENERATION_QUEUE_NAME = "generation";

export type GenerationJobName = "generate-video";

export interface GenerateVideoJobPayload {
  jobId: string;
  scriptId: string;
}
