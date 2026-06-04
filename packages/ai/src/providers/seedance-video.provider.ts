import { resolveArkVideoProviderConfig, type ProviderEnv } from "./provider-config.js";
import { runWithVideoSlot } from "../concurrency/video-semaphore.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export interface SeedanceVideoRequest {
  imageUrl: string;
  lastFrameUrl?: string | null;
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
  taskId?: string;
  createdAt?: number;
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
  /** Max retries for rate-limit (429) / transient (408/5xx/network) responses. */
  maxRetries?: number;
  /** Base backoff in ms; doubles each attempt and adds jitter. */
  retryBaseMs?: number;
  /** Injectable sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source for deterministic tests. */
  random?: () => number;
}

interface ArkRetryConfig {
  maxRetries: number;
  baseMs: number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

function numFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveRetryConfig(options: SeedanceProviderOptions): ArkRetryConfig {
  const env = options.env ?? process.env;
  return {
    maxRetries: options.maxRetries ?? numFromEnv(env.ARK_MAX_RETRIES, 4),
    baseMs: options.retryBaseMs ?? numFromEnv(env.ARK_RETRY_BASE_MS, 1000),
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    random: options.random ?? Math.random
  };
}

// Ark meters the shared text+video account by RPM and a concurrent-task budget.
// 429 (rate limit), 408 (timeout) and 5xx are transient by default, but the
// Seedance task-create endpoint overrides create-time 429 to fail immediately
// so BullMQ can reschedule the job without holding a video provider slot.
// Other 4xx (e.g. 400 invalid request) are not retried so genuine contract
// errors still surface immediately.
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

function retryDelayMs(
  response: Response | null,
  attempt: number,
  retry: ArkRetryConfig
): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }
  const expo = retry.baseMs * 2 ** attempt;
  return expo + Math.floor(expo * 0.25 * retry.random());
}

async function fetchWithArkRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  retry: ArkRetryConfig,
  traceLogger: Pick<FileTraceLogger, "append"> | undefined,
  meta: {
    jobId?: string;
    model: string;
    isRetryableStatus?: (status: number) => boolean;
  }
): Promise<Response> {
  let lastError: unknown;
  const shouldRetryStatus = meta.isRetryableStatus ?? isRetryableStatus;
  for (let attempt = 0; attempt <= retry.maxRetries; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetchImpl(url, init);
    } catch (err) {
      lastError = err;
      if (attempt >= retry.maxRetries) {
        throw err;
      }
    }
    if (response && (response.ok || !shouldRetryStatus(response.status))) {
      return response;
    }
    if (attempt >= retry.maxRetries) {
      // Exhausted: hand the last retryable response back so the caller builds
      // its sanitized failure message (or rethrow the last network error).
      if (response) {
        return response;
      }
      throw lastError ?? new Error("Seedance request failed after retries");
    }
    await traceLogger?.append({
      kind: "video.retry",
      pipeline: "one_click_video",
      status: "ok",
      jobId: meta.jobId,
      provider: "seedance",
      model: meta.model,
      meta: {
        attempt: attempt + 1,
        maxRetries: retry.maxRetries,
        httpStatus: response?.status ?? null
      }
    });
    await retry.sleep(retryDelayMs(response, attempt, retry));
  }
  throw lastError ?? new Error("Seedance request failed after retries");
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
      retry: ArkRetryConfig;
    }
) {
  const pollIntervalMs = options.pollIntervalMs ?? 10000;
  const maxPollAttempts = options.maxPollAttempts ?? 20;
  const taskUrl = joinArkPath(options.baseURL, `contents/generations/tasks/${taskId}`);

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const response = await fetchWithArkRetry(
      options.fetch,
      taskUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${options.apiKey}`
        }
      },
      options.retry,
      options.traceLogger,
      { jobId: options.jobId, model: options.model }
    );

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
    if (status && ["failed", "fail", "error", "cancelled", "canceled"].includes(status)) {
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
    throw new Error(
      "Seedance video export requires Ark video config: ARK_API_KEY, ARK_BASE_URL, and ARK_VIDEO_ENDPOINT_ID"
    );
  }

  const fetchImpl = options.fetch ?? fetch;
  const retry = resolveRetryConfig(options);

  // Hold one of the VIDEO_PROVIDER_CONCURRENCY slots across the whole
  // create+poll lifecycle. Acquired AFTER fast-fail validation/config above, so
  // misconfigured calls never consume a permit.
  return runWithVideoSlot(async () => {
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
        lastFrameUrl: request.lastFrameUrl ?? null,
        duration,
        ratio,
        generateAudio
      }
    });
    const content = [
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
      },
      ...(request.lastFrameUrl
        ? [
            {
              type: "image_url",
              image_url: {
                url: request.lastFrameUrl
              },
              role: "last_frame"
            }
          ]
        : [])
    ];
    const response = await fetchWithArkRetry(
      fetchImpl,
      joinArkPath(config.baseURL, "contents/generations/tasks"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          content,
          duration,
          ratio,
          generate_audio: generateAudio
        })
      },
      retry,
      options.traceLogger,
      {
        jobId: options.jobId,
        model: config.model,
        isRetryableStatus: (status) =>
          status !== 429 && isRetryableStatus(status)
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
          contractVersion: options.contractVersion,
          retry
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
      provider: "seedance" as const,
      model: config.model,
      prompt: request.prompt,
      ...(taskId ? { taskId } : {}),
      createdAt: Math.floor(Date.now() / 1000)
    };
  });
}
