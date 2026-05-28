import { useQuery } from "@tanstack/react-query";
import { getVideoBatch } from "../../../lib/api/videoBatch.js";
import { useVisibilityActive } from "./useVisibilityActive.js";

const TERMINAL = new Set(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]);

export function useVideoBatch(shotId: string | null, batchId: string | null) {
  const visible = useVisibilityActive();
  return useQuery({
    queryKey: ["video-batch", shotId, batchId],
    queryFn: () => getVideoBatch(shotId!, batchId!),
    enabled: Boolean(shotId && batchId),
    refetchInterval: (q) => {
      if (!visible) return false;
      const d = q.state.data?.data;
      if (!d) return 5_000;
      return TERMINAL.has(d.status) ? false : 5_000;
    },
  });
}
