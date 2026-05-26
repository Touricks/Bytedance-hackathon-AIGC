import { db } from "../../db/client.js";
import type { WorkspaceVideoArchiveRecord } from "../../db/client.js";

function toVideoExportRunView(record: WorkspaceVideoArchiveRecord) {
  return {
    jobId: record.jobId,
    scriptId: record.scriptId,
    workspaceId: record.workspaceId,
    provider: record.provider,
    promptView: record.promptView,
    finalVideo: {
      assetId: record.finalAssetId,
      localUrl: record.localUrl,
      providerUrl: record.providerUrl,
      archivedAt: record.archivedAt,
    },
  };
}

export const creationRepository = {
  async createGenerationFromScript(scriptId: string) {
    const script = await db.getScript(scriptId);
    const job = await db.createJob({
      productId: script.productId,
      scriptId: script.id,
      payload: { scriptId },
    });

    return {
      job,
      script: await db.getScript(script.id),
      shots: await db.listShots(script.id),
    };
  },

  async getJobDetail(jobId: string) {
    const job = await db.getJob(jobId);
    const scriptBundle = job.scriptId
      ? {
          script: await db.getScript(job.scriptId),
          shots: await db.listShots(job.scriptId),
        }
      : null;
    const finalAsset = job.finalAssetId
      ? await db.getAsset(job.finalAssetId)
      : null;
    const archive = await db.getWorkspaceVideoArchiveByJob(job.id);

    return {
      job,
      ...scriptBundle,
      finalAsset,
      ...(archive ? { videoExport: toVideoExportRunView(archive) } : {}),
    };
  },
};
