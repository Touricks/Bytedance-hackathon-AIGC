import type { CreateGenerationJobRequest } from "@aigc-video/shared";
import { db } from "../../db/client.js";

export const creationRepository = {
  createGeneration(input: CreateGenerationJobRequest) {
    const imageAsset = db.createAsset({
      type: "product_image",
      url: input.imageUrl,
      source: input.imageUrl.startsWith("/mocks/") ? "mock" : "upload"
    });

    const product = db.createProduct({
      title: input.title,
      sellingPoints: input.sellingPoints,
      audience: input.audience,
      mainImageAssetId: imageAsset.id
    });

    const job = db.createJob({
      productId: product.id,
      payload: input
    });

    return { product, imageAsset, job };
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
