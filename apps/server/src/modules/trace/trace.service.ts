import { traceRepository } from "./trace.repository.js";
import {
  createWorkspaceTraceLogger,
  resolveWorkspaceStorageLocalPath,
} from "../workspace/workspace.service.js";
import { db } from "../../db/client.js";
import type { TracePipeline, TraceStatus } from "@aigc-video/ai";

export interface RecordTraceInput {
  workspaceId: string;
  shotId?: string;
  traceType: "agent_run" | "provider_call" | "job_event" | "state_transition" | "user_action";
  name: string;
  inputPreview?: string;
  outputPreview?: string;
  metadata?: Record<string, unknown>;
}

function tracePipelineFor(input: RecordTraceInput): TracePipeline {
  if (/^image_|image/.test(input.name)) {
    return "shot_image";
  }
  if (/^video_|video/.test(input.name)) {
    return "shot_video";
  }
  if (/^final_compose/.test(input.name)) {
    return "final_compose";
  }
  return input.shotId ? "shot_image" : "one_click_video";
}

function traceStatusFor(input: RecordTraceInput): TraceStatus {
  return /failed|error|cancelled/i.test(input.name) ? "error" : "ok";
}

async function mirrorWorkspaceFileTrace(input: RecordTraceInput) {
  const workspace = await db.getWorkspace(input.workspaceId);
  const localPath = await resolveWorkspaceStorageLocalPath(input.workspaceId);
  const logger = createWorkspaceTraceLogger(localPath, workspace);
  await logger.append({
    kind: input.name,
    pipeline: tracePipelineFor(input),
    status: traceStatusFor(input),
    workspaceId: input.workspaceId,
    shotId: input.shotId,
    meta: {
      traceType: input.traceType,
      ...(input.inputPreview ? { inputPreview: input.inputPreview } : {}),
      ...(input.outputPreview ? { outputPreview: input.outputPreview } : {}),
      ...(input.metadata ?? {}),
    },
  });
}

export const traceService = {
  async record(input: RecordTraceInput) {
    await traceRepository.insert({
      id: "trc_" + Math.random().toString(36).slice(2, 12),
      workspaceId: input.workspaceId,
      shotId: input.shotId ?? null,
      traceType: input.traceType,
      name: input.name,
      inputPreview: input.inputPreview ?? null,
      outputPreview: input.outputPreview ?? null,
      metadata: input.metadata ?? {},
    });
    try {
      await mirrorWorkspaceFileTrace(input);
    } catch {
      // DB trace is the queryable source of truth. File trace mirroring is a
      // local-debug aid and should not fail provider or worker progress.
    }
  },
  list: traceRepository.listByWorkspace,
  listShot: traceRepository.listByShot,
};
