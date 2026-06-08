import { nanoid } from "nanoid";
import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import { GENERATION_V2_QUEUE_NAME } from "@aigc-video/shared";
import { HttpError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { jobRepository } from "../job/job.repository.js";
import { enqueueGenerationV2 } from "../job/job.queue.js";
import { shotWorkflowService } from "../shot/shot.service.js";
import { materialIntakeV2Service } from "../workspace/material-intake-v2.service.js";
import { productBriefV2Service } from "../workspace/product-brief-v2.service.js";
import { shotSetService } from "../workspace/shot-set.service.js";
import { shotPromptV2Service } from "../workspace/shotprompt-v2.service.js";
import { storyboardV2Service } from "../workspace/storyboard-v2.service.js";
import { traceService } from "../trace/trace.service.js";
import { generationService } from "./generation.service.js";

type OneClickStatus = "PENDING" | "RUNNING" | "WAITING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
type AspectRatio = "9:16" | "16:9" | "1:1";

const ONE_CLICK_AUTO_SELECTION_CANDIDATE_COUNT = 1;

type StageState = {
  image?: {
    currentIndex?: number;
    batchIdsByShotId?: Record<string, string>;
    selectedCandidateIdsByShotId?: Record<string, string>;
  };
  video?: {
    batchIdsByShotId?: Record<string, string>;
    selectedCandidateIdsByShotId?: Record<string, string>;
  };
  materialIntake?: { artifactId?: string };
  productBrief?: { artifactId?: string };
  storyboard?: { artifactId?: string };
  shotPrompt?: { artifactId?: string };
  shotSet?: { id?: string };
  finalVideo?: { jobId?: string };
  [key: string]: unknown;
};

export interface OneClickFinalVideoJobView {
  id: string;
  workspaceId: string;
  status: OneClickStatus;
  currentStage: string;
  stageState: StageState;
  materialIntakeArtifactId: string | null;
  productBriefArtifactId: string | null;
  storyboardArtifactId: string | null;
  shotPromptArtifactId: string | null;
  shotSetId: string | null;
  finalVideoJobId: string | null;
  autoSelectionStrategy: "first_success";
  outputAspectRatio: AspectRatio;
  errorCode: string | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

function toStageState(value: unknown): StageState {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as StageState)
    : {};
}

function toJobView(row: Record<string, unknown>): OneClickFinalVideoJobView {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    status: row.status as OneClickStatus,
    currentStage: String(row.current_stage),
    stageState: toStageState(row.stage_state),
    materialIntakeArtifactId:
      typeof row.material_intake_artifact_id === "string"
        ? row.material_intake_artifact_id
        : null,
    productBriefArtifactId:
      typeof row.product_brief_artifact_id === "string" ? row.product_brief_artifact_id : null,
    storyboardArtifactId:
      typeof row.storyboard_artifact_id === "string" ? row.storyboard_artifact_id : null,
    shotPromptArtifactId:
      typeof row.shot_prompt_artifact_id === "string" ? row.shot_prompt_artifact_id : null,
    shotSetId: typeof row.shot_set_id === "string" ? row.shot_set_id : null,
    finalVideoJobId:
      typeof row.final_video_job_id === "string" ? row.final_video_job_id : null,
    autoSelectionStrategy: "first_success",
    outputAspectRatio: (row.output_aspect_ratio as AspectRatio) ?? "9:16",
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
  };
}

async function getJobById(id: string) {
  const result = await db.db2.pool().query(
    `select * from one_click_final_video_jobs where id = $1 limit 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "ONE_CLICK_JOB_NOT_FOUND", "One-click final video job not found");
  }
  return toJobView(row);
}

async function getJobByIdempotencyKey(key: string) {
  const result = await db.db2.pool().query(
    `select * from one_click_final_video_jobs where idempotency_key = $1 limit 1`,
    [key],
  );
  return result.rows[0] ? toJobView(result.rows[0]) : null;
}

async function getActiveJob(workspaceId: string) {
  const result = await db.db2.pool().query(
    `select *
     from one_click_final_video_jobs
     where workspace_id = $1 and status in ('PENDING', 'RUNNING', 'WAITING')
     order by created_at desc
     limit 1`,
    [workspaceId],
  );
  return result.rows[0] ? toJobView(result.rows[0]) : null;
}

async function updateJob(
  id: string,
  patch: {
    status?: OneClickStatus;
    currentStage?: string;
    stageState?: StageState;
    materialIntakeArtifactId?: string | null;
    productBriefArtifactId?: string | null;
    storyboardArtifactId?: string | null;
    shotPromptArtifactId?: string | null;
    shotSetId?: string | null;
    finalVideoJobId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  },
) {
  const updates: string[] = ["updated_at = now()"];
  const values: unknown[] = [id];
  const add = (column: string, value: unknown) => {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  };
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.currentStage !== undefined) add("current_stage", patch.currentStage);
  if (patch.stageState !== undefined) add("stage_state", jsonbParam(patch.stageState));
  if (patch.materialIntakeArtifactId !== undefined) {
    add("material_intake_artifact_id", patch.materialIntakeArtifactId);
  }
  if (patch.productBriefArtifactId !== undefined) {
    add("product_brief_artifact_id", patch.productBriefArtifactId);
  }
  if (patch.storyboardArtifactId !== undefined) {
    add("storyboard_artifact_id", patch.storyboardArtifactId);
  }
  if (patch.shotPromptArtifactId !== undefined) {
    add("shot_prompt_artifact_id", patch.shotPromptArtifactId);
  }
  if (patch.shotSetId !== undefined) add("shot_set_id", patch.shotSetId);
  if (patch.finalVideoJobId !== undefined) add("final_video_job_id", patch.finalVideoJobId);
  if (patch.errorCode !== undefined) add("error_code", patch.errorCode);
  if (patch.errorMessage !== undefined) add("error_message", patch.errorMessage);
  if (patch.startedAt !== undefined) add("started_at", patch.startedAt);
  if (patch.completedAt !== undefined) add("completed_at", patch.completedAt);

  const result = await db.db2.pool().query(
    `update one_click_final_video_jobs
     set ${updates.join(", ")}
     where id = $1
     returning *`,
    values,
  );
  return toJobView(result.rows[0]);
}

async function recordStage(job: OneClickFinalVideoJobView, name: string, metadata: Record<string, unknown> = {}) {
  await traceService.record({
    workspaceId: job.workspaceId,
    traceType: "state_transition",
    name,
    metadata: { oneClickJobId: job.id, ...metadata },
  });
}

async function enqueueAdvance(input: {
  job: OneClickFinalVideoJobView;
  generationJobId: string;
  traceId: string;
  delayMs?: number;
}) {
  const queueJobId = await enqueueGenerationV2(
    {
      kind: "advance_one_click_final_video",
      jobId: input.generationJobId,
      oneClickJobId: input.job.id,
      workspaceId: input.job.workspaceId,
      traceId: input.traceId,
    },
    { delayMs: input.delayMs ?? 0 },
  );
  if (queueJobId) {
    await jobRepository.update(input.generationJobId, { queueJobId });
  }
}

async function waitAndReenqueue(input: {
  job: OneClickFinalVideoJobView;
  generationJobId: string;
  traceId: string;
  stageState: StageState;
  delayMs?: number;
}) {
  await updateJob(input.job.id, {
    status: "WAITING",
    stageState: input.stageState,
  });
  await enqueueAdvance(input);
}

async function failJob(input: {
  job: OneClickFinalVideoJobView;
  generationJobId: string;
  code: string;
  message: string;
  stageState?: StageState;
}) {
  await updateJob(input.job.id, {
    status: "FAILED",
    errorCode: input.code,
    errorMessage: input.message,
    stageState: input.stageState ?? input.job.stageState,
    completedAt: new Date().toISOString(),
  });
  await jobRepository.update(input.generationJobId, {
    status: "FAILED",
    completedAt: new Date().toISOString(),
    errorMessage: `${input.code}: ${input.message}`,
  });
  await recordStage(input.job, "one_click_final_video_failed", {
    code: input.code,
    message: input.message,
    stage: input.job.currentStage,
  });
}

function firstSucceededImageCandidate(
  candidates: Awaited<ReturnType<typeof db.db2.listImageCandidatesByBatch>>,
) {
  return candidates
    .filter((candidate) => candidate.status === "SUCCEEDED" && candidate.imageUrl)
    .sort((a, b) => {
      const aIndex = Number((a.providerResponse as { candidateIndex?: unknown })?.candidateIndex ?? 0);
      const bIndex = Number((b.providerResponse as { candidateIndex?: unknown })?.candidateIndex ?? 0);
      return aIndex - bIndex || a.createdAt.localeCompare(b.createdAt);
    })[0] ?? null;
}

function firstSucceededVideoCandidate(
  candidates: Awaited<ReturnType<typeof db.db2.listVideoCandidatesByBatch>>,
) {
  return candidates
    .filter((candidate) => candidate.status === "SUCCEEDED" && candidate.videoUrl)
    .sort((a, b) => {
      const aIndex = Number((a.providerResponse as { candidateIndex?: unknown })?.candidateIndex ?? 0);
      const bIndex = Number((b.providerResponse as { candidateIndex?: unknown })?.candidateIndex ?? 0);
      return aIndex - bIndex || a.createdAt.localeCompare(b.createdAt);
    })[0] ?? null;
}

function shouldKeepWaitingForBatch(status: string) {
  return status === "PENDING" || status === "RUNNING";
}

export const oneClickFinalVideoService = {
  async create(input: {
    workspaceId: string;
    materialIntake: { data: MaterialIntakeArtifact };
    outputAspectRatio: AspectRatio;
    idempotencyKey: string;
  }) {
    const existing = await getJobByIdempotencyKey(input.idempotencyKey);
    if (existing) return { data: existing, deduped: true };

    await db.getWorkspace(input.workspaceId);
    const active = await getActiveJob(input.workspaceId);
    if (active) {
      throw new HttpError(
        409,
        "ONE_CLICK_FINAL_VIDEO_RUNNING",
        "A one-click final video task is already running for this workspace",
      );
    }

    const material = await materialIntakeV2Service.approve({
      workspaceId: input.workspaceId,
      data: input.materialIntake.data,
    });
    const stageState: StageState = {
      materialIntake: { artifactId: material.id },
    };
    const id = "ocv_" + nanoid(10);
    const result = await db.db2.pool().query(
      `insert into one_click_final_video_jobs
         (id, workspace_id, status, current_stage, stage_state,
          material_intake_artifact_id, auto_selection_strategy,
          output_aspect_ratio, idempotency_key, started_at)
       values ($1, $2, 'PENDING', 'product_brief', $3, $4,
               'first_success', $5, $6, now())
       returning *`,
      [
        id,
        input.workspaceId,
        jsonbParam(stageState),
        material.id,
        input.outputAspectRatio,
        input.idempotencyKey,
      ],
    );
    const job = toJobView(result.rows[0]);
    const generationJob = await jobRepository.insert({
      id: "job_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: null,
      jobType: "advance_one_click_final_video",
      status: "PENDING",
      queueName: GENERATION_V2_QUEUE_NAME,
      queueJobId: null,
      relatedBatchType: "one_click_final_video_job",
      relatedBatchId: job.id,
      payload: {
        oneClickJobId: job.id,
        workspaceId: input.workspaceId,
      },
      progress: 0,
      attemptCount: 0,
      maxAttempts: 1,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });
    await recordStage(job, "one_click_final_video_started", {
      materialIntakeArtifactId: material.id,
    });
    await enqueueAdvance({
      job,
      generationJobId: generationJob.id,
      traceId: nanoid(),
    });
    return { data: job };
  },

  async get(id: string) {
    return { data: await getJobById(id) };
  },

  async list(workspaceId: string) {
    const result = await db.db2.pool().query(
      `select *
       from one_click_final_video_jobs
       where workspace_id = $1
       order by created_at desc
       limit 20`,
      [workspaceId],
    );
    return { data: result.rows.map(toJobView) };
  },

  async activeSummary(workspaceId: string) {
    return await getActiveJob(workspaceId);
  },

  async advance(input: { oneClickJobId: string; generationJobId: string; traceId: string }) {
    let job = await getJobById(input.oneClickJobId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) return job;
    await jobRepository.update(input.generationJobId, {
      status: "RUNNING",
      startedAt: job.startedAt ?? new Date().toISOString(),
    });
    if (job.status !== "RUNNING") {
      job = await updateJob(job.id, { status: "RUNNING" });
    }

    try {
      for (let guard = 0; guard < 20; guard += 1) {
        const state = job.stageState;
        if (job.currentStage === "product_brief") {
          const proposed = await productBriefV2Service.propose({ workspaceId: job.workspaceId });
          const approved = await productBriefV2Service.approve({
            workspaceId: job.workspaceId,
            artifactId: proposed.id,
          });
          job = await updateJob(job.id, {
            currentStage: "storyboard",
            productBriefArtifactId: approved.id,
            stageState: { ...state, productBrief: { artifactId: approved.id } },
          });
          await recordStage(job, "one_click_product_brief_approved", {
            artifactId: approved.id,
          });
          continue;
        }

        if (job.currentStage === "storyboard") {
          const proposed = await storyboardV2Service.propose({ workspaceId: job.workspaceId });
          const approved = await storyboardV2Service.approve({
            workspaceId: job.workspaceId,
            artifactId: proposed.id,
          });
          job = await updateJob(job.id, {
            currentStage: "shotprompt",
            storyboardArtifactId: approved.id,
            stageState: { ...state, storyboard: { artifactId: approved.id } },
          });
          await recordStage(job, "one_click_storyboard_approved", {
            artifactId: approved.id,
          });
          continue;
        }

        if (job.currentStage === "shotprompt") {
          const proposed = await shotPromptV2Service.propose({
            workspaceId: job.workspaceId,
            aspectRatio: job.outputAspectRatio,
          });
          const approved = await shotPromptV2Service.approve({
            workspaceId: job.workspaceId,
            artifactId: proposed.id,
          });
          job = await updateJob(job.id, {
            currentStage: "shot_set",
            shotPromptArtifactId: approved.id,
            stageState: { ...state, shotPrompt: { artifactId: approved.id } },
          });
          await recordStage(job, "one_click_shotprompt_approved", {
            artifactId: approved.id,
          });
          continue;
        }

        if (job.currentStage === "shot_set") {
          const shotSet = await shotSetService.apply({
            workspaceId: job.workspaceId,
            shotPromptArtifactId: job.shotPromptArtifactId ?? undefined,
          });
          job = await updateJob(job.id, {
            currentStage: "image_selection",
            shotSetId: shotSet.id,
            stageState: { ...state, shotSet: { id: shotSet.id }, image: { currentIndex: 0 } },
          });
          await recordStage(job, "one_click_shot_set_applied", { shotSetId: shotSet.id });
          continue;
        }

        if (job.currentStage === "image_selection") {
          const shots = (await shotSetService.listActiveShots(job.workspaceId)).sort(
            (a, b) => a.orderIndex - b.orderIndex,
          );
          const imageState = {
            currentIndex: 0,
            batchIdsByShotId: {},
            selectedCandidateIdsByShotId: {},
            ...(state.image ?? {}),
          };
          const currentIndex = imageState.currentIndex ?? 0;
          if (currentIndex >= shots.length) {
            job = await updateJob(job.id, {
              currentStage: "video_selection",
              stageState: { ...state, image: imageState, video: { batchIdsByShotId: {} } },
            });
            continue;
          }
          const shot = shots[currentIndex]!;
          if (shot.selectedImageId) {
            imageState.selectedCandidateIdsByShotId = {
              ...imageState.selectedCandidateIdsByShotId,
              [shot.id]: shot.selectedImageId,
            };
            imageState.currentIndex = currentIndex + 1;
            job = await updateJob(job.id, {
              stageState: { ...state, image: imageState },
            });
            continue;
          }
          let batchId = imageState.batchIdsByShotId?.[shot.id] ?? null;
          if (!batchId) {
            const proposed = await shotWorkflowService.proposeImagePrompt({
              workspaceId: job.workspaceId,
              shotId: shot.id,
              candidateCount: ONE_CLICK_AUTO_SELECTION_CANDIDATE_COUNT,
            });
            batchId = proposed.batch.id;
            imageState.batchIdsByShotId = {
              ...imageState.batchIdsByShotId,
              [shot.id]: batchId,
            };
            await waitAndReenqueue({
              job,
              generationJobId: input.generationJobId,
              traceId: input.traceId,
              stageState: { ...state, image: imageState },
              delayMs: 3000,
            });
            return await getJobById(job.id);
          }
          const batch = await db.db2.getImageBatch(batchId);
          const candidates = await db.db2.listImageCandidatesByBatch(batchId);
          const candidate = firstSucceededImageCandidate(candidates);
          if (candidate && (batch.status === "SUCCEEDED" || batch.status === "PARTIAL")) {
            await shotWorkflowService.selectImage({
              workspaceId: job.workspaceId,
              shotId: shot.id,
              imageCandidateId: candidate.id,
              imageGenerationBatchId: batch.id,
              selectedBy: "system:auto-one-click",
            });
            imageState.selectedCandidateIdsByShotId = {
              ...imageState.selectedCandidateIdsByShotId,
              [shot.id]: candidate.id,
            };
            imageState.currentIndex = currentIndex + 1;
            job = await updateJob(job.id, {
              stageState: { ...state, image: imageState },
            });
            await recordStage(job, "one_click_image_candidate_selected", {
              shotId: shot.id,
              candidateId: candidate.id,
            });
            continue;
          }
          if (batch.status === "FAILED" || batch.status === "PARTIAL") {
            await failJob({
              job,
              generationJobId: input.generationJobId,
              code: "NO_SUCCEEDED_IMAGE_CANDIDATE",
              message: `No succeeded image candidate for shot ${shot.id}`,
              stageState: { ...state, image: imageState },
            });
            return await getJobById(job.id);
          }
          if (shouldKeepWaitingForBatch(batch.status)) {
            await waitAndReenqueue({
              job,
              generationJobId: input.generationJobId,
              traceId: input.traceId,
              stageState: { ...state, image: imageState },
              delayMs: 3000,
            });
            return await getJobById(job.id);
          }
        }

        if (job.currentStage === "video_selection") {
          const shots = (await shotSetService.listActiveShots(job.workspaceId)).sort(
            (a, b) => a.orderIndex - b.orderIndex,
          );
          const videoState = {
            batchIdsByShotId: {},
            selectedCandidateIdsByShotId: {},
            ...(state.video ?? {}),
          };
          let changed = false;
          for (const shot of shots) {
            if (shot.selectedVideoId) {
              videoState.selectedCandidateIdsByShotId = {
                ...videoState.selectedCandidateIdsByShotId,
                [shot.id]: shot.selectedVideoId,
              };
              continue;
            }
            if (!videoState.batchIdsByShotId?.[shot.id]) {
              const proposed = await shotWorkflowService.proposeVideoScript({
                workspaceId: job.workspaceId,
                shotId: shot.id,
                candidateCount: ONE_CLICK_AUTO_SELECTION_CANDIDATE_COUNT,
              });
              videoState.batchIdsByShotId = {
                ...videoState.batchIdsByShotId,
                [shot.id]: proposed.batch.id,
              };
              changed = true;
            }
          }
          if (changed) {
            await waitAndReenqueue({
              job,
              generationJobId: input.generationJobId,
              traceId: input.traceId,
              stageState: { ...state, video: videoState },
              delayMs: 5000,
            });
            return await getJobById(job.id);
          }

          for (const shot of shots) {
            if (shot.selectedVideoId || videoState.selectedCandidateIdsByShotId?.[shot.id]) {
              continue;
            }
            const batchId = videoState.batchIdsByShotId?.[shot.id];
            if (!batchId) continue;
            const batch = await db.db2.getVideoBatch(batchId);
            const candidates = await db.db2.listVideoCandidatesByBatch(batchId);
            const candidate = firstSucceededVideoCandidate(candidates);
            if (candidate && (batch.status === "SUCCEEDED" || batch.status === "PARTIAL")) {
              await shotWorkflowService.selectVideo({
                workspaceId: job.workspaceId,
                shotId: shot.id,
                videoCandidateId: candidate.id,
                videoGenerationBatchId: batch.id,
                selectedBy: "system:auto-one-click",
              });
              videoState.selectedCandidateIdsByShotId = {
                ...videoState.selectedCandidateIdsByShotId,
                [shot.id]: candidate.id,
              };
              await recordStage(job, "one_click_video_candidate_selected", {
                shotId: shot.id,
                candidateId: candidate.id,
              });
              continue;
            }
            if (batch.status === "FAILED" || batch.status === "PARTIAL") {
              await failJob({
                job,
                generationJobId: input.generationJobId,
                code: "NO_SUCCEEDED_VIDEO_CANDIDATE",
                message: `No succeeded video candidate for shot ${shot.id}`,
                stageState: { ...state, video: videoState },
              });
              return await getJobById(job.id);
            }
          }

          const allSelected = shots.every(
            (shot) => shot.selectedVideoId || videoState.selectedCandidateIdsByShotId?.[shot.id],
          );
          if (!allSelected) {
            await waitAndReenqueue({
              job,
              generationJobId: input.generationJobId,
              traceId: input.traceId,
              stageState: { ...state, video: videoState },
              delayMs: 5000,
            });
            return await getJobById(job.id);
          }
          job = await updateJob(job.id, {
            currentStage: "final_compose",
            stageState: { ...state, video: videoState },
          });
          continue;
        }

        if (job.currentStage === "final_compose") {
          let finalVideoJobId = job.finalVideoJobId ?? job.stageState.finalVideo?.jobId;
          if (!finalVideoJobId || typeof finalVideoJobId !== "string") {
            const finalJob = await generationService.createFinalCompose({
              workspaceId: job.workspaceId,
              outputAspectRatio: job.outputAspectRatio,
              idempotencyKey: `one-click:${job.id}:final`,
            });
            finalVideoJobId =
              "finalVideoJobId" in finalJob.data
                ? finalJob.data.finalVideoJobId
                : finalJob.data.id;
            job = await updateJob(job.id, {
              finalVideoJobId,
              stageState: { ...state, finalVideo: { jobId: finalVideoJobId } },
            });
            await recordStage(job, "one_click_final_compose_started", {
              finalVideoJobId,
            });
            await waitAndReenqueue({
              job,
              generationJobId: input.generationJobId,
              traceId: input.traceId,
              stageState: { ...job.stageState, finalVideo: { jobId: finalVideoJobId } },
              delayMs: 5000,
            });
            return await getJobById(job.id);
          }
          const finalVideo = await db.db2.getFinalVideoJob(finalVideoJobId);
          if (finalVideo.status === "SUCCEEDED") {
            const completed = await updateJob(job.id, {
              status: "SUCCEEDED",
              currentStage: "completed",
              completedAt: new Date().toISOString(),
            });
            await jobRepository.update(input.generationJobId, {
              status: "SUCCEEDED",
              completedAt: new Date().toISOString(),
            });
            await recordStage(completed, "one_click_final_video_completed", {
              finalVideoJobId,
            });
            return completed;
          }
          if (finalVideo.status === "FAILED" || finalVideo.status === "CANCELLED") {
            await failJob({
              job,
              generationJobId: input.generationJobId,
              code: "FINAL_COMPOSE_FAILED",
              message: finalVideo.errorMessage ?? `Final compose ${finalVideo.status}`,
            });
            return await getJobById(job.id);
          }
          await waitAndReenqueue({
            job,
            generationJobId: input.generationJobId,
            traceId: input.traceId,
            stageState: state,
            delayMs: 5000,
          });
          return await getJobById(job.id);
        }
      }
      await waitAndReenqueue({
        job,
        generationJobId: input.generationJobId,
        traceId: input.traceId,
        stageState: job.stageState,
        delayMs: 1000,
      });
      return await getJobById(job.id);
    } catch (error) {
      const code = error instanceof HttpError ? error.code : "ONE_CLICK_FINAL_VIDEO_FAILED";
      const message = error instanceof Error ? error.message : String(error);
      await failJob({
        job,
        generationJobId: input.generationJobId,
        code,
        message,
      });
      return await getJobById(job.id);
    }
  },
};

export const oneClickFinalVideoTestHooks = {
  firstSucceededImageCandidate,
  firstSucceededVideoCandidate,
  oneClickAutoSelectionCandidateCount: ONE_CLICK_AUTO_SELECTION_CANDIDATE_COUNT,
  shouldKeepWaitingForBatch,
};
