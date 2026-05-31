import { useQuery } from "@tanstack/react-query";
import { getImageBatch } from "../../../lib/api/imageBatch.js";
import { useVisibilityActive } from "./useVisibilityActive.js";

const TERMINAL = new Set(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]);

export function useImageBatch(
  workspaceId: string | null,
  shotId: string | null,
  batchId: string | null,
) {
  const visible = useVisibilityActive();
  return useQuery({
    queryKey: ["image-rounds", workspaceId, shotId, batchId],
    queryFn: () => getImageBatch(workspaceId!, shotId!, batchId!),
    enabled: Boolean(workspaceId && shotId && batchId),
    refetchInterval: (q) => {
      const data = q.state.data?.data;
      if (!visible) return false;
      if (!data) return 3_000;
      return TERMINAL.has(data.status) ? false : 3_000;
    },
  });
}
