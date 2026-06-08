import type {
  GenerateImageCandidateJobData,
  GenerateImagesJobData,
} from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { traceService } from "../trace/trace.service.js";
import { jobRepository } from "../job/job.repository.js";
import type { GenerationJobMeta } from "../job/job.queue.js";
import {
  runImageGenerationCandidate,
  runImageGenerationBatch,
  __setAssetUrlResolverForTests,
  __setGeneratedAssetPersisterForTests,
  __setImageProviderForTests,
} from "./direct-generation.js";

type Adapter = typeof db.db2;
export {
  __setAssetUrlResolverForTests,
  __setGeneratedAssetPersisterForTests,
  __setImageProviderForTests,
};

async function refreshImageBatchCompletion(
  batchId: string,
  shotId: string,
  adapter: Adapter,
) {
  const client = await adapter.pool().connect();
  try {
    await client.query("begin");
    const batch = await client.query(
      `select requested_count from image_generation_batches where id = $1 for update`,
      [batchId],
    );
    const counts = await client.query(
      `select status, count(*)::int as count
       from image_candidates
       where batch_id = $1
       group by status`,
      [batchId],
    );
    const byStatus = new Map(
      counts.rows.map((row) => [String(row.status), Number(row.count)]),
    );
    const succeeded = byStatus.get("SUCCEEDED") ?? 0;
    const failed =
      (byStatus.get("FAILED") ?? 0) + (byStatus.get("REJECTED") ?? 0);
    const pending =
      (byStatus.get("PENDING") ?? 0) +
      (byStatus.get("RUNNING") ?? 0) +
      (byStatus.get("PERSISTING") ?? 0);
    const requested = Number(batch.rows[0]?.requested_count ?? 0);
    const status =
      pending > 0
        ? "RUNNING"
        : failed === 0 && succeeded === requested
          ? "SUCCEEDED"
          : succeeded > 0
            ? "PARTIAL"
            : "FAILED";
    const updated = await client.query(
      `update image_generation_batches
       set status = $2,
           succeeded_count = $3,
           failed_count = $4,
           updated_at = now()
       where id = $1
       returning *`,
      [batchId, status, succeeded, failed],
    );
    if (pending === 0) {
      await client.query(
        `update storyboard_shots
         set status = $2,
             last_error = $3,
             updated_at = now()
         where id = $1`,
        [
          shotId,
          status === "SUCCEEDED" ? "IMAGE_CANDIDATES_READY" : "FAILED",
          status === "SUCCEEDED"
            ? null
            : `Image batch ${batchId} completed with ${succeeded}/${requested} candidates`,
        ],
      );
    }
    await client.query("commit");
    return { batch: updated.rows[0], status, succeeded, failed, requested };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function processGenerateImageCandidate(
  data: GenerateImageCandidateJobData,
  adapter: Adapter = db.db2,
  meta?: GenerationJobMeta,
) {
  const batch = await adapter.getImageBatch(data.batchId);
  if (batch.status !== "PENDING" && batch.status !== "RUNNING") return;
  const attempts = Math.max(1, meta?.attempts ?? 1);
  const currentAttempt = Math.min(attempts, (meta?.attemptsMade ?? 0) + 1);
  const isFinalAttempt = currentAttempt >= attempts;

  await adapter.updateImageBatch(batch.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, {
    status: "RUNNING",
    attemptCount: currentAttempt,
    maxAttempts: attempts,
    startedAt: new Date().toISOString(),
  });

  try {
    const generated = await runImageGenerationCandidate({
      batchId: data.batchId,
      candidateId: data.candidateId,
      aspectRatio: data.aspectRatio,
      referenceImageUrls: data.referenceImageUrls,
      referenceImageUrlsAfterAssets: data.referenceImageUrlsAfterAssets,
      failCandidateOnError: isFinalAttempt,
      providerTrace: {
        workspaceId: data.workspaceId,
        shotId: data.shotId,
        jobId: data.jobId,
        attempt: currentAttempt,
        maxAttempts: attempts,
        candidateIndex: data.candidateIndex,
      },
      adapter,
    });
    await jobRepository.update(data.jobId, {
      status: generated.candidate.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
      completedAt: new Date().toISOString(),
      errorMessage: generated.candidate.errorMessage,
    });
  } catch (err) {
    const msg = String((err as Error).message ?? err);
    if (!isFinalAttempt) {
      await jobRepository.update(data.jobId, {
        status: "RUNNING",
        errorMessage: msg,
      });
      await traceService.record({
        workspaceId: data.workspaceId,
        shotId: data.shotId,
        traceType: "job_event",
        name: "image_candidate_retry",
        metadata: {
          jobId: data.jobId,
          batchId: data.batchId,
          candidateId: data.candidateId,
          candidateIndex: data.candidateIndex,
          attempt: currentAttempt,
          maxAttempts: attempts,
          error: msg,
        },
      });
      throw err;
    }
    await jobRepository.update(data.jobId, {
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorMessage: msg,
    });
    await traceService.record({
      workspaceId: data.workspaceId,
      shotId: data.shotId,
      traceType: "job_event",
      name: "image_candidate_failed",
      metadata: {
        jobId: data.jobId,
        batchId: data.batchId,
        candidateId: data.candidateId,
        candidateIndex: data.candidateIndex,
        error: msg,
      },
    });
  }

  const completion = await refreshImageBatchCompletion(
    data.batchId,
    data.shotId,
    adapter,
  );
  await traceService.record({
    workspaceId: data.workspaceId,
    shotId: data.shotId,
    traceType: "job_event",
    name: "image_candidate_completed",
    metadata: {
      jobId: data.jobId,
      batchId: data.batchId,
      candidateId: data.candidateId,
      candidateIndex: data.candidateIndex,
      batchStatus: completion.status,
      succeededCount: completion.succeeded,
      failedCount: completion.failed,
      requestedCount: completion.requested,
    },
  });
}

export async function processGenerateImages(
  data: GenerateImagesJobData,
  adapter: Adapter = db.db2,
) {
  const batch = await adapter.getImageBatch(data.batchId);
  if (batch.status !== "PENDING") return;

  await adapter.updateImageBatch(batch.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, {
    status: "RUNNING",
    startedAt: new Date().toISOString(),
  });

  let generated: Awaited<ReturnType<typeof runImageGenerationBatch>>;
  try {
    generated = await runImageGenerationBatch({
      batchId: data.batchId,
      count: data.count,
      aspectRatio: data.aspectRatio,
      providerTrace: {
        workspaceId: data.workspaceId,
        shotId: data.shotId,
        jobId: data.jobId,
        attempt: 1,
        maxAttempts: 1,
      },
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
    await traceService.record({
      workspaceId: data.workspaceId,
      shotId: data.shotId,
      traceType: "job_event",
      name: "image_batch_failed",
      metadata: { jobId: data.jobId },
    });
    throw err;
  }
  const finalStatus = generated.finalBatch.status;
  await jobRepository.update(data.jobId, {
    status: finalStatus === "FAILED" ? "FAILED" : "SUCCEEDED",
    completedAt: new Date().toISOString(),
  });
  await adapter.updateShot(data.shotId, {
    status: finalStatus === "FAILED" ? "FAILED" : "IMAGE_CANDIDATES_READY",
  });
  await traceService.record({
    workspaceId: data.workspaceId,
    shotId: data.shotId,
    traceType: "provider_call",
    name: "image_generation_completed",
    metadata: {
      provider: generated.result?.provider,
      model: generated.result?.model,
      count: generated.candidates.filter((candidate) => candidate.status === "SUCCEEDED").length,
      jobId: data.jobId,
    },
  });
}
