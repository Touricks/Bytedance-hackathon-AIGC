import { useQuery } from "@tanstack/react-query";
import { getFinalVideo } from "../../../lib/api/finalVideo.js";
import { useVisibilityActive } from "./useVisibilityActive.js";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

export function useFinalVideo(finalVideoJobId: string | null) {
  const visible = useVisibilityActive();
  return useQuery({
    queryKey: ["final-video", finalVideoJobId],
    queryFn: () => getFinalVideo(finalVideoJobId!),
    enabled: Boolean(finalVideoJobId),
    refetchInterval: (q) => {
      if (!visible) return false;
      const d = q.state.data?.data;
      if (!d) return 5_000;
      return TERMINAL.has(d.status) ? false : 5_000;
    },
  });
}
