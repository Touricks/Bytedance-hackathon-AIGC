import type { TraceEventRow } from "../../../lib/api/trace.js";

export function TraceEventRowView({ row }: { row: TraceEventRow }) {
  return (
    <li className={`trace-row trace-row--${row.traceType}`}>
      <div className="trace-row__head">
        <span className="trace-row__type">{row.traceType}</span>
        <span className="trace-row__name">{row.name}</span>
        <span className="trace-row__time">
          {new Date(row.createdAt).toLocaleTimeString()}
        </span>
      </div>
      {row.outputPreview ? (
        <pre className="trace-row__preview">{row.outputPreview}</pre>
      ) : null}
    </li>
  );
}
