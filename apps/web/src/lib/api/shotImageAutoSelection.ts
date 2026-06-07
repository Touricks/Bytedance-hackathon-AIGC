import { fetchJson, type WorkflowEnvelope } from "./client.js";

export type ShotImageAutoSelectionStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface ShotImageAutoSelectionJob {
  id: string;
  workspaceId: string;
  status: ShotImageAutoSelectionStatus;
  currentStage: string;
  stageState: Record<string, unknown>;
  shotSetId: string | null;
  candidateCount: number;
  autoSelectionStrategy: "first_success";
  errorCode: string | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function createShotImageAutoSelection(
  workspaceId: string,
  body: { candidateCount?: number },
  idempotencyKey: string,
) {
  return fetchJson<WorkflowEnvelope<ShotImageAutoSelectionJob>>(
    `/api/workspaces/${workspaceId}/shot-image-auto-selections`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    },
  );
}

export function getShotImageAutoSelection(jobId: string) {
  return fetchJson<{ data: ShotImageAutoSelectionJob }>(
    `/api/shot-image-auto-selections/${jobId}`,
  );
}

export function listShotImageAutoSelections(workspaceId: string) {
  return fetchJson<{ data: ShotImageAutoSelectionJob[] }>(
    `/api/workspaces/${workspaceId}/shot-image-auto-selections`,
  );
}
