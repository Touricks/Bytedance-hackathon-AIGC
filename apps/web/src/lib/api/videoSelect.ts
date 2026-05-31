import { fetchJson, type WorkflowEnvelope } from "./client.js";

export function selectVideo(
  workspaceId: string,
  shotId: string,
  body: { videoCandidateId: string; videoGenerationBatchId?: string },
) {
  return fetchJson<WorkflowEnvelope<{ selectedVideoId: string }>>(
    `/api/workspaces/${workspaceId}/shots/${shotId}/video-candidates/select`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
