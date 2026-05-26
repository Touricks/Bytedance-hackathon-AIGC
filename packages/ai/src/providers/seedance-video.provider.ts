import {
  isRealProviderMode,
  resolveArkVideoProviderConfig,
  type ProviderEnv
} from "./provider-config.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export interface SeedanceVideoRequest {
  imageUrl: string;
  prompt: string;
  durationSec?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  generateAudio?: boolean;
}

export interface SeedanceVideoResult {
  videoUrl: string;
  provider: "mock" | "seedance";
  model: string;
  prompt: string;
}

interface SeedanceProviderOptions {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
  env?: ProviderEnv;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  traceLogger?: Pick<FileTraceLogger, "append">;
  jobId?: string;
  contractId?: string;
  contractVersion?: string;
}

function extractVideoUrl(payload: unknown): string | null {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const videoUrl = extractVideoUrl(item);
      if (videoUrl) {
        return videoUrl;
      }
    }
    return null;
  }

  if (typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.videoUrl === "string") {
    return record.videoUrl;
  }
  if (typeof record.video_url === "string") {
    return record.video_url;
  }
  if (record.data && typeof record.data === "object") {
    return extractVideoUrl(record.data);
  }
  if (record.result && typeof record.result === "object") {
    return extractVideoUrl(record.result);
  }
  if (record.output && typeof record.output === "object") {
    return extractVideoUrl(record.output);
  }
  if (record.content && typeof record.content === "object") {
    return extractVideoUrl(record.content);
  }
  if (record.results && typeof record.results === "object") {
    return extractVideoUrl(record.results);
  }
  if (record.items && typeof record.items === "object") {
    return extractVideoUrl(record.items);
  }

  return null;
}

function extractTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["id", "task_id", "taskId"]) {
    if (typeof record[key] === "string") {
      return record[key];
    }
  }

  for (const key of ["data", "result", "output"]) {
    if (record[key] && typeof record[key] === "object") {
      const taskId = extractTaskId(record[key]);
      if (taskId) {
        return taskId;
      }
    }
  }

  return null;
}

function extractTaskStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["status", "task_status", "taskStatus"]) {
    if (typeof record[key] === "string") {
      return record[key].toLowerCase();
    }
  }

  for (const key of ["data", "result", "output"]) {
    if (record[key] && typeof record[key] === "object") {
      const status = extractTaskStatus(record[key]);
      if (status) {
        return status;
      }
    }
  }

  return null;
}

function joinArkPath(baseURL: string, path: string) {
  return `${baseURL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sanitizeProviderMessage(text: string) {
  return text
    .replace(
      /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi,
      "data:image/<redacted>;base64,<redacted>"
    )
    .replace(/Bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer <redacted>");
}

function validatedDurationSec(durationSec = 12) {
  if (!Number.isInteger(durationSec)) {
    throw new Error("Seedance durationSec must be an integer between 4 and 12 seconds");
  }
  if (durationSec < 4 || durationSec > 12) {
    throw new Error("Seedance durationSec must be between 4 and 12 seconds");
  }
  return durationSec;
}

function findStringValue(payload: unknown, keys: string[]): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  for (const value of Object.values(record)) {
    const nested = findStringValue(value, keys);
    if (nested) {
      return nested;
    }
  }

  return null;
}

async function buildFailureMessage(prefix: string, response: Response) {
  const text = await response.text();
  const payload = text ? tryParseJson(text) : null;
  const code = findStringValue(payload, ["code", "Code"]);
  const message = findStringValue(payload, ["message", "Message", "msg", "Msg"]);
  const requestId = findStringValue(payload, [
    "request_id",
    "requestId",
    "RequestId",
    "x_request_id"
  ]);
  const details = [
    code,
    message ? sanitizeProviderMessage(message) : null,
    requestId ? `request_id=${requestId}` : null
  ].filter(Boolean);

  if (details.length > 0) {
    return `${prefix} with status ${response.status}: ${details.join(" | ")}`;
  }

  const preview = sanitizeProviderMessage(text).slice(0, 240);
  return preview
    ? `${prefix} with status ${response.status}: ${preview}`
    : `${prefix} with status ${response.status}`;
}

async function pollVideoTask(
  taskId: string,
  options: Required<Pick<SeedanceProviderOptions, "fetch">> &
    Pick<
      SeedanceProviderOptions,
      | "pollIntervalMs"
      | "maxPollAttempts"
      | "traceLogger"
      | "jobId"
      | "contractId"
      | "contractVersion"
    > & {
      apiKey: string;
      baseURL: string;
      provider: string;
      model: string;
    }
) {
  const pollIntervalMs = options.pollIntervalMs ?? 10000;
  const maxPollAttempts = options.maxPollAttempts ?? 20;
  const taskUrl = joinArkPath(
    options.baseURL,
    `contents/generations/tasks/${taskId}`
  );

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const response = await options.fetch(taskUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${options.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(await buildFailureMessage("Seedance task query failed", response));
    }

    const payload = await readJsonResponse(response);
    const videoUrl = extractVideoUrl(payload);
    await options.traceLogger?.append({
      kind: "video.task_polled",
      pipeline: "one_click_video",
      status: "ok",
      jobId: options.jobId,
      provider: options.provider,
      model: options.model,
      ...(options.contractId ? { contractId: options.contractId } : {}),
      ...(options.contractVersion ? { contractVersion: options.contractVersion } : {}),
      meta: {
        taskId,
        status: extractTaskStatus(payload),
        hasVideoUrl: Boolean(videoUrl)
      }
    });
    if (videoUrl) {
      return videoUrl;
    }

    const status = extractTaskStatus(payload);
    if (
      status &&
      ["failed", "fail", "error", "cancelled", "canceled"].includes(status)
    ) {
      throw new Error(`Seedance task ${taskId} failed with status ${status}`);
    }

    if (attempt < maxPollAttempts - 1) {
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Seedance task ${taskId} did not complete in time`);
}

export async function generateVideoWithSeedance(
  request: SeedanceVideoRequest,
  options: SeedanceProviderOptions = {}
): Promise<SeedanceVideoResult> {
  const duration = validatedDurationSec(request.durationSec);
  const ratio = request.aspectRatio ?? "9:16";
  const generateAudio = request.generateAudio ?? true;
  const env = options.env ?? process.env;
  const config = resolveArkVideoProviderConfig(env, {
    apiKey: options.apiKey,
    model: options.model,
    baseURL: options.baseURL
  });

  if (!config) {
    if (isRealProviderMode(env)) {
      throw new Error(
        "real-provider mode requires Ark video config: ARK_API_KEY and ARK_VIDEO_ENDPOINT_ID"
      );
    }

    const videoUrl =
      process.env.MOCK_FINAL_VIDEO_URL ?? "/mocks/videos/fallback-flower.mp4";

    return {
      videoUrl,
      provider: "mock",
      model: "mock",
      prompt: request.prompt
    };
  }

  const fetchImpl = options.fetch ?? fetch;
  await options.traceLogger?.append({
    kind: "video.task_create_started",
    pipeline: "one_click_video",
    status: "ok",
    jobId: options.jobId,
    provider: "seedance",
    model: config.model,
    ...(options.contractId ? { contractId: options.contractId } : {}),
    ...(options.contractVersion ? { contractVersion: options.contractVersion } : {}),
    meta: {
      endpointFamily: "ark_video_task",
      baseURL: config.baseURL,
      prompt: request.prompt,
      imageUrl: request.imageUrl,
      duration,
      ratio,
      generateAudio
    }
  });
  const response = await fetchImpl(
    joinArkPath(config.baseURL, "contents/generations/tasks"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        content: [
          {
            type: "text",
            text: request.prompt
          },
          {
            type: "image_url",
            image_url: {
              url: request.imageUrl
            },
            role: "first_frame"
          }
        ],
        duration,
        ratio,
        generate_audio: generateAudio
      })
    }
  );

  if (!response.ok) {
    const message = await buildFailureMessage("Seedance request failed", response);
    await options.traceLogger?.append({
      kind: "video.failed",
      pipeline: "one_click_video",
      status: "error",
      jobId: options.jobId,
      provider: "seedance",
      model: config.model,
      ...(options.contractId ? { contractId: options.contractId } : {}),
      ...(options.contractVersion ? { contractVersion: options.contractVersion } : {}),
      meta: { error: message }
    });
    throw new Error(message);
  }

  const payload = await readJsonResponse(response);
  const taskId = extractTaskId(payload);
  await options.traceLogger?.append({
    kind: "video.task_created",
    pipeline: "one_click_video",
    status: "ok",
    jobId: options.jobId,
    provider: "seedance",
    model: config.model,
    ...(options.contractId ? { contractId: options.contractId } : {}),
    ...(options.contractVersion ? { contractVersion: options.contractVersion } : {}),
    meta: {
      taskId,
      hasImmediateVideoUrl: Boolean(extractVideoUrl(payload))
    }
  });
  const videoUrl =
    extractVideoUrl(payload) ??
    (await (async () => {
      if (!taskId) {
        return null;
      }
      return pollVideoTask(taskId, {
        fetch: fetchImpl,
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        pollIntervalMs: options.pollIntervalMs,
        maxPollAttempts: options.maxPollAttempts,
        traceLogger: options.traceLogger,
        jobId: options.jobId,
        provider: "seedance",
        model: config.model,
        contractId: options.contractId,
        contractVersion: options.contractVersion
      });
    })());
  if (!videoUrl) {
    throw new Error("Seedance response did not include a video URL");
  }
  await options.traceLogger?.append({
    kind: "video.completed",
    pipeline: "one_click_video",
    status: "ok",
    jobId: options.jobId,
    provider: "seedance",
    model: config.model,
    ...(options.contractId ? { contractId: options.contractId } : {}),
    ...(options.contractVersion ? { contractVersion: options.contractVersion } : {}),
    meta: {
      videoUrl
    }
  });

  return {
    videoUrl,
    provider: "seedance",
    model: config.model,
    prompt: request.prompt
  };
}
