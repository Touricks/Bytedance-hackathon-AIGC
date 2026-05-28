import { useQuery } from "@tanstack/react-query";
import {
  getConfigLimits,
  type ConfigLimits,
} from "../../../lib/api/configLimits.js";

const FALLBACK: ConfigLimits = {
  defaultImageBatchSize: 3,
  maxImageBatchSize: 6,
  defaultVideoBatchSize: 5,
  maxVideoBatchSize: 10,
  aspectRatios: ["9:16", "16:9", "1:1"],
};

export function useConfigLimits(): ConfigLimits {
  const { data } = useQuery({
    queryKey: ["config", "limits"],
    queryFn: getConfigLimits,
    staleTime: 5 * 60_000,
  });
  return data?.data ?? FALLBACK;
}
