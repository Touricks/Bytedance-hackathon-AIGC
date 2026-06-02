import { useInfiniteQuery } from "@tanstack/react-query";
import {
  listWorkspaceTraces,
  type TraceEventRow,
} from "../../../lib/api/trace.js";

export function useTraceStream(workspaceId: string) {
  return useInfiniteQuery({
    queryKey: ["traces", workspaceId],
    queryFn: ({ pageParam }) =>
      listWorkspaceTraces(workspaceId, {
        limit: 50,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => {
      const rows = last.data as TraceEventRow[];
      return rows.length === 50 ? rows.at(-1)?.id : undefined;
    },
  });
}
