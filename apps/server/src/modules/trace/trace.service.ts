import { traceRepository } from "./trace.repository.js";
import {
  createWorkspaceTraceAppendLogger,
  recordTraceEvent,
  type RecordTraceInput,
} from "./trace-sink.js";

export const traceService = {
  async record(input: RecordTraceInput) {
    await recordTraceEvent(input);
  },
  list: traceRepository.listByWorkspace,
  listShot: traceRepository.listByShot,
  createWorkspaceTraceAppendLogger,
};

export { createWorkspaceTraceAppendLogger };
export type { RecordTraceInput };
