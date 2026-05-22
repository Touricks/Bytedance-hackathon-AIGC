import { useQuery } from "@tanstack/react-query";
import { getJobDetail } from "../api/client.js";

export function useGenerationJob(jobId: string | null) {
  return useQuery({
    queryKey: ["generation-job", jobId],
    queryFn: () => getJobDetail(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status === "completed" || status === "failed" ? false : 1200;
    }
  });
}
