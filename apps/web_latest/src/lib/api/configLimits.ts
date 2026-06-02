import { fetchJson } from "./client.js";

export interface ConfigLimits {
  defaultImageCandidates: number;
  maxImageCandidatesPerShot: number;
  defaultVideoCandidates: number;
  maxVideoCandidatesPerShot: number;
  generationWorkerConcurrency?: number;
  providerConcurrency?: {
    text: number;
    image: number;
    video: number;
  };
  aspectRatios: Array<"9:16" | "16:9" | "1:1">;
}

export function getConfigLimits() {
  return fetchJson<{ data: ConfigLimits }>(`/api/config/limits`);
}
