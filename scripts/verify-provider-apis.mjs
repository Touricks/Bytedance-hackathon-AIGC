#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitDisabledRealModelTest } from "./real-model-test-policy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_VIDEO_POLL_INTERVAL_MS = 10000;
const DEFAULT_VIDEO_MAX_POLL_ATTEMPTS = 20;

function usage() {
  return [
    "Usage:",
    "  node scripts/verify-provider-apis.mjs",
    "  node scripts/verify-provider-apis.mjs --video-image-url <url>",
    "  node scripts/verify-provider-apis.mjs --json",
    "",
    "Disabled: multi-provider verification is closed.",
    "Use pnpm --filter @aigc-video/server test:integration:smoke for backend image/video smoke.",
    "The disabled entry does not load .env or call provider APIs.",
    "",
    "Retired environment variables:",
    "  Text:  TEXT_API_KEY/TEXT_BASE_URL/TEXT_ENDPOINT_ID",
    "         or AI_TEXT_* / ARK_API_KEY, ARK_BASE_URL, ARK_TEXT_ENDPOINT_ID",
    "  Image: IMAGE_API_KEY/IMAGE_BASE_URL/IMAGE_ENDPOINT_ID",
    "         or AI_IMAGE_*",
    "  Video: VIDEO_API_KEY/VIDEO_BASE_URL/VIDEO_ENDPOINT_ID",
    "         or AI_VIDEO_* / ARK_API_KEY, ARK_BASE_URL, ARK_VIDEO_ENDPOINT_ID",
    "",
    "Retired options:",
    "  --video-image-url <url>    Use this image URL for the video probe.",
    "                             Image API is still probed separately.",
    "  --skip-video               Probe text and image only.",
    "  --poll-interval-ms <ms>    Video task poll interval.",
    "  --max-poll-attempts <n>    Video task max poll attempts.",
    "  --timeout-ms <ms>          Per HTTP request timeout.",
    "  --json                     Print machine-readable JSON.",
    "  --help                     Show this help."
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    json: false,
    skipVideo: false,
    videoImageUrl: null,
    pollIntervalMs: DEFAULT_VIDEO_POLL_INTERVAL_MS,
    maxPollAttempts: DEFAULT_VIDEO_MAX_POLL_ATTEMPTS,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--skip-video") {
      args.skipVideo = true;
      continue;
    }
    if (arg === "--video-image-url") {
      args.videoImageUrl = readRequiredValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--poll-interval-ms") {
      args.pollIntervalMs = readPositiveInteger(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--max-poll-attempts") {
      args.maxPollAttempts = readPositiveInteger(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = readPositiveInteger(argv, i, arg);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function readPositiveInteger(argv, index, flag) {
  const raw = readRequiredValue(argv, index, flag);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return value;
}

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!key) {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadRootEnv() {
  if (process.env.AIGC_VIDEO_SKIP_ENV_FILE === "true") {
    return false;
  }

  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    return false;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (!parsed) {
      continue;
    }
    const [key, value] = parsed;
    process.env[key] ??= value;
  }

  return true;
}

function pickFirst(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return { key, value: value.trim() };
    }
  }
  return null;
}

function resolveTaskConfig(task) {
  const configKeys = {
    text: {
      apiKey: ["TEXT_API_KEY", "AI_TEXT_API_KEY", "ARK_API_KEY"],
      endpointId: ["TEXT_ENDPOINT_ID", "AI_TEXT_ENDPOINT_ID", "ARK_TEXT_ENDPOINT_ID"],
      baseURL: ["TEXT_BASE_URL", "AI_TEXT_BASE_URL", "ARK_BASE_URL"],
      provider: "ark"
    },
    image: {
      apiKey: ["IMAGE_API_KEY", "AI_IMAGE_API_KEY"],
      endpointId: ["IMAGE_ENDPOINT_ID", "AI_IMAGE_ENDPOINT_ID"],
      baseURL: ["IMAGE_BASE_URL", "AI_IMAGE_BASE_URL"],
      provider: "ark-seedream"
    },
    video: {
      apiKey: ["VIDEO_API_KEY", "AI_VIDEO_API_KEY", "ARK_API_KEY"],
      endpointId: ["VIDEO_ENDPOINT_ID", "AI_VIDEO_ENDPOINT_ID", "ARK_VIDEO_ENDPOINT_ID"],
      baseURL: ["VIDEO_BASE_URL", "AI_VIDEO_BASE_URL", "ARK_BASE_URL"],
      provider: "seedance"
    }
  }[task];

  const apiKey = pickFirst(configKeys.apiKey);
  const endpointId = pickFirst(configKeys.endpointId);
  const baseURL = pickFirst(configKeys.baseURL);

  const missing = [];
  if (!apiKey) missing.push(configKeys.apiKey.join("/"));
  if (!endpointId) missing.push(configKeys.endpointId.join("/"));
  if (!baseURL) missing.push(configKeys.baseURL.join("/"));

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    task,
    provider: configKeys.provider,
    apiKey: apiKey.value,
    apiKeyEnv: apiKey.key,
    endpointId: endpointId.value,
    endpointIdEnv: endpointId.key,
    baseURL: baseURL.value,
    baseURLEnv: baseURL.key
  };
}

function maskSecret(value) {
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function joinEndpoint(baseURL, suffix) {
  const normalizedBase = baseURL.replace(/\/+$/, "");
  const normalizedSuffix = suffix.replace(/^\/+/, "");
  if (normalizedBase.endsWith(`/${normalizedSuffix}`)) {
    return normalizedBase;
  }
  return `${normalizedBase}/${normalizedSuffix}`;
}

function joinCollectionItemEndpoint(baseURL, collectionSuffix, itemId) {
  const collectionUrl = joinEndpoint(baseURL, collectionSuffix);
  return `${collectionUrl.replace(/\/+$/, "")}/${encodeURIComponent(itemId)}`;
}

async function fetchJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const text = await response.text();
    const payload = text ? tryParseJson(text) : {};
    if (!response.ok) {
      throw new Error(formatHttpError(response.status, payload, text));
    }
    return { response, payload };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatHttpError(status, payload, rawText) {
  const code = findStringValue(payload, ["code", "Code"]);
  const message = findStringValue(payload, ["message", "Message", "msg", "Msg"]);
  const requestId = findStringValue(payload, [
    "request_id",
    "requestId",
    "RequestId",
    "x_request_id"
  ]);
  const parts = [
    code,
    message ? sanitizeProviderMessage(message) : null,
    requestId ? `request_id=${requestId}` : null
  ].filter(Boolean);

  if (parts.length > 0) {
    return `HTTP ${status}: ${parts.join(" | ")}`;
  }

  const preview = sanitizeProviderMessage(rawText ?? "").slice(0, 240);
  return preview ? `HTTP ${status}: ${preview}` : `HTTP ${status}`;
}

function sanitizeProviderMessage(text) {
  return String(text)
    .replace(
      /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi,
      "data:image/<redacted>;base64,<redacted>"
    )
    .replace(/Bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer <redacted>");
}

function findStringValue(payload, keys) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
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

function resultStarted(name, config) {
  return {
    name,
    provider: config.provider,
    model: config.endpointId,
    baseURL: config.baseURL,
    ok: false,
    latencyMs: null,
    detail: ""
  };
}

function missingConfigResult(name, missing) {
  return {
    name,
    ok: false,
    latencyMs: null,
    detail: `missing config: ${missing.join("; ")}`
  };
}

async function probeText(config, options) {
  const result = resultStarted("text", config);
  const startedAt = Date.now();
  const { payload } = await fetchJson(
    joinEndpoint(config.baseURL, "chat/completions"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.endpointId,
        messages: [
          {
            role: "user",
            content: "Reply with the single word OK."
          }
        ],
        temperature: 0,
        top_p: 0.9
      })
    },
    options.timeoutMs
  );

  const output = payload?.choices?.[0]?.message?.content?.trim?.() ?? "";
  if (!output) {
    throw new Error("text API returned an empty response");
  }

  result.ok = true;
  result.latencyMs = Date.now() - startedAt;
  result.detail = `output=${output.slice(0, 80)}`;
  return result;
}

async function probeImage(config, options) {
  const result = resultStarted("image", config);
  const startedAt = Date.now();
  const { payload } = await fetchJson(
    joinEndpoint(config.baseURL, "images/generations"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.endpointId,
        prompt: "a single red apple on a white background, studio lighting",
        size: "2048x2048",
        response_format: "url",
        watermark: false
      })
    },
    options.timeoutMs
  );

  const data = Array.isArray(payload?.data) ? payload.data : [];
  const imageUrl = data.find((item) => typeof item?.url === "string")?.url ?? null;
  const b64Image =
    data.find((item) => typeof item?.b64_json === "string")?.b64_json ?? null;
  if (!imageUrl && !b64Image) {
    throw new Error("image API returned no image candidate");
  }

  result.ok = true;
  result.latencyMs = Date.now() - startedAt;
  result.detail = imageUrl
    ? `url=${imageUrl.slice(0, 120)}`
    : `b64_json=${b64Image.slice(0, 40)}...`;
  return { result, imageUrl };
}

function extractTaskId(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  for (const key of ["id", "task_id", "taskId"]) {
    if (typeof payload[key] === "string") {
      return payload[key];
    }
  }

  for (const key of ["data", "result", "output"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object") {
      const taskId = extractTaskId(nested);
      if (taskId) {
        return taskId;
      }
    }
  }

  return null;
}

function extractTaskStatus(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  for (const key of ["status", "task_status", "taskStatus"]) {
    if (typeof payload[key] === "string") {
      return payload[key].toLowerCase();
    }
  }

  for (const key of ["data", "result", "output"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object") {
      const status = extractTaskStatus(nested);
      if (status) {
        return status;
      }
    }
  }

  return null;
}

function extractVideoUrl(payload) {
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

  for (const key of ["videoUrl", "video_url"]) {
    if (typeof payload[key] === "string") {
      return payload[key];
    }
  }

  for (const key of ["data", "result", "output", "content", "results", "items"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object") {
      const videoUrl = extractVideoUrl(nested);
      if (videoUrl) {
        return videoUrl;
      }
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollVideoTask(config, taskId, options, onPoll) {
  const taskUrl = joinCollectionItemEndpoint(
    config.baseURL,
    "contents/generations/tasks",
    taskId
  );

  for (let attempt = 1; attempt <= options.maxPollAttempts; attempt += 1) {
    const { payload } = await fetchJson(
      taskUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`
        }
      },
      options.timeoutMs
    );

    const status = extractTaskStatus(payload);
    const videoUrl = extractVideoUrl(payload);
    onPoll?.({ attempt, status, hasVideoUrl: Boolean(videoUrl) });

    if (videoUrl) {
      return videoUrl;
    }

    if (status && ["failed", "fail", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(`video task ${taskId} failed with status ${status}`);
    }

    if (attempt < options.maxPollAttempts) {
      await sleep(options.pollIntervalMs);
    }
  }

  throw new Error(`video task ${taskId} did not complete in time`);
}

async function probeVideo(config, imageUrl, options, log) {
  const result = resultStarted("video", config);
  if (!imageUrl) {
    throw new Error(
      "video probe needs an image URL; pass --video-image-url or let image probe return a URL"
    );
  }

  const startedAt = Date.now();
  const { payload } = await fetchJson(
    joinEndpoint(config.baseURL, "contents/generations/tasks"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.endpointId,
        content: [
          {
            type: "text",
            text: "A 4-second slow push-in on a single red apple."
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl
            },
            role: "first_frame"
          }
        ],
        duration: 4,
        ratio: "1:1",
        generate_audio: false
      })
    },
    options.timeoutMs
  );

  const taskId = extractTaskId(payload);
  let videoUrl = extractVideoUrl(payload);
  if (!videoUrl) {
    if (!taskId) {
      throw new Error("video API returned neither task id nor video URL");
    }
    log?.(`video task created: ${taskId}`);
    videoUrl = await pollVideoTask(
      config,
      taskId,
      options,
      ({ attempt, status, hasVideoUrl }) => {
        log?.(
          `video poll ${attempt}/${options.maxPollAttempts}: status=${status ?? "unknown"} hasVideoUrl=${hasVideoUrl}`
        );
      }
    );
  }

  result.ok = true;
  result.latencyMs = Date.now() - startedAt;
  result.detail = `url=${videoUrl.slice(0, 120)}`;
  if (taskId) {
    result.taskId = taskId;
  }
  return result;
}

function printConfigSummary(configs, envLoaded) {
  console.log(`[verify-provider-apis] env_file=${envLoaded ? ".env" : "none"}`);
  for (const [name, config] of Object.entries(configs)) {
    if (!config.ok) {
      console.log(
        `[verify-provider-apis] ${name} config: missing ${config.missing.join("; ")}`
      );
      continue;
    }
    console.log(
      [
        `[verify-provider-apis] ${name} config:`,
        `provider=${config.provider}`,
        `model=${config.endpointId}`,
        `baseURL=${config.baseURL}`,
        `${config.apiKeyEnv}=${maskSecret(config.apiKey)}`
      ].join(" ")
    );
  }
}

function printResult(result) {
  const status = result.ok ? "ok" : "fail";
  const latency = result.latencyMs === null ? "" : ` latencyMs=${result.latencyMs}`;
  console.log(
    `[verify-provider-apis] [${status}] ${result.name}${latency} ${result.detail}`
  );
}

async function runProbe(name, config, fn) {
  if (!config.ok) {
    return missingConfigResult(name, config.missing);
  }

  try {
    return await fn(config);
  } catch (error) {
    return {
      name,
      ok: false,
      latencyMs: null,
      detail: sanitizeProviderMessage(
        error instanceof Error ? error.message : String(error)
      )
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  exitDisabledRealModelTest("verify-provider-apis");
  const envLoaded = loadRootEnv();
  const configs = {
    text: resolveTaskConfig("text"),
    image: resolveTaskConfig("image"),
    video: resolveTaskConfig("video")
  };
  const results = [];

  const log = args.json
    ? null
    : (message) => {
        console.log(`[verify-provider-apis] ${message}`);
      };

  if (!args.json) {
    printConfigSummary(configs, envLoaded);
  }

  const textResult = await runProbe("text", configs.text, (config) =>
    probeText(config, args)
  );
  results.push(textResult);
  if (!args.json) {
    printResult(textResult);
  }

  const imageProbe = await runProbe("image", configs.image, (config) =>
    probeImage(config, args)
  );
  const imageResult = imageProbe.result ?? imageProbe;
  const generatedImageUrl = imageProbe.imageUrl ?? null;
  results.push(imageResult);
  if (!args.json) {
    printResult(imageResult);
  }

  if (!args.skipVideo) {
    const videoImageUrl = args.videoImageUrl ?? generatedImageUrl;
    const videoResult = await runProbe("video", configs.video, (config) =>
      probeVideo(config, videoImageUrl, args, log)
    );
    results.push(videoResult);
    if (!args.json) {
      printResult(videoResult);
    }
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          envLoaded,
          results
        },
        null,
        2
      )
    );
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[verify-provider-apis] unexpected error: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exitCode = 2;
});
