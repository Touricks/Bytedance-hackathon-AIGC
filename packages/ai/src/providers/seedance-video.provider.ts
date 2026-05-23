import {
  isRealProviderMode,
  resolveArkVideoProviderConfig,
  type ProviderEnv
} from "./provider-config.js";

export interface SeedanceVideoRequest {
  imageUrl: string;
  prompt: string;
}

export interface SeedanceVideoResult {
  videoUrl: string;
  provider: "mock" | "seedance";
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
    Pick<SeedanceProviderOptions, "pollIntervalMs" | "maxPollAttempts"> & {
      apiKey: string;
      baseURL: string;
    }
) {
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const maxPollAttempts = options.maxPollAttempts ?? 100;
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
      prompt: request.prompt
    };
  }

  const fetchImpl = options.fetch ?? fetch;
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
        duration: 12,
        ratio: "9:16"
      })
    }
  );

  if (!response.ok) {
    throw new Error(await buildFailureMessage("Seedance request failed", response));
  }

  const payload = await readJsonResponse(response);
  const videoUrl =
    extractVideoUrl(payload) ??
    (await (async () => {
      const taskId = extractTaskId(payload);
      if (!taskId) {
        return null;
      }
      return pollVideoTask(taskId, {
        fetch: fetchImpl,
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        pollIntervalMs: options.pollIntervalMs,
        maxPollAttempts: options.maxPollAttempts
      });
    })());
  if (!videoUrl) {
    throw new Error("Seedance response did not include a video URL");
  }

  return {
    videoUrl,
    provider: "seedance",
    prompt: request.prompt
  };
}
