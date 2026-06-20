import { nanoid } from "nanoid";
import { GENERATION_QUEUE_NAME } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { HttpError } from "../../common/errors.js";
import { jobRepository } from "../job/job.repository.js";
import { enqueueGeneration } from "../job/job.queue.js";
import { shotWorkflowService } from "../shot/shot.service.js";

export const generationService = {
  async createImageBatch(input: {
    workspaceId: string;
    shotId: string;
    imagePromptArtifactId: string;
    count?: number;
    aspectRatio: "9:16" | "16:9" | "1:1";
    idempotencyKey: string;
    providerRequest?: Record<string, unknown>;
    referenceImageUrls?: string[];
    referenceImageUrlsAfterAssets?: string[];
  }) {
    const existing = await db.db2.getImageBatchByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      const candidates = await db.db2.listImageCandidatesByBatch(existing.id);
      return { data: existing, batch: existing, candidates, deduped: true };
    }
    const active = await db.db2.getActiveImageBatchForShot(input.shotId);
    if (active) {
      const candidates = await db.db2.listImageCandidatesByBatch(active.id);
      return { data: active, batch: active, candidates, deduped: true, ignored: true };
    }
    const count = shotWorkflowService.resolveBatchCount("image", input.count);
    const batch = await db.db2.insertImageBatch({
      id: "imb_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      imagePromptArtifactId: input.imagePromptArtifactId,
      status: "PENDING",
      requestedCount: count,
      succeededCount: 0,
      failedCount: 0,
      provider: "ark-seedream",
      aspectRatio: input.aspectRatio,
      providerRequest: input.providerRequest ?? {},
      errorMessage: null,
      idempotencyKey: input.idempotencyKey,
    });
    const candidates = [];
    const jobIds = [];
    const queueJobIds = [];
    for (let candidateIndex = 0; candidateIndex < count; candidateIndex += 1) {
      const candidate = await db.db2.insertImageCandidate({
        id: "imc_" + nanoid(10),
        batchId: batch.id,
        workspaceId: input.workspaceId,
        shotId: input.shotId,
        imageUrl: null,
        objectKey: null,
        width: null,
        height: null,
        seed: null,
        provider: "ark-seedream",
        providerResponse: { candidateIndex },
        status: "PENDING",
        errorMessage: null,
      });
      candidates.push(candidate);
      const payload = {
        batchId: batch.id,
        candidateId: candidate.id,
        candidateIndex,
        shotId: input.shotId,
        workspaceId: input.workspaceId,
        imagePromptArtifactId: input.imagePromptArtifactId,
        aspectRatio: input.aspectRatio,
        referenceImageUrls: input.referenceImageUrls ?? [],
        referenceImageUrlsAfterAssets: input.referenceImageUrlsAfterAssets ?? [],
      };
      const job = await jobRepository.insert({
        id: "job_" + nanoid(10),
        workspaceId: input.workspaceId,
        shotId: input.shotId,
        jobType: "generate_image_candidate",
        status: "PENDING",
        queueName: GENERATION_QUEUE_NAME,
        queueJobId: null,
        relatedBatchType: "image_candidate",
        relatedBatchId: candidate.id,
        payload,
        progress: 0,
        attemptCount: 0,
        maxAttempts: 3,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      });
      const queueJobId = await enqueueGeneration({
        kind: "generate_image_candidate",
        jobId: job.id,
        batchId: batch.id,
        candidateId: candidate.id,
        candidateIndex,
        shotId: input.shotId,
        workspaceId: input.workspaceId,
        imagePromptArtifactId: input.imagePromptArtifactId,
        aspectRatio: input.aspectRatio,
        referenceImageUrls: input.referenceImageUrls,
        referenceImageUrlsAfterAssets: input.referenceImageUrlsAfterAssets,
        traceId: nanoid(),
      });
      jobIds.push(job.id);
      if (queueJobId) {
        queueJobIds.push(queueJobId);
        await jobRepository.update(job.id, { queueJobId });
      }
    }
    await db.db2.updateShot(input.shotId, { status: "IMAGE_GENERATING" });
    return {
      data: {
        batchId: batch.id,
        jobIds,
        queueJobIds,
        status: batch.status,
        requestedCount: count,
      },
      batch,
      candidates,
    };
  },

  async createVideoBatch(input: {
    workspaceId: string;
    shotId: string;
    videoScriptArtifactId: string;
    count?: number;
    aspectRatio: "9:16" | "16:9" | "1:1";
    idempotencyKey: string;
    providerRequest?: Record<string, unknown>;
  }) {
    const existing = await db.db2.getVideoBatchByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      const candidates = await db.db2.listVideoCandidatesByBatch(existing.id);
      return { data: existing, batch: existing, candidates, deduped: true };
    }
    const active = await db.db2.getActiveVideoBatchForShot(input.shotId);
    if (active) {
      const candidates = await db.db2.listVideoCandidatesByBatch(active.id);
      return { data: active, batch: active, candidates, deduped: true, ignored: true };
    }
    const script = await db.db2.getVideoScriptArtifact(input.videoScriptArtifactId);
    if (script.status !== "ACTIVE") {
      throw new HttpError(409, "STALE_SCRIPT", "Cannot generate video on stale script");
    }
    const count = shotWorkflowService.resolveBatchCount("video", input.count);
    const batch = await db.db2.insertVideoBatch({
      id: "vbb_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      videoScriptArtifactId: input.videoScriptArtifactId,
      status: "PENDING",
      requestedCount: count,
      succeededCount: 0,
      failedCount: 0,
      provider: "seedance",
      aspectRatio: input.aspectRatio,
      providerRequest: input.providerRequest ?? {},
      errorMessage: null,
      idempotencyKey: input.idempotencyKey,
    });
    // One job per candidate, exactly like images: the single shared worker's
    // concurrency plus the VIDEO_PROVIDER_CONCURRENCY semaphore bound
    // how many Seedance calls run at once, and each candidate retries on its own.
    const candidates = [];
    const jobIds = [];
    const queueJobIds = [];
    for (let candidateIndex = 0; candidateIndex < count; candidateIndex += 1) {
      const candidate = await db.db2.insertVideoCandidate({
        id: "vcd_" + nanoid(10),
        batchId: batch.id,
        workspaceId: input.workspaceId,
        shotId: input.shotId,
        videoUrl: null,
        objectKey: null,
        thumbnailUrl: null,
        durationSec: null,
        width: null,
        height: null,
        provider: "seedance",
        providerResponse: { candidateIndex },
        status: "PENDING",
        errorMessage: null,
      });
      candidates.push(candidate);
      const job = await jobRepository.insert({
        id: "job_" + nanoid(10),
        workspaceId: input.workspaceId,
        shotId: input.shotId,
        jobType: "generate_video_candidate",
        status: "PENDING",
        queueName: GENERATION_QUEUE_NAME,
        queueJobId: null,
        relatedBatchType: "video_candidate",
        relatedBatchId: candidate.id,
        payload: {
          batchId: batch.id,
          candidateId: candidate.id,
          candidateIndex,
          shotId: input.shotId,
          workspaceId: input.workspaceId,
          videoScriptArtifactId: input.videoScriptArtifactId,
          aspectRatio: input.aspectRatio,
        },
        progress: 0,
        attemptCount: 0,
        maxAttempts: 3,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      });
      const queueJobId = await enqueueGeneration({
        kind: "generate_video_candidate",
        jobId: job.id,
        batchId: batch.id,
        candidateId: candidate.id,
        candidateIndex,
        shotId: input.shotId,
        workspaceId: input.workspaceId,
        videoScriptArtifactId: input.videoScriptArtifactId,
        aspectRatio: input.aspectRatio,
        traceId: nanoid(),
      });
      jobIds.push(job.id);
      if (queueJobId) {
        queueJobIds.push(queueJobId);
        await jobRepository.update(job.id, { queueJobId });
      }
    }
    await db.db2.updateShot(input.shotId, { status: "VIDEO_GENERATING" });
    return {
      data: {
        batchId: batch.id,
        jobIds,
        queueJobIds,
        status: batch.status,
        requestedCount: count,
      },
      batch,
      candidates,
    };
  },

  async createFinalCompose(input: {
    workspaceId: string;
    outputAspectRatio: "9:16" | "16:9" | "1:1";
    idempotencyKey: string;
  }) {
    const existing = await db.db2.getFinalVideoJobByIdempotencyKey(input.idempotencyKey);
    if (existing) return { data: existing, deduped: true };
    const activeShotSet = await db.db2.pool().query(
      `select id from shot_sets
       where workspace_id = $1 and status = 'active'
       order by created_at desc
       limit 1`,
      [input.workspaceId],
    );
    const shotSetId =
      typeof activeShotSet.rows[0]?.id === "string" ? activeShotSet.rows[0].id : null;
    if (!shotSetId) {
      throw new HttpError(409, "NO_ACTIVE_SHOT_SET", "No active shot set exists");
    }
    const selected = await db.db2.pool().query(
      `select s.id as shot_id,
              s.order_index,
              s.active_video_script_artifact_id,
              v.video_candidate_id,
              b.video_script_artifact_id as selected_video_script_artifact_id
       from storyboard_shots s
       left join video_select_artifacts v on v.shot_id = s.id
       left join video_generation_batches b on b.id = v.video_generation_batch_id
       where s.workspace_id = $1
         and s.shot_set_id = $2
       order by s.order_index asc`,
      [input.workspaceId, shotSetId],
    );
    const shots = selected.rows.map((row) => ({
      id: String(row.shot_id),
      activeVideoScriptArtifactId:
        typeof row.active_video_script_artifact_id === "string"
          ? row.active_video_script_artifact_id
          : null,
      selectedVideoScriptArtifactId:
        typeof row.selected_video_script_artifact_id === "string"
          ? row.selected_video_script_artifact_id
          : null,
      selectedVideoId:
        typeof row.video_candidate_id === "string" ? row.video_candidate_id : null,
    }));
    const missing = shots.filter((s) => !s.selectedVideoId).map((s) => s.id);
    if (missing.length > 0) {
      throw new HttpError(409, "MISSING_SELECTIONS", JSON.stringify(missing));
    }
    const sourceShotVideoIds: string[] = [];
    const sourceScriptIds: string[] = [];
    for (const s of shots) {
      sourceShotVideoIds.push(s.selectedVideoId!);
      const script = s.selectedVideoScriptArtifactId ?? s.activeVideoScriptArtifactId;
      if (!script) {
        throw new HttpError(409, "STALE_SELECTIONS", `Shot ${s.id} has no active script`);
      }
      sourceScriptIds.push(script);
    }
    const fv = await db.db2.insertFinalVideoJob({
      id: "fnl_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotSetId,
      status: "PENDING",
      sourceShotVideoIds,
      sourceVideoScriptArtifactIds: sourceScriptIds,
      localPath: null,
      localUrl: null,
      durationSec: null,
      width: null,
      height: null,
      compiledManifest: {},
      compiledManifestHash: null,
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: input.idempotencyKey,
      completedAt: null,
    });
    const job = await jobRepository.insert({
      id: "job_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: null,
      jobType: "compose_final_video",
      status: "PENDING",
      queueName: GENERATION_QUEUE_NAME,
      queueJobId: null,
      relatedBatchType: "final_video_job",
      relatedBatchId: fv.id,
      payload: {},
      progress: 0,
      attemptCount: 0,
      maxAttempts: 1,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });
    await enqueueGeneration({
      kind: "compose_final_video",
      jobId: job.id,
      finalVideoJobId: fv.id,
      workspaceId: input.workspaceId,
      traceId: nanoid(),
    });
    return {
      data: {
        finalVideoJobId: fv.id,
        jobId: job.id,
        status: fv.status,
      },
    };
  },
};
