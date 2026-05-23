import type { CreateGenerationJobRequest } from "@aigc-video/shared";
import { enqueueGenerationJob } from "../../jobs/queue.js";
import { creationRepository } from "./creation.repository.js";

export const creationService = {
  async createGenerationJob(input: CreateGenerationJobRequest) {
    const result = creationRepository.createGenerationFromScript(input.scriptId);
    await enqueueGenerationJob({
      jobId: result.job.id,
      scriptId: input.scriptId
    });
    return result;
  },

  getJobDetail(jobId: string) {
    return creationRepository.getJobDetail(jobId);
  }
};
