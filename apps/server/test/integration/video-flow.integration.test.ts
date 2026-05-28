// @expensive — runs against a live API server with real Ark + Seedance keys.
// Each video can take 1-5 minutes. Gated by ALLOW_EXPENSIVE_TESTS=true.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";

const RUN =
  process.env.RUN_REAL_PROVIDER_TESTS === "true" &&
  process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("video flow @expensive", { skip: !RUN }, () => {
  it("propose script -> generate batch -> select video", async () => {
    const ws = await api<{ data: { id: string } }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: `it-video-${Date.now()}` }),
    });

    // NOTE: This test assumes upstream image flow already completed and a shot
    // exists with state IMAGE_SELECTED. A future seed helper will provide this.
    const shotId = "shot-1";

    const proposal = await api<{ data: { id: string; version: number } }>(
      `/api/workspaces/${ws.data.id}/shots/${shotId}/video-scripts/propose`,
      {
        method: "POST",
        body: JSON.stringify({
          durationSec: 4,
          useNeighborFrames: true,
          userHint: "smooth product reveal",
        }),
      },
    );
    assert.ok(proposal.data.id);

    const batch = await api<{ data: { batchId: string } }>(
      `/api/shots/${shotId}/video-batches`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `it-vid-${Date.now()}` },
        body: JSON.stringify({
          videoScriptArtifactId: proposal.data.id,
          count: 2,
          aspectRatio: "9:16",
        }),
      },
    );

    const final = await pollUntil({
      label: "video batch",
      intervalMs: 5000,
      timeoutMs: 10 * 60_000,
      fetcher: () =>
        api<{
          data: {
            status: string;
            candidates: Array<{ id: string; videoUrl: string | null }>;
          };
        }>(`/api/shots/${shotId}/video-batches/${batch.data.batchId}`),
      isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
    });
    assert.notEqual(final.data.status, "FAILED");
    const pick = final.data.candidates.find((c) => c.videoUrl);
    assert.ok(pick, "expected at least one successful video candidate");

    const selected = await api<{ shotStatus: string }>(
      `/api/shots/${shotId}/selected-video`,
      {
        method: "POST",
        body: JSON.stringify({
          videoCandidateId: pick!.id,
          videoGenerationBatchId: batch.data.batchId,
        }),
      },
    );
    assert.equal(selected.shotStatus, "VIDEO_SELECTED");
  });
});
