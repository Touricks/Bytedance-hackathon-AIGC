import { creationRepository } from "./creation.repository.js";

export const creationService = {
  getJobDetail(jobId: string) {
    return creationRepository.getJobDetail(jobId);
  }
};
