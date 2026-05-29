import { fetchJson, type WorkflowEnvelope } from "./client.js";

export function selectImage(
  shotId: string,
  body: { imageCandidateId: string; imageGenerationBatchId: string },
) {
  return fetchJson<WorkflowEnvelope<{ selectedImageId: string }>>(
    `/api/shots/${shotId}/selected-image`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function getSelectedImage(shotId: string) {
  return fetchJson<{
    data: { imageCandidateId: string; imageGenerationBatchId: string } | null;
  }>(`/api/shots/${shotId}/selected-image`);
}
