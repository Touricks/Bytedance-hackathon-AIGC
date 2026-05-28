import { fetchJson } from "./client.js";

export interface ConfigLimits {
  defaultImageBatchSize: number;
  maxImageBatchSize: number;
  defaultVideoBatchSize: number;
  maxVideoBatchSize: number;
  aspectRatios: Array<"9:16" | "16:9" | "1:1">;
}

export function getConfigLimits() {
  return fetchJson<{ data: ConfigLimits }>(`/api/config/limits`);
}
