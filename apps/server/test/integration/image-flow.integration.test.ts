// @provider — full image flow against real Ark image API, seeded via the upstream V1 flow.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";
import { seedWorkspace, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";

describe("image flow @provider", { skip: !RUN }, () => {
  let ws: SeededWorkspace;
  before(async () => { ws = await seedWorkspace({ label: `it-img-${Date.now()}` }); });
  after(async () => { await ws?.cleanup(); });

  it("propose prompt -> generate 3 candidates -> select first", async () => {
    const shotId = ws.shotIds[0];
    assert.ok(shotId, "seeded workspace had no shots");

    const proposal = await api<{ data: { id: string; promptText: string } }>(
      `/api/workspaces/${ws.workspaceId}/shots/${shotId}/image-prompts/propose`,
      { method: "POST", body: JSON.stringify({ referenceAssetIds: ws.materialAssetIds, userHint: "warm office lighting" }) },
    );
    assert.ok(proposal.data.promptText.length > 20);

    const batch = await api<{ data: { batchId: string } }>(
      `/api/shots/${shotId}/image-batches`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `it-${shotId}-${Date.now()}` },
        body: JSON.stringify({ imagePromptArtifactId: proposal.data.id, count: 3, aspectRatio: "9:16" }),
      },
    );

    const final = await pollUntil({
      label: "image batch",
      intervalMs: 3000,
      timeoutMs: 4 * 60_000,
      fetcher: () =>
        api<{ data: { status: string; succeededCount: number; candidates: Array<{ id: string; imageUrl: string; status: string }> } }>(
          `/api/shots/${shotId}/image-batches/${batch.data.batchId}`,
        ),
      isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
    });

    assert.notEqual(final.data.status, "FAILED");
    assert.ok(final.data.succeededCount >= 1);
    const pick = final.data.candidates.find((c) => c.status === "SUCCEEDED" && c.imageUrl);
    assert.ok(pick && /^https?:\/\//.test(pick.imageUrl));

    const sel = await api<{ shotStatus: string }>(
      `/api/shots/${shotId}/selected-image`,
      { method: "POST", body: JSON.stringify({ imageCandidateId: pick!.id, imageGenerationBatchId: batch.data.batchId }) },
    );
    assert.equal(sel.shotStatus, "IMAGE_SELECTED");
  });
});
