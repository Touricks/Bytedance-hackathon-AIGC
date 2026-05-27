import type { GenerationJob, JobStage, TraceEvent } from "@aigc-video/shared";

export function createTraceEvent(
  stage: JobStage,
  message: string,
  meta?: Record<string, unknown>
): TraceEvent {
  return {
    at: new Date().toISOString(),
    stage,
    message,
    meta
  };
}

export function appendTrace(
  job: GenerationJob,
  stage: JobStage,
  message: string,
  meta?: Record<string, unknown>
): GenerationJob {
  return {
    ...job,
    trace: [...job.trace, createTraceEvent(stage, message, meta)],
    updatedAt: new Date().toISOString()
  };
}
