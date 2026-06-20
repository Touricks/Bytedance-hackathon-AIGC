import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { TraceEventInput, TracePipeline, TraceStatus } from "@aigc-video/ai";
import { redactTraceValue } from "@aigc-video/ai";
import type { CreativeWorkspace } from "@aigc-video/shared";
import { config } from "../../common/config.js";
import { logger } from "../../common/logger.js";
import { db, type TraceEventRow } from "../../db/client.js";
import { getWorkspaceStorageAdapter } from "../workspace/storage/workspace-storage-resolver.js";

export interface RecordTraceInput {
  workspaceId: string;
  shotId?: string;
  traceType: "agent_run" | "provider_call" | "job_event" | "state_transition" | "user_action";
  name: string;
  inputPreview?: string;
  outputPreview?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceAppendLogger {
  append(event: TraceEventInput): Promise<void>;
}

export type TraceArchiveGroup = "events" | "provider-calls";

interface RecordTraceOptions {
  archiveGroup?: TraceArchiveGroup;
  localMirrorRelativePath?: string;
  fileEvent?: unknown;
}

const workspaceTraceRelativePath = path.join(".daireel", "trace", "events.jsonl");

function traceId() {
  return `trc_${Math.random().toString(36).slice(2, 12)}`;
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

function archiveTimestamp(input: string) {
  return input.replace(/[:.]/g, "-");
}

function localMirrorPath(workspaceLocalPath: string, relativePath: string) {
  return path.join(workspaceLocalPath, relativePath);
}

function createFileTraceEvent(input: {
  workspace: CreativeWorkspace;
  trace: RecordTraceInput;
  event?: TraceEventInput;
}) {
  if (input.event) {
    return {
      at: new Date().toISOString(),
      ...input.event,
      workspaceId: input.workspace.id,
      scriptId: input.workspace.currentScriptId,
    };
  }
  return {
    at: new Date().toISOString(),
    workspaceId: input.workspace.id,
    scriptId: input.workspace.currentScriptId,
    kind: input.trace.name,
    pipeline: tracePipelineFor(input.trace),
    status: traceStatusFor(input.trace),
    shotId: input.trace.shotId,
    meta: {
      traceType: input.trace.traceType,
      ...(input.trace.inputPreview
        ? { inputPreview: input.trace.inputPreview }
        : {}),
      ...(input.trace.outputPreview
        ? { outputPreview: input.trace.outputPreview }
        : {}),
      ...(input.trace.metadata ?? {}),
    },
  };
}

async function mirrorLocalTrace(input: {
  workspace: CreativeWorkspace;
  trace: RecordTraceInput;
  relativePath: string;
  fileEvent?: unknown;
}) {
  const binding = await db.getActiveWorkspaceStorage(input.workspace.id);
  if (binding?.kind !== "LOCAL" || !binding.localPath) return;
  const tracePath = localMirrorPath(binding.localPath, input.relativePath);
  await mkdir(path.dirname(tracePath), { recursive: true });
  const event =
    input.fileEvent ??
    createFileTraceEvent({
      workspace: input.workspace,
      trace: input.trace,
    });
  await appendFile(tracePath, `${JSON.stringify(redactTraceValue(event))}\n`, "utf8");
}

async function archiveS3Trace(input: {
  workspaceId: string;
  row: TraceEventRow;
  group: TraceArchiveGroup;
  payload: unknown;
}) {
  if (!config.traceS3ArchiveEnabled) return;
  const adapter = await getWorkspaceStorageAdapter(input.workspaceId);
  if (adapter.kind !== "S3") return;
  const createdAt = archiveTimestamp(input.row.createdAt);
  await adapter.putObject({
    relativePath: `trace/${input.group}/${createdAt}-${input.row.id}.json`,
    body: `${JSON.stringify(redactTraceValue(input.payload), null, 2)}\n`,
    contentType: "application/json",
  });
}

export async function recordTraceEvent(
  input: RecordTraceInput,
  options: RecordTraceOptions = {},
) {
  const row = await db.db2.insertTraceEvent({
    id: traceId(),
    workspaceId: input.workspaceId,
    shotId: input.shotId ?? null,
    traceType: input.traceType,
    name: input.name,
    inputPreview: input.inputPreview ?? null,
    outputPreview: input.outputPreview ?? null,
    metadata: redactTraceValue(input.metadata ?? {}),
  });
  const workspace = await db.getWorkspace(input.workspaceId);
  const archiveGroup = options.archiveGroup ?? "events";
  const localMirrorRelativePath =
    options.localMirrorRelativePath ?? workspaceTraceRelativePath;
  const fileEvent =
    options.fileEvent ??
    createFileTraceEvent({
      workspace,
      trace: input,
    });

  logger.info("trace event recorded", {
    workspaceId: input.workspaceId,
    shotId: input.shotId ?? null,
    traceType: input.traceType,
    name: input.name,
    traceEventId: row.id,
  });

  try {
    await mirrorLocalTrace({
      workspace,
      trace: input,
      relativePath: localMirrorRelativePath,
      fileEvent,
    });
  } catch (error) {
    logger.warn("trace local mirror failed", {
      workspaceId: input.workspaceId,
      traceEventId: row.id,
      err: error,
    });
  }

  try {
    await archiveS3Trace({
      workspaceId: input.workspaceId,
      row,
      group: archiveGroup,
      payload: fileEvent,
    });
  } catch (error) {
    logger.warn("trace s3 archive failed", {
      workspaceId: input.workspaceId,
      traceEventId: row.id,
      archiveGroup,
      err: error,
    });
  }

  return row;
}

export function createWorkspaceTraceAppendLogger(
  workspace: CreativeWorkspace,
): TraceAppendLogger {
  return {
    async append(event) {
      await recordTraceEvent(
        {
          workspaceId: workspace.id,
          shotId: event.shotId,
          traceType: "agent_run",
          name: event.kind,
          metadata: {
            pipeline: event.pipeline,
            status: event.status,
            provider: event.provider,
            model: event.model,
            contractId: event.contractId,
            contractVersion: event.contractVersion,
            latencyMs: event.latencyMs,
            ...(event.meta ?? {}),
          },
        },
        {
          fileEvent: {
            at: new Date().toISOString(),
            ...event,
            workspaceId: workspace.id,
            scriptId: workspace.currentScriptId,
          },
        },
      );
    },
  };
}

export { workspaceTraceRelativePath };
