import type { GenerateVideosJobData } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { jobRepository } from "../job/job.repository.js";
import { traceService } from "../trace/trace.service.js";
import {
  runVideoGenerationBatch,
  __setGeneratedAssetPersisterForTests,
  __setVideoProviderForTests,
} from "./direct-generation.js";

type Adapter = typeof db.db2;
export {
  __setGeneratedAssetPersisterForTests,
  __setVideoProviderForTests,
};

export async function processGenerateVideos(
  data: GenerateVideosJobData,
  adapter: Adapter = db.db2,
) {
  const batch = await adapter.getVideoBatch(data.batchId);
  if (batch.status !== "PENDING") return;

  await adapter.updateVideoBatch(batch.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, {
    status: "RUNNING",
    startedAt: new Date().toISOString(),
  });

  let generated: Awaited<ReturnType<typeof runVideoGenerationBatch>>;
  try {
    generated = await runVideoGenerationBatch({
      batchId: data.batchId,
      count: data.count,
      aspectRatio: data.aspectRatio,
      adapter,
    });
  } catch (err) {
    const msg = String((err as Error).message ?? err);
    await adapter.updateShot(data.shotId, { status: "FAILED", lastError: msg });
    await jobRepository.update(data.jobId, {
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorMessage: msg,
    });
    throw err;
  }

  const finalStatus = generated.finalBatch.status;
  await jobRepository.update(data.jobId, {
    status: finalStatus === "FAILED" ? "FAILED" : "SUCCEEDED",
    completedAt: new Date().toISOString(),
  });
  await adapter.updateShot(data.shotId, {
    status: finalStatus === "FAILED" ? "FAILED" : "VIDEO_CANDIDATES_READY",
  });
  await traceService.record({
    workspaceId: data.workspaceId,
    shotId: data.shotId,
    traceType: "provider_call",
    name: "video_generation_completed",
    metadata: {
      succeeded: generated.candidates.filter((candidate) => candidate.status === "SUCCEEDED").length,
      failed: generated.candidates.filter((candidate) => candidate.status === "FAILED").length,
      jobId: data.jobId,
    },
  });
}
