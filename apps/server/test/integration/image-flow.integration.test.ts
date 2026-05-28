// @provider — runs against a live API server with real Ark text + image keys.
// Gated by RUN_REAL_PROVIDER_TESTS=true (the test runner script enforces this).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";

describe("image flow @provider", { skip: !RUN }, () => {
  it("propose prompt -> generate batch -> select image", async () => {
    const ws = await api<{ data: { id: string } }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: `it-image-${Date.now()}` }),
    });

    // NOTE: This integration test assumes upstream brief/storyboard/shotprompt
    // approval has seeded a DRAFT shot named "shot-1" in the workspace.
    // A future seed helper (test/helpers/seed-workspace.ts) will fold the
    // brief→storyboard→shotprompt path into this setup.
    const shotId = "shot-1";

    const proposal = await api<{ data: { id: string; promptText: string } }>(
      `/api/workspaces/${ws.data.id}/shots/${shotId}/image-prompts/propose`,
      {
        method: "POST",
        body: JSON.stringify({ referenceAssetIds: [], userHint: "lifestyle vibe" }),
      },
    );
    assert.ok(proposal.data.promptText.length > 20);

    const batch = await api<{ data: { batchId: string } }>(
      `/api/shots/${shotId}/image-batches`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `it-${Date.now()}` },
        body: JSON.stringify({
          imagePromptArtifactId: proposal.data.id,
          count: 3,
          aspectRatio: "9:16",
        }),
      },
    );

    const final = await pollUntil({
      label: "image batch",
      intervalMs: 3000,
      timeoutMs: 240000,
      fetcher: () =>
        api<{
          data: {
            status: string;
            candidates: Array<{ id: string; imageUrl: string }>;
          };
        }>(`/api/shots/${shotId}/image-batches/${batch.data.batchId}`),
      isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
    });
    assert.notEqual(final.data.status, "FAILED");
    assert.ok(final.data.candidates.length > 0);

    const pick = final.data.candidates.find((c) => c.imageUrl);
    assert.ok(pick && /^https?:\/\//.test(pick.imageUrl));

    const selected = await api<{ shotStatus: string }>(
      `/api/shots/${shotId}/selected-image`,
      {
        method: "POST",
        body: JSON.stringify({
          imageCandidateId: pick!.id,
          imageGenerationBatchId: batch.data.batchId,
        }),
      },
    );
    assert.equal(selected.shotStatus, "IMAGE_SELECTED");
  });
});
