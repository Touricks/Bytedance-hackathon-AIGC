#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "verify-provider-video";
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_POLL_INTERVAL_MS = 10000;
const DEFAULT_MAX_POLL_ATTEMPTS = 20;
const ASPECT_RATIOS = ["1:1", "9:16", "16:9"];
const IMAGE_MIME = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

function usage() {
  return [
    "Usage:",
    "  node scripts/verify-provider-video.mjs --image-url <url>",
    "  node scripts/verify-provider-video.mjs --image-file <path>",
    "  node scripts/verify-provider-video.mjs --image-url <url> --create-only --json",
    "",
    "Checks only the Seedance video provider chain.",
    "",
    "Environment variables:",
    "  VIDEO_API_KEY/AI_VIDEO_API_KEY/ARK_API_KEY",
    "  VIDEO_BASE_URL/AI_VIDEO_BASE_URL/ARK_BASE_URL",
    "  VIDEO_ENDPOINT_ID/AI_VIDEO_ENDPOINT_ID/ARK_VIDEO_ENDPOINT_ID",
    "  PROVIDER_VERIFY_VIDEO_IMAGE_URL can supply the first-frame URL.",
    "",
    "Options:",
    "  --image-url <url>              First-frame image URL or data URL.",
    "  --image-file <path>            First-frame local jpg/png/webp, sent as data URL.",
    "  --last-frame-url <url>         Optional last-frame image URL or data URL.",
    "  --last-frame-file <path>       Optional last-frame local jpg/png/webp.",
    "  --prompt <text>                Video prompt.",
    "  --duration-sec <n>             4-12 seconds. Default: 4.",
    "  --aspect-ratio <ratio>         1:1, 9:16, or 16:9. Default: 1:1.",
    "  --generate-audio               Request audio generation. Default: false.",
    "  --create-only                  Stop after task creation; useful when full video polling is slow.",
    "  --poll-interval-ms <ms>        Video task poll interval. Default: 10000.",
    "  --max-poll-attempts <n>        Video task max poll attempts. Default: 20.",
    "  --timeout-ms <ms>              Per HTTP request timeout. Default: 60000.",
    "  --json                         Print machine-readable JSON.",
    "  --help                         Show this help."
  ].join("\n");
}

function required(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInt(argv, index, flag) {
  const value = Number(required(argv, index, flag));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} must be a positive integer`);
  return value;
}

function oneOf(argv, index, flag, values) {
  const value = required(argv, index, flag);
  if (!values.includes(value)) throw new Error(`${flag} must be one of: ${values.join(", ")}`);
  return value;
}

function parseArgs(argv) {
  const args = {
    json: false,
    imageUrl: null,
    imageFile: null,
    lastFrameUrl: null,
    lastFrameFile: null,
    prompt: "A 4-second slow push-in on a single red apple.",
    durationSec: 4,
    aspectRatio: "1:1",
    generateAudio: false,
    createOnly: false,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    maxPollAttempts: DEFAULT_MAX_POLL_ATTEMPTS,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--json") args.json = true;
    else if (arg === "--image-url") args.imageUrl = required(argv, i++, arg);
    else if (arg === "--image-file") args.imageFile = required(argv, i++, arg);
    else if (arg === "--last-frame-url") args.lastFrameUrl = required(argv, i++, arg);
    else if (arg === "--last-frame-file") args.lastFrameFile = required(argv, i++, arg);
    else if (arg === "--prompt") args.prompt = required(argv, i++, arg);
    else if (arg === "--duration-sec") args.durationSec = positiveInt(argv, i++, arg);
    else if (arg === "--aspect-ratio") args.aspectRatio = oneOf(argv, i++, arg, ASPECT_RATIOS);
    else if (arg === "--generate-audio") args.generateAudio = true;
    else if (arg === "--create-only") args.createOnly = true;
    else if (arg === "--poll-interval-ms") args.pollIntervalMs = positiveInt(argv, i++, arg);
    else if (arg === "--max-poll-attempts") args.maxPollAttempts = positiveInt(argv, i++, arg);
    else if (arg === "--timeout-ms") args.timeoutMs = positiveInt(argv, i++, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.durationSec < 4 || args.durationSec > 12) throw new Error("--duration-sec must be between 4 and 12");
  if (args.imageUrl && args.imageFile) throw new Error("Pass only one of --image-url or --image-file");
  if (args.lastFrameUrl && args.lastFrameFile) throw new Error("Pass only one of --last-frame-url or --last-frame-file");
  return args;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx < 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if (!key) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadRootEnv() {
  if (process.env.AIGC_VIDEO_SKIP_ENV_FILE === "true") return false;
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return false;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    process.env[key] ??= value;
  }
  return true;
}

function pick(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

function resolveConfig() {
  const keys = {
    apiKey: ["VIDEO_API_KEY", "AI_VIDEO_API_KEY", "ARK_API_KEY"],
    baseURL: ["VIDEO_BASE_URL", "AI_VIDEO_BASE_URL", "ARK_BASE_URL"],
    endpointId: ["VIDEO_ENDPOINT_ID", "AI_VIDEO_ENDPOINT_ID", "ARK_VIDEO_ENDPOINT_ID"]
  };
  const apiKey = pick(keys.apiKey);
  const baseURL = pick(keys.baseURL);
  const endpointId = pick(keys.endpointId);
  const missing = [];
  if (!apiKey) missing.push(keys.apiKey.join("/"));
  if (!baseURL) missing.push(keys.baseURL.join("/"));
  if (!endpointId) missing.push(keys.endpointId.join("/"));
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    provider: "seedance",
    apiKey: apiKey.value,
    apiKeyEnv: apiKey.key,
    baseURL: baseURL.value,
    endpointId: endpointId.value
  };
}

function mask(value) {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function sanitize(text) {
  return String(text)
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi, "data:image/<redacted>;base64,<redacted>")
    .replace(/Bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer <redacted>");
}

function joinEndpoint(baseURL, suffix) {
  const base = baseURL.replace(/\/+$/, "");
  const pathPart = suffix.replace(/^\/+/, "");
  return base.endsWith(`/${pathPart}`) ? base : `${base}/${pathPart}`;
}

function joinTaskEndpoint(baseURL, taskId) {
  return `${joinEndpoint(baseURL, "contents/generations/tasks").replace(/\/+$/, "")}/${encodeURIComponent(taskId)}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findString(payload, keys) {
  if (!payload || typeof payload !== "object") return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const value of Object.values(payload)) {
    const nested = findString(value, keys);
    if (nested) return nested;
  }
  return null;
}

function httpError(status, payload, rawText) {
  const code = findString(payload, ["code", "Code"]);
  const message = findString(payload, ["message", "Message", "msg", "Msg"]);
  const requestId = findString(payload, ["request_id", "requestId", "RequestId", "x_request_id"]);
  const parts = [code, message ? sanitize(message) : null, requestId ? `request_id=${requestId}` : null].filter(Boolean);
  if (parts.length) return `HTTP ${status}: ${parts.join(" | ")}`;
  const preview = sanitize(rawText ?? "").slice(0, 240);
  return preview ? `HTTP ${status}: ${preview}` : `HTTP ${status}`;
}

async function fetchJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    const payload = text ? parseJson(text) : {};
    if (!response.ok) throw new Error(httpError(response.status, payload, text));
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractTaskId(payload) {
  if (!payload || typeof payload !== "object") return null;
  for (const key of ["id", "task_id", "taskId"]) {
    if (typeof payload[key] === "string") return payload[key];
  }
  for (const key of ["data", "result", "output"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object") {
      const taskId = extractTaskId(nested);
      if (taskId) return taskId;
    }
  }
  return null;
}

function extractTaskStatus(payload) {
  if (!payload || typeof payload !== "object") return null;
  for (const key of ["status", "task_status", "taskStatus"]) {
    if (typeof payload[key] === "string") return payload[key].toLowerCase();
  }
  for (const key of ["data", "result", "output"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object") {
      const status = extractTaskStatus(nested);
      if (status) return status;
    }
  }
  return null;
}

function extractVideoUrl(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const videoUrl = extractVideoUrl(item);
      if (videoUrl) return videoUrl;
    }
    return null;
  }
  if (typeof payload !== "object") return null;
  for (const key of ["videoUrl", "video_url"]) {
    if (typeof payload[key] === "string") return payload[key];
  }
  for (const key of ["data", "result", "output", "content", "results", "items"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object") {
      const videoUrl = extractVideoUrl(nested);
      if (videoUrl) return videoUrl;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readImageFileAsDataUrl(filePath) {
  const resolved = path.resolve(filePath);
  const mime = IMAGE_MIME.get(path.extname(resolved).toLowerCase());
  if (!mime) throw new Error(`Unsupported image file extension: ${path.extname(resolved) || "(none)"}`);
  return `data:${mime};base64,${readFileSync(resolved).toString("base64")}`;
}

function resolveImages(args) {
  return {
    imageUrl:
      args.imageUrl ??
      (args.imageFile ? readImageFileAsDataUrl(args.imageFile) : null) ??
      process.env.PROVIDER_VERIFY_VIDEO_IMAGE_URL ??
      null,
    lastFrameUrl:
      args.lastFrameUrl ??
      (args.lastFrameFile ? readImageFileAsDataUrl(args.lastFrameFile) : null)
  };
}

async function pollVideo(config, taskId, args, log) {
  for (let attempt = 1; attempt <= args.maxPollAttempts; attempt += 1) {
    const payload = await fetchJson(
      joinTaskEndpoint(config.baseURL, taskId),
      { method: "GET", headers: { Authorization: `Bearer ${config.apiKey}` } },
      args.timeoutMs
    );
    const status = extractTaskStatus(payload);
    const videoUrl = extractVideoUrl(payload);
    log?.(`video poll ${attempt}/${args.maxPollAttempts}: status=${status ?? "unknown"} hasVideoUrl=${Boolean(videoUrl)}`);
    if (videoUrl) return { videoUrl, status };
    if (status && ["failed", "fail", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(`video task ${taskId} failed with status ${status}`);
    }
    if (attempt < args.maxPollAttempts) await sleep(args.pollIntervalMs);
  }
  throw new Error(`video task ${taskId} did not complete in time`);
}

async function probe(config, args, log) {
  if (!args.imageUrl) {
    throw new Error("video probe needs a first-frame image; pass --image-url, --image-file, or PROVIDER_VERIFY_VIDEO_IMAGE_URL");
  }

  const startedAt = Date.now();
  const content = [
    { type: "text", text: args.prompt },
    { type: "image_url", image_url: { url: args.imageUrl }, role: "first_frame" },
    ...(args.lastFrameUrl
      ? [{ type: "image_url", image_url: { url: args.lastFrameUrl }, role: "last_frame" }]
      : [])
  ];

  const payload = await fetchJson(
    joinEndpoint(config.baseURL, "contents/generations/tasks"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.endpointId,
        content,
        duration: args.durationSec,
        ratio: args.aspectRatio,
        generate_audio: args.generateAudio
      })
    },
    args.timeoutMs
  );

  const taskId = extractTaskId(payload);
  const status = extractTaskStatus(payload);
  let videoUrl = extractVideoUrl(payload);
  if (!videoUrl) {
    if (!taskId) throw new Error("video API returned neither task id nor video URL");
    log?.(`video task created: ${taskId}`);
    if (args.createOnly) {
      return {
        name: "video",
        provider: config.provider,
        model: config.endpointId,
        baseURL: config.baseURL,
        ok: true,
        latencyMs: Date.now() - startedAt,
        detail: `taskId=${taskId} status=${status ?? "created"} createOnly=true`,
        taskId,
        ...(status ? { status } : {})
      };
    }
    const polled = await pollVideo(config, taskId, args, log);
    videoUrl = polled.videoUrl;
  }

  return {
    name: "video",
    provider: config.provider,
    model: config.endpointId,
    baseURL: config.baseURL,
    ok: true,
    latencyMs: Date.now() - startedAt,
    detail: `url=${videoUrl.slice(0, 120)}`,
    videoUrl,
    ...(taskId ? { taskId } : {})
  };
}

function printConfig(config, envLoaded) {
  console.log(`[${PREFIX}] env_file=${envLoaded ? ".env" : "none"}`);
  if (!config.ok) {
    console.log(`[${PREFIX}] video config: missing ${config.missing.join("; ")}`);
    return;
  }
  console.log(
    `[${PREFIX}] video config: provider=${config.provider} model=${config.endpointId} baseURL=${config.baseURL} ${config.apiKeyEnv}=${mask(config.apiKey)}`
  );
}

function printResult(result) {
  const latency = result.latencyMs === null ? "" : ` latencyMs=${result.latencyMs}`;
  console.log(`[${PREFIX}] [${result.ok ? "ok" : "fail"}] ${result.name}${latency} ${result.detail}`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const envLoaded = loadRootEnv();
  const config = resolveConfig();
  const args = { ...parsed, ...resolveImages(parsed) };
  let result;
  if (!args.json) printConfig(config, envLoaded);
  if (!config.ok) {
    result = { name: "video", ok: false, latencyMs: null, detail: `missing config: ${config.missing.join("; ")}` };
  } else {
    try {
      result = await probe(config, args, args.json ? null : (message) => console.log(`[${PREFIX}] ${message}`));
    } catch (error) {
      result = { name: "video", ok: false, latencyMs: null, detail: sanitize(error instanceof Error ? error.message : String(error)) };
    }
  }
  if (args.json) console.log(JSON.stringify({ envLoaded, result }, null, 2));
  else printResult(result);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[${PREFIX}] unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
