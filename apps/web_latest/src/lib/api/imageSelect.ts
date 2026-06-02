import { fetchJson, type WorkflowEnvelope } from "./client.js";

export function selectImage(
  workspaceId: string,
  shotId: string,
  body: { imageCandidateId: string; imageGenerationBatchId?: string },
) {
  return fetchJson<WorkflowEnvelope<{ selectedImageId: string }>>(
    `/api/workspaces/${workspaceId}/shots/${shotId}/image-candidates/select`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
