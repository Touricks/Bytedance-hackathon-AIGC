import { loadWorkspaceEnv } from "../env.js";

loadWorkspaceEnv();

export const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export type ProviderEnv = Record<string, string | undefined>;

export interface TextProviderConfig {
  provider: "ark" | "fallback-llm";
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

export function isRealProviderMode(env: ProviderEnv = process.env) {
  return env.MODEL_MODE === "real";
}

export function resolveArkTextProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<TextProviderConfig, "apiKey" | "model" | "baseURL">> = {}
): TextProviderConfig | null {
  const apiKey = overrides.apiKey ?? env.ARK_API_KEY;
  const model = overrides.model ?? env.ARK_TEXT_ENDPOINT_ID;

  if (!apiKey || !model) {
    return null;
  }

  return {
    provider: "ark",
    apiKey,
    model,
    baseURL: overrides.baseURL ?? env.ARK_BASE_URL ?? DEFAULT_ARK_BASE_URL
  };
}

export function resolveFallbackTextProviderConfig(
  env: ProviderEnv = process.env
): TextProviderConfig | null {
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL;

  if (!apiKey || !model) {
    return null;
  }

  return {
    provider: "fallback-llm",
    apiKey,
    model,
    baseURL: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  };
}

export function resolveArkVideoProviderConfig(
  env: ProviderEnv = process.env,
  overrides: Partial<Pick<VideoProviderConfig, "apiKey" | "model" | "baseURL">> = {}
): VideoProviderConfig | null {
  const apiKey = overrides.apiKey ?? env.ARK_API_KEY;
  const model = overrides.model ?? env.ARK_VIDEO_ENDPOINT_ID;

  if (!apiKey || !model) {
    return null;
  }

  return {
    provider: "seedance",
    apiKey,
    model,
    baseURL: overrides.baseURL ?? env.ARK_BASE_URL ?? DEFAULT_ARK_BASE_URL
  };
}

export function isProviderAuthOrConfigError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const status = record.status;
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return true;
  }

  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";
  return [
    "api key",
    "apikey",
    "unauthorized",
    "forbidden",
    "invalid endpoint",
    "invalid model",
    "model not found"
  ].some((pattern) => message.includes(pattern));
}
