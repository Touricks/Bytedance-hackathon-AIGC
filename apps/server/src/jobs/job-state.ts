import { appendTrace } from "../common/trace.js";
import { db } from "../db/client.js";

export async function markJobMediaGenerating(jobId: string) {
  const current = await db.getJob(jobId);
  return db.updateJob(jobId, {
    ...appendTrace(current, "media_generating", "Started 12 second video generation"),
    status: "running",
    stage: "media_generating",
    progress: 70
  });
}

export async function markJobCompleted(jobId: string, assetId: string) {
  const current = await db.getJob(jobId);
  return db.updateJob(jobId, {
    ...appendTrace(current, "completed", "Final video generated", {
      assetId
    }),
    status: "completed",
    stage: "completed",
    progress: 100,
    finalAssetId: assetId
  });
}

export async function markJobFailed(jobId: string, error: unknown) {
  const current = await db.getJob(jobId);
  const message = error instanceof Error ? error.message : "Unknown error";
  return db.updateJob(jobId, {
    ...appendTrace(current, "failed", "Generation job failed", {
      error: message
    }),
    status: "failed",
    stage: "failed",
    progress: 100,
    errorMessage: message
  });
}
