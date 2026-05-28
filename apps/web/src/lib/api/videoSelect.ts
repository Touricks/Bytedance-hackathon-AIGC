import { fetchJson, type WorkflowEnvelope } from "./client.js";

export function selectVideo(
  shotId: string,
  body: { videoCandidateId: string; videoGenerationBatchId: string },
) {
  return fetchJson<WorkflowEnvelope<{ selectedVideoId: string }>>(
    `/api/shots/${shotId}/selected-video`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
