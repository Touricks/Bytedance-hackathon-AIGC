#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "verify-provider-image";
const DEFAULT_TIMEOUT_MS = 60000;
const ASPECT_RATIOS = ["1:1", "9:16", "16:9"];

function usage() {
  return [
    "Usage:",
    "  node scripts/verify-provider-image.mjs",
    "  node scripts/verify-provider-image.mjs --json",
    "  node scripts/verify-provider-image.mjs --prompt <text> --aspect-ratio 9:16",
    "",
    "Checks only the Seedream image provider chain.",
    "",
    "Environment variables:",
    "  IMAGE_API_KEY/AI_IMAGE_API_KEY",
    "  IMAGE_BASE_URL/AI_IMAGE_BASE_URL",
    "  IMAGE_ENDPOINT_ID/AI_IMAGE_ENDPOINT_ID",
    "",
    "Options:",
    "  --prompt <text>                 Image prompt.",
    "  --negative-prompt <text>        Optional negative prompt.",
    "  --reference-image-url <url>     Optional reference image URL; repeatable.",
    "  --count <n>                     Candidate count. Default: 1.",
    "  --aspect-ratio <ratio>          1:1, 9:16, or 16:9. Default: 1:1.",
    "  --size <size>                   Explicit provider size, e.g. 2048x2048.",
    "  --timeout-ms <ms>               Per HTTP request timeout. Default: 60000.",
    "  --json                          Print machine-readable JSON.",
    "  --help                          Show this help."
  ].join("\n");
}

function argValue(argv, i, flag) {
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function intArg(argv, i, flag) {
  const value = Number(argValue(argv, i, flag));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} must be a positive integer`);
  return value;
}

function ratioArg(argv, i, flag) {
  const value = argValue(argv, i, flag);
  if (!ASPECT_RATIOS.includes(value)) throw new Error(`${flag} must be one of: ${ASPECT_RATIOS.join(", ")}`);
  return value;
}

function parseArgs(argv) {
  const args = {
    json: false,
    prompt: "a single red apple on a white background, studio lighting",
    negativePrompt: null,
    referenceImageUrls: [],
    count: 1,
    aspectRatio: "1:1",
    size: null,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--json") args.json = true;
    else if (arg === "--prompt") args.prompt = argValue(argv, i++, arg);
    else if (arg === "--negative-prompt") args.negativePrompt = argValue(argv, i++, arg);
    else if (arg === "--reference-image-url") args.referenceImageUrls.push(argValue(argv, i++, arg));
    else if (arg === "--count") args.count = intArg(argv, i++, arg);
    else if (arg === "--aspect-ratio") args.aspectRatio = ratioArg(argv, i++, arg);
    else if (arg === "--size") args.size = argValue(argv, i++, arg);
    else if (arg === "--timeout-ms") args.timeoutMs = intArg(argv, i++, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const index = trimmed.indexOf("=");
  if (index < 0) return null;
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
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

function firstEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

function resolveConfig() {
  const apiKey = firstEnv(["IMAGE_API_KEY", "AI_IMAGE_API_KEY"]);
  const baseURL = firstEnv(["IMAGE_BASE_URL", "AI_IMAGE_BASE_URL"]);
  const endpointId = firstEnv(["IMAGE_ENDPOINT_ID", "AI_IMAGE_ENDPOINT_ID"]);
  const missing = [];
  if (!apiKey) missing.push("IMAGE_API_KEY/AI_IMAGE_API_KEY");
  if (!baseURL) missing.push("IMAGE_BASE_URL/AI_IMAGE_BASE_URL");
  if (!endpointId) missing.push("IMAGE_ENDPOINT_ID/AI_IMAGE_ENDPOINT_ID");
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    provider: "ark-seedream",
    apiKey: apiKey.value,
    apiKeyEnv: apiKey.key,
    baseURL: baseURL.value,
    endpointId: endpointId.value
  };
}

function mask(value) {
  if (!value) return "";
  return value.length <= 8 ? "****" : `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function sanitize(text) {
  return String(text)
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi, "data:image/<redacted>;base64,<redacted>")
    .replace(/Bearer\s+[a-z0-9._~+/=-]+/gi, "Bearer <redacted>");
}

function joinEndpoint(baseURL, suffix) {
  const base = baseURL.replace(/\/+$/, "");
  const tail = suffix.replace(/^\/+/, "");
  return base.endsWith(`/${tail}`) ? base : `${base}/${tail}`;
}

function jsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findString(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  for (const child of Object.values(value)) {
    const nested = findString(child, keys);
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
    const payload = text ? jsonOrNull(text) : {};
    if (!response.ok) throw new Error(httpError(response.status, payload, text));
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function defaultSize(aspectRatio) {
  if (aspectRatio === "9:16") return "1600x2848";
  if (aspectRatio === "16:9") return "2848x1600";
  return "2048x2048";
}

async function probe(config, args) {
  const startedAt = Date.now();
  const body = {
    model: config.endpointId,
    prompt: args.prompt,
    size: args.size ?? defaultSize(args.aspectRatio),
    response_format: "url",
    watermark: false
  };
  if (args.negativePrompt) body.negative_prompt = args.negativePrompt;
  if (args.referenceImageUrls.length === 1) body.image = args.referenceImageUrls[0];
  if (args.referenceImageUrls.length > 1) body.image = args.referenceImageUrls;
  if (args.count > 1) {
    body.sequential_image_generation = "auto";
    body.sequential_image_generation_options = { max_images: args.count };
  }
  const payload = await fetchJson(
    joinEndpoint(config.baseURL, "images/generations"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    },
    args.timeoutMs
  );
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const imageUrl = data.find((item) => typeof item?.url === "string")?.url ?? null;
  const b64 = data.find((item) => typeof item?.b64_json === "string")?.b64_json ?? null;
  if (!imageUrl && !b64) throw new Error("image API returned no image candidate");
  return {
    name: "image",
    provider: config.provider,
    model: config.endpointId,
    baseURL: config.baseURL,
    ok: true,
    latencyMs: Date.now() - startedAt,
    detail: imageUrl ? `url=${imageUrl.slice(0, 120)}` : `b64_json=${b64.slice(0, 40)}...`,
    candidateCount: data.length,
    ...(imageUrl ? { imageUrl } : {})
  };
}

function printConfig(config, envLoaded) {
  console.log(`[${PREFIX}] env_file=${envLoaded ? ".env" : "none"}`);
  if (!config.ok) {
    console.log(`[${PREFIX}] image config: missing ${config.missing.join("; ")}`);
    return;
  }
  console.log(`[${PREFIX}] image config: provider=${config.provider} model=${config.endpointId} baseURL=${config.baseURL} ${config.apiKeyEnv}=${mask(config.apiKey)}`);
}

function printResult(result) {
  const latency = result.latencyMs === null ? "" : ` latencyMs=${result.latencyMs}`;
  console.log(`[${PREFIX}] [${result.ok ? "ok" : "fail"}] ${result.name}${latency} ${result.detail}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envLoaded = loadRootEnv();
  const config = resolveConfig();
  let result;
  if (!args.json) printConfig(config, envLoaded);
  if (!config.ok) {
    result = { name: "image", ok: false, latencyMs: null, detail: `missing config: ${config.missing.join("; ")}` };
  } else {
    try {
      result = await probe(config, args);
    } catch (error) {
      result = { name: "image", ok: false, latencyMs: null, detail: sanitize(error instanceof Error ? error.message : String(error)) };
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
