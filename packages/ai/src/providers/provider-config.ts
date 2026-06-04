import { loadWorkspaceEnv } from "../env.js";

loadWorkspaceEnv();

export const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export type ProviderEnv = Record<string, string | undefined>;

export interface TaskProviderConfig {
  task: "text" | "image" | "video";
  provider: string;
  apiKey: string;
  endpointId: string;
  baseURL: string;
  timeoutMs?: number;
}

function pickFirst(env: ProviderEnv, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function isRealProviderMode(env: ProviderEnv = process.env) {
  return env.MODEL_MODE === "real";
}

export function resolveTextProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TaskProviderConfig, "apiKey" | "endpointId" | "baseURL">> = {},
): TaskProviderConfig | null {
  const apiKey = overrides.apiKey ?? pickFirst(env, ["TEXT_API_KEY", "AI_TEXT_API_KEY", "ARK_API_KEY"]);
  const endpointId = overrides.endpointId ?? pickFirst(env, ["TEXT_ENDPOINT_ID", "AI_TEXT_ENDPOINT_ID", "ARK_TEXT_ENDPOINT_ID"]);
  if (!apiKey || !endpointId) return null;
  const baseURL = overrides.baseURL ?? pickFirst(env, ["TEXT_BASE_URL", "AI_TEXT_BASE_URL", "ARK_BASE_URL"]) ?? DEFAULT_ARK_BASE_URL;
  return { task: "text", provider: "ark", apiKey, baseURL, endpointId };
}

export function resolveImageProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TaskProviderConfig, "apiKey" | "endpointId" | "baseURL">> = {},
): TaskProviderConfig | null {
  const apiKey = overrides.apiKey ?? pickFirst(env, ["IMAGE_API_KEY", "AI_IMAGE_API_KEY"]);
  const endpointId = overrides.endpointId ?? pickFirst(env, ["IMAGE_ENDPOINT_ID", "AI_IMAGE_ENDPOINT_ID"]);
  if (!apiKey || !endpointId) return null;
  const baseURL = overrides.baseURL ?? pickFirst(env, ["IMAGE_BASE_URL", "AI_IMAGE_BASE_URL"]) ?? DEFAULT_ARK_BASE_URL;
  return { task: "image", provider: "ark-seedream", apiKey, baseURL, endpointId };
}

export function resolveVideoProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TaskProviderConfig, "apiKey" | "endpointId" | "baseURL">> = {},
): TaskProviderConfig | null {
  const apiKey = overrides.apiKey ?? pickFirst(env, ["VIDEO_API_KEY", "AI_VIDEO_API_KEY", "ARK_API_KEY"]);
  const endpointId = overrides.endpointId ?? pickFirst(env, ["VIDEO_ENDPOINT_ID", "AI_VIDEO_ENDPOINT_ID", "ARK_VIDEO_ENDPOINT_ID"]);
  if (!apiKey || !endpointId) return null;
  const baseURL = overrides.baseURL ?? pickFirst(env, ["VIDEO_BASE_URL", "AI_VIDEO_BASE_URL", "ARK_BASE_URL"]) ?? DEFAULT_ARK_BASE_URL;
  return { task: "video", provider: "seedance", apiKey, baseURL, endpointId };
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function resolveTtsProviderConfig(
  env: ProviderEnv = process.env,
): import("./ark-tts.provider.js").TtsProviderConfig | null {
  const apiKey = pickFirst(env, ["TTS_API_KEY", "ARK_API_KEY"]);
  const endpointId = pickFirst(env, ["TTS_ENDPOINT_ID"]);
  if (!apiKey || !endpointId) return null;
  const baseURL = pickFirst(env, ["TTS_BASE_URL", "ARK_BASE_URL"]) ?? DEFAULT_ARK_BASE_URL;
  return { provider: "ark-tts", apiKey, endpointId, baseURL };
}

// ----- legacy aliases (kept for callers in this wave; removed in Wave 2) -----
export interface TextProviderConfig {
  provider: "ark";
  apiKey: string;
  model: string;
  baseURL: string;
}
export interface VideoProviderConfig {
  provider: "seedance";
  apiKey: string;
  model: string;
  baseURL: string;
}
export function resolveArkTextProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TextProviderConfig, "apiKey" | "model" | "baseURL">> = {},
): TextProviderConfig | null {
  const cfg = resolveTextProviderConfig(env, {
    apiKey: overrides.apiKey,
    endpointId: overrides.model,
    baseURL: overrides.baseURL,
  });
  if (!cfg) return null;
  return { provider: "ark", apiKey: cfg.apiKey, model: cfg.endpointId, baseURL: cfg.baseURL };
}
export function resolveArkVideoProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<VideoProviderConfig, "apiKey" | "model" | "baseURL">> = {},
): VideoProviderConfig | null {
  const cfg = resolveVideoProviderConfig(env, {
    apiKey: overrides.apiKey,
    endpointId: overrides.model,
    baseURL: overrides.baseURL,
  });
  if (!cfg) return null;
  return { provider: "seedance", apiKey: cfg.apiKey, model: cfg.endpointId, baseURL: cfg.baseURL };
}
