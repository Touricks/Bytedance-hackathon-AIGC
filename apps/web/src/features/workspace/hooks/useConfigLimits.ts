import { useQuery } from "@tanstack/react-query";
import { getConfigLimits, type ConfigLimits } from "../../../lib/api/configLimits.js";

const FALLBACK: ConfigLimits = {
  defaultImageCandidates: 3,
  maxImageCandidatesPerShot: 6,
  defaultVideoCandidates: 2,
  maxVideoCandidatesPerShot: 5,
  generationWorkerConcurrency: 17,
  providerConcurrency: {
    text: 20,
    image: 12,
    video: 5
  },
  aspectRatios: ["9:16", "16:9", "1:1"]
};

export function useConfigLimits(): ConfigLimits {
  const { data } = useQuery({
    queryKey: ["config", "limits"],
    queryFn: getConfigLimits,
    staleTime: 5 * 60_000
  });
  return data?.data ?? FALLBACK;
}
