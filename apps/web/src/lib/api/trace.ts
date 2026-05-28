import { fetchJson } from "./client.js";

export interface TraceEventRow {
  id: string;
  workspaceId: string;
  shotId: string | null;
  traceType:
    | "agent_run"
    | "provider_call"
    | "job_event"
    | "state_transition"
    | "user_action";
  name: string;
  inputPreview: string | null;
  outputPreview: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function listWorkspaceTraces(
  workspaceId: string,
  params: { limit?: number; cursor?: string } = {},
) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  return fetchJson<{ data: TraceEventRow[] }>(
    `/api/workspaces/${workspaceId}/traces${qs.toString() ? `?${qs}` : ""}`,
  );
}

export function listShotTraces(
  shotId: string,
  params: { limit?: number; cursor?: string } = {},
) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  return fetchJson<{ data: TraceEventRow[] }>(
    `/api/shots/${shotId}/traces${qs.toString() ? `?${qs}` : ""}`,
  );
}
