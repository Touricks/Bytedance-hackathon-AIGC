import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import {
  fetchJson,
  type AspectRatio,
  type WorkflowEnvelope,
} from "./client.js";

export type OneClickFinalVideoStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface OneClickFinalVideoJob {
  id: string;
  workspaceId: string;
  status: OneClickFinalVideoStatus;
  currentStage: string;
  stageState: Record<string, unknown>;
  materialIntakeArtifactId: string | null;
  productBriefArtifactId: string | null;
  storyboardArtifactId: string | null;
  shotPromptArtifactId: string | null;
  shotSetId: string | null;
  finalVideoJobId: string | null;
  autoSelectionStrategy: "first_success";
  outputAspectRatio: AspectRatio;
  errorCode: string | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function createOneClickFinalVideo(
  workspaceId: string,
  body: {
    materialIntake: { data: MaterialIntakeArtifact };
    outputAspectRatio?: AspectRatio;
    autoSelectionStrategy?: "first_success";
  },
  idempotencyKey: string,
) {
  return fetchJson<WorkflowEnvelope<OneClickFinalVideoJob>>(
    `/api/workspaces/${workspaceId}/one-click-final-videos`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    },
  );
}

export function getOneClickFinalVideo(jobId: string) {
  return fetchJson<{ data: OneClickFinalVideoJob }>(
    `/api/one-click-final-videos/${jobId}`,
  );
}

export function listOneClickFinalVideos(workspaceId: string) {
  return fetchJson<{ data: OneClickFinalVideoJob[] }>(
    `/api/workspaces/${workspaceId}/one-click-final-videos`,
  );
}
