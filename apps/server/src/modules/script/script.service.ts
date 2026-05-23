import { db } from "../../db/client.js";
import { scriptRepository } from "./script.repository.js";

export const scriptService = {
  async getScriptByJob(jobId: string) {
    const job = await db.getJob(jobId);
    if (!job.scriptId) {
      return null;
    }
    return scriptRepository.getScriptWithShots(job.scriptId);
  }
};
