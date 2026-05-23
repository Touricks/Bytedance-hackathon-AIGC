import { db } from "../../db/client.js";

export const creationRepository = {
  async createGenerationFromScript(scriptId: string) {
    const script = await db.getScript(scriptId);
    const job = await db.createJob({
      productId: script.productId,
      scriptId: script.id,
      payload: { scriptId }
    });

    return {
      job,
      script: await db.getScript(script.id),
      shots: await db.listShots(script.id)
    };
  },

  async getJobDetail(jobId: string) {
    const job = await db.getJob(jobId);
    const scriptBundle = job.scriptId
      ? {
          script: await db.getScript(job.scriptId),
          shots: await db.listShots(job.scriptId)
        }
      : null;
    const finalAsset = job.finalAssetId ? await db.getAsset(job.finalAssetId) : null;

    return { job, ...scriptBundle, finalAsset };
  }
};
