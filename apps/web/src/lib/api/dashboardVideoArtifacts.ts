import type { CreativeFactors } from "@aigc-video/shared";
import { fetchJson } from "./client.js";

export interface DashboardVideoArtifact {
  id: string;
  workspaceId: string;
  finalVideoJobId: string | null;
  name: string;
  localUrl: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  creativeTags: unknown;
  creativeFactors: CreativeFactors | null;
  metadata: unknown;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportDashboardVideoArtifactRequest {
  finalVideoJobId: string;
  name: string;
}

export function importDashboardVideoArtifact(
  workspaceId: string,
  body: ImportDashboardVideoArtifactRequest,
) {
  return fetchJson<{ data: DashboardVideoArtifact }>(
    `/api/workspaces/${workspaceId}/dashboard/videos`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function listDashboardVideoArtifacts(workspaceId: string) {
  return fetchJson<{ data: DashboardVideoArtifact[] }>(
    `/api/workspaces/${workspaceId}/dashboard/videos`,
  );
}

export function listGlobalDashboardVideoArtifacts() {
  return fetchJson<{ data: DashboardVideoArtifact[] }>("/api/dashboard/videos");
}
