import { useState } from "react";
import { useTraceStream } from "../hooks/useTraceStream.js";
import { TraceEventRowView } from "./TraceEventRow.js";

const TYPES = [
  "agent_run",
  "provider_call",
  "job_event",
  "state_transition",
  "user_action",
] as const;

type TraceTypeFilter = (typeof TYPES)[number] | "all";

export function TraceDrawer({ workspaceId }: { workspaceId: string }) {
  const { data, fetchNextPage, hasNextPage } = useTraceStream(workspaceId);
  const [filter, setFilter] = useState<TraceTypeFilter>("all");
  const rows = (data?.pages ?? []).flatMap((p) => p.data);
  const filtered =
    filter === "all" ? rows : rows.filter((r) => r.traceType === filter);
  return (
    <div className="trace-drawer">
      <header className="trace-drawer__filters">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as TraceTypeFilter)}
        >
          <option value="all">全部</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </header>
      <ul className="trace-drawer__list">
        {filtered.map((r) => (
          <TraceEventRowView key={r.id} row={r} />
        ))}
      </ul>
      {hasNextPage ? (
        <button
          className="trace-drawer__more"
          onClick={() => fetchNextPage()}
        >
          加载更多
        </button>
      ) : null}
    </div>
  );
}
