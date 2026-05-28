import { loadWorkspaceEnv } from "../env.js";

loadWorkspaceEnv();

export const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export type ProviderEnv = Record<string, string | undefined>;

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
