import { traceRepository } from "./trace.repository.js";

export interface RecordTraceInput {
  workspaceId: string;
  shotId?: string;
  traceType: "agent_run" | "provider_call" | "job_event" | "state_transition" | "user_action";
  name: string;
  inputPreview?: string;
  outputPreview?: string;
  metadata?: Record<string, unknown>;
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
  },
  list: traceRepository.listByWorkspace,
  listShot: traceRepository.listByShot,
};
