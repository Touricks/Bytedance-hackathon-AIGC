import { useQuery } from "@tanstack/react-query";
import { getWorkflowStatus } from "../../../lib/api/shots.js";
import { useVisibilityActive } from "./useVisibilityActive.js";

const ACTIVE_STATUSES = new Set([
  "IMAGE_GENERATING",
  "VIDEO_GENERATING",
  "IMAGE_PROMPT_PROPOSING",
  "VIDEO_SCRIPT_PROPOSING",
]);

export function useShotWorkflowStatus(workspaceId: string | null) {
  const visible = useVisibilityActive();
  return useQuery({
    queryKey: ["workflow-status", workspaceId],
    queryFn: () => getWorkflowStatus(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: (query) => {
      if (!visible) return false;
      const data = query.state.data?.data;
      if (!data) return 5_000;
      const anyActive = data.shots.some((s) => ACTIVE_STATUSES.has(s.status));
      return anyActive ? 3_000 : 30_000;
    },
  });
}
