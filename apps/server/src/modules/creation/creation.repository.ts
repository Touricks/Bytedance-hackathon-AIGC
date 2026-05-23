import { db } from "../../db/client.js";

export const creationRepository = {
  createGenerationFromScript(scriptId: string) {
    const script = db.getScript(scriptId);
    const job = db.createJob({
      productId: script.productId,
      scriptId: script.id,
      payload: { scriptId }
    });

    return {
      job,
      script: db.getScript(script.id),
      shots: db.listShots(script.id)
    };
  },

  getJobDetail(jobId: string) {
    const job = db.getJob(jobId);
    const scriptBundle = job.scriptId
      ? {
          script: db.getScript(job.scriptId),
          shots: db.listShots(job.scriptId)
        }
      : null;
    const finalAsset = job.finalAssetId ? db.getAsset(job.finalAssetId) : null;

    return { job, ...scriptBundle, finalAsset };
  }
};
