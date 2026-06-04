import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isRealProviderMode, redactTraceValue } from "@aigc-video/ai";
import { logger } from "../../common/logger.js";
import { resolveWorkspaceStorageLocalPath } from "../workspace/workspace.service.js";

export const providerCallTraceRelativePath = path.join(
  ".daireel",
  "trace",
  "provider_call.jsonl",
);

export type ProviderCallMediaType = "image" | "video";
export type ProviderCallStatus = "succeeded" | "failed";

export interface ProviderCallTraceContext {
  workspaceId: string;
  shotId: string;
  jobId: string;
  attempt: number;
  maxAttempts: number;
  candidateIndex?: number | null;
}

export interface ProviderCallTraceInput extends ProviderCallTraceContext {
  batchId: string;
  candidateId?: string | null;
  mediaType: ProviderCallMediaType;
  provider: string;
  model?: string | null;
  status: ProviderCallStatus;
  prompt: string;
  requestedCount: number;
  generatedCount: number;
  latencyMs?: number | null;
  error?: string;
  negativePrompt?: string | null;
  aspectRatio?: "9:16" | "16:9" | "1:1" | null;
  referenceImageCount?: number | null;
  referenceImageSources?: string[] | null;
  durationSec?: number | null;
  generateAudio?: boolean | null;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  stableUrl?: string | null;
  providerTemporaryUrl?: string | null;
  providerTaskId?: string | null;
}

export interface ProviderCallTraceEvent extends ProviderCallTraceInput {
  schemaVersion: "provider_call.v1";
  at: string;
  promptHash: string;
}

type RecorderOverride = (input: ProviderCallTraceInput) => Promise<void>;

let recorderOverride: RecorderOverride | undefined;

export function __setProviderCallTraceRecorderForTests(
  recorder: RecorderOverride | undefined,
) {
  recorderOverride = recorder;
}

export function shouldRecordProviderCallTrace(
  env: NodeJS.ProcessEnv = process.env,
) {
  return isRealProviderMode(env);
}

function hashPrompt(prompt: string) {
  return createHash("sha256").update(prompt).digest("hex");
}

export function buildProviderCallTraceEvent(
  input: ProviderCallTraceInput,
  clock: () => Date = () => new Date(),
): ProviderCallTraceEvent {
  return {
    schemaVersion: "provider_call.v1",
    at: clock().toISOString(),
    ...input,
    candidateId: input.candidateId ?? null,
    candidateIndex: input.candidateIndex ?? null,
    model: input.model ?? null,
    latencyMs: input.latencyMs ?? null,
    promptHash: hashPrompt(input.prompt),
    generatedCount: input.status === "failed" ? 0 : input.generatedCount,
  };
}

export async function appendProviderCallTraceFile(input: {
  workspaceLocalPath: string;
  event: ProviderCallTraceInput;
  clock?: () => Date;
}) {
  const tracePath = path.join(
    input.workspaceLocalPath,
    providerCallTraceRelativePath,
  );
  await mkdir(path.dirname(tracePath), { recursive: true });
  const event = buildProviderCallTraceEvent(input.event, input.clock);
  await appendFile(
    tracePath,
    `${JSON.stringify(redactTraceValue(event))}\n`,
    "utf8",
  );
}

export async function recordProviderCallTrace(input: ProviderCallTraceInput) {
  if (!shouldRecordProviderCallTrace()) return;

  try {
    if (recorderOverride) {
      await recorderOverride(input);
      return;
    }

    const workspaceLocalPath = await resolveWorkspaceStorageLocalPath(
      input.workspaceId,
    );
    await appendProviderCallTraceFile({
      workspaceLocalPath,
      event: input,
    });
  } catch (error) {
    logger.warn("Failed to write provider call trace", {
      workspaceId: input.workspaceId,
      shotId: input.shotId,
      jobId: input.jobId,
      mediaType: input.mediaType,
      error: String((error as Error).message ?? error),
    });
  }
}
