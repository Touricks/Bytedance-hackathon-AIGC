import { nanoid } from "nanoid";
import { GENERATION_V2_QUEUE_NAME } from "@aigc-video/shared";
import { HttpError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { jobRepository } from "../job/job.repository.js";
import { enqueueGenerationV2 } from "../job/job.queue.js";
import { shotWorkflowService } from "../shot/shot.service.js";
import { shotSetService } from "../workspace/shot-set.service.js";
import { traceService } from "../trace/trace.service.js";

type AutoSelectionStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

type ImageStageState = {
  currentIndex?: number;
  batchIdsByShotId?: Record<string, string>;
  selectedCandidateIdsByShotId?: Record<string, string>;
};

type StageState = {
  image?: ImageStageState;
  [key: string]: unknown;
};

export interface ShotImageAutoSelectionJobView {
  id: string;
  workspaceId: string;
  status: AutoSelectionStatus;
  currentStage: string;
  stageState: StageState;
  shotSetId: string | null;
  candidateCount: number;
  autoSelectionStrategy: "first_success";
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

function toJobView(row: Record<string, unknown>): ShotImageAutoSelectionJobView {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    status: row.status as AutoSelectionStatus,
    currentStage: String(row.current_stage),
    stageState: toStageState(row.stage_state),
    shotSetId: typeof row.shot_set_id === "string" ? row.shot_set_id : null,
    candidateCount: Number(row.candidate_count),
    autoSelectionStrategy: "first_success",
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
    `select * from shot_image_auto_selection_jobs where id = $1 limit 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(
      404,
      "SHOT_IMAGE_AUTO_SELECTION_JOB_NOT_FOUND",
      "Shot image auto-selection job not found",
    );
  }
  return toJobView(row);
}

async function getJobByIdempotencyKey(key: string) {
  const result = await db.db2.pool().query(
    `select * from shot_image_auto_selection_jobs where idempotency_key = $1 limit 1`,
    [key],
  );
  const row = result.rows[0];
  return row ? toJobView(row) : null;
}

async function getActiveJob(workspaceId: string) {
  const result = await db.db2.pool().query(
    `select *
     from shot_image_auto_selection_jobs
     where workspace_id = $1 and status in ('PENDING', 'RUNNING', 'WAITING')
     order by created_at desc
     limit 1`,
    [workspaceId],
  );
  const row = result.rows[0];
  return row ? toJobView(row) : null;
}

async function updateJob(
  id: string,
  patch: Partial<
    Pick<
      ShotImageAutoSelectionJobView,
      | "status"
      | "currentStage"
      | "stageState"
      | "shotSetId"
      | "errorCode"
      | "errorMessage"
      | "startedAt"
      | "completedAt"
    >
  >,
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
  if (patch.shotSetId !== undefined) add("shot_set_id", patch.shotSetId);
  if (patch.errorCode !== undefined) add("error_code", patch.errorCode);
  if (patch.errorMessage !== undefined) add("error_message", patch.errorMessage);
  if (patch.startedAt !== undefined) add("started_at", patch.startedAt);
  if (patch.completedAt !== undefined) add("completed_at", patch.completedAt);

  const result = await db.db2.pool().query(
    `update shot_image_auto_selection_jobs
     set ${updates.join(", ")}
     where id = $1
     returning *`,
    values,
  );
  return toJobView(result.rows[0]);
}

async function recordStage(
  job: ShotImageAutoSelectionJobView,
  name: string,
  metadata: Record<string, unknown> = {},
) {
  await traceService.record({
    workspaceId: job.workspaceId,
    traceType: "state_transition",
    name,
    metadata: { shotImageAutoSelectionJobId: job.id, ...metadata },
  });
}

async function enqueueAdvance(input: {
  job: ShotImageAutoSelectionJobView;
  generationJobId: string;
  traceId: string;
  delayMs?: number;
}) {
  const queueJobId = await enqueueGenerationV2(
    {
      kind: "advance_shot_image_auto_selection",
      jobId: input.generationJobId,
      shotImageAutoSelectionJobId: input.job.id,
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
  job: ShotImageAutoSelectionJobView;
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
  job: ShotImageAutoSelectionJobView;
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
  await recordStage(input.job, "shot_image_auto_selection_failed", {
    code: input.code,
    message: input.message,
    stage: input.job.currentStage,
  });
}

function firstSucceededImageCandidate(
  candidates: Awaited<ReturnType<typeof db.db2.listImageCandidatesByBatch>>,
) {
  return (
    candidates
      .filter((candidate) => candidate.status === "SUCCEEDED" && candidate.imageUrl)
      .sort((a, b) => {
        const aIndex = Number(
          (a.providerResponse as { candidateIndex?: unknown })?.candidateIndex ?? 0,
        );
        const bIndex = Number(
          (b.providerResponse as { candidateIndex?: unknown })?.candidateIndex ?? 0,
        );
        return aIndex - bIndex || a.createdAt.localeCompare(b.createdAt);
      })[0] ?? null
  );
}

function shouldKeepWaitingForBatch(status: string) {
  return status === "PENDING" || status === "RUNNING";
}

export const shotImageAutoSelectionService = {
  async create(input: {
    workspaceId: string;
    candidateCount?: number;
    idempotencyKey: string;
  }) {
    const existing = await getJobByIdempotencyKey(input.idempotencyKey);
    if (existing) return { data: existing, deduped: true };

    await db.getWorkspace(input.workspaceId);
    const active = await getActiveJob(input.workspaceId);
    if (active) {
      throw new HttpError(
        409,
        "SHOT_IMAGE_AUTO_SELECTION_RUNNING",
        "A shot image auto-selection task is already running for this workspace",
      );
    }

    const candidateCount = shotWorkflowService.resolveBatchCount(
      "image",
      input.candidateCount,
    );
    const activeShotSet = await shotSetService.getActiveShotSet(input.workspaceId);
    if (!activeShotSet) {
      throw new HttpError(400, "NO_ACTIVE_SHOT_SET", "Active shot set is required");
    }

    const stageState: StageState = {
      image: {
        currentIndex: 0,
        batchIdsByShotId: {},
        selectedCandidateIdsByShotId: {},
      },
    };
    const id = "sias_" + nanoid(10);
    const result = await db.db2.pool().query(
      `insert into shot_image_auto_selection_jobs
         (id, workspace_id, status, current_stage, stage_state, shot_set_id,
          candidate_count, auto_selection_strategy, idempotency_key, started_at)
       values ($1, $2, 'PENDING', 'image_selection', $3, $4,
               $5, 'first_success', $6, now())
       returning *`,
      [
        id,
        input.workspaceId,
        jsonbParam(stageState),
        activeShotSet.id,
        candidateCount,
        input.idempotencyKey,
      ],
    );
    const job = toJobView(result.rows[0]);
    const generationJob = await jobRepository.insert({
      id: "job_" + nanoid(10),
      workspaceId: input.workspaceId,
      shotId: null,
      jobType: "advance_shot_image_auto_selection",
      status: "PENDING",
      queueName: GENERATION_V2_QUEUE_NAME,
      queueJobId: null,
      relatedBatchType: "shot_image_auto_selection_job",
      relatedBatchId: job.id,
      payload: {
        shotImageAutoSelectionJobId: job.id,
        workspaceId: input.workspaceId,
        candidateCount,
      },
      progress: 0,
      attemptCount: 0,
      maxAttempts: 1,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    });
    await recordStage(job, "shot_image_auto_selection_started", {
      shotSetId: activeShotSet.id,
      candidateCount,
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
       from shot_image_auto_selection_jobs
       where workspace_id = $1
       order by created_at desc
       limit 20`,
      [workspaceId],
    );
    return { data: result.rows.map(toJobView) };
  },

  async advance(input: {
    shotImageAutoSelectionJobId: string;
    generationJobId: string;
    traceId: string;
  }) {
    let job = await getJobById(input.shotImageAutoSelectionJobId);
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
        if (job.currentStage !== "image_selection") {
          await failJob({
            job,
            generationJobId: input.generationJobId,
            code: "UNKNOWN_SHOT_IMAGE_AUTO_SELECTION_STAGE",
            message: `Unknown stage ${job.currentStage}`,
          });
          return await getJobById(job.id);
        }

        const shots = (await shotSetService.listActiveShots(job.workspaceId)).sort(
          (a, b) => a.orderIndex - b.orderIndex,
        );
        if (shots.length === 0) {
          await failJob({
            job,
            generationJobId: input.generationJobId,
            code: "NO_ACTIVE_SHOTS",
            message: "Active shot set has no shots",
          });
          return await getJobById(job.id);
        }

        const imageState: ImageStageState = {
          currentIndex: 0,
          batchIdsByShotId: {},
          selectedCandidateIdsByShotId: {},
          ...(state.image ?? {}),
        };
        const currentIndex = imageState.currentIndex ?? 0;
        if (currentIndex >= shots.length) {
          const completed = await updateJob(job.id, {
            status: "SUCCEEDED",
            currentStage: "completed",
            stageState: { ...state, image: imageState },
            completedAt: new Date().toISOString(),
          });
          await jobRepository.update(input.generationJobId, {
            status: "SUCCEEDED",
            progress: 100,
            completedAt: new Date().toISOString(),
          });
          await recordStage(completed, "shot_image_auto_selection_completed", {
            selectedCandidateIdsByShotId: imageState.selectedCandidateIdsByShotId ?? {},
          });
          return completed;
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
            candidateCount: job.candidateCount,
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
            selectedBy: "system:auto-shot-image-selection",
          });
          imageState.selectedCandidateIdsByShotId = {
            ...imageState.selectedCandidateIdsByShotId,
            [shot.id]: candidate.id,
          };
          imageState.currentIndex = currentIndex + 1;
          job = await updateJob(job.id, {
            stageState: { ...state, image: imageState },
          });
          await recordStage(job, "shot_image_auto_selection_candidate_selected", {
            shotId: shot.id,
            candidateId: candidate.id,
          });
          continue;
        }

        if (batch.status === "FAILED" || batch.status === "PARTIAL" || batch.status === "SUCCEEDED") {
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
            delayMs: 5000,
          });
          return await getJobById(job.id);
        }

        await failJob({
          job,
          generationJobId: input.generationJobId,
          code: "UNSUPPORTED_IMAGE_BATCH_STATUS",
          message: `Unsupported image batch status ${batch.status}`,
          stageState: { ...state, image: imageState },
        });
        return await getJobById(job.id);
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
      const code =
        error instanceof HttpError ? error.code : "SHOT_IMAGE_AUTO_SELECTION_FAILED";
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

export const shotImageAutoSelectionTestHooks = {
  firstSucceededImageCandidate,
  shouldKeepWaitingForBatch,
};
