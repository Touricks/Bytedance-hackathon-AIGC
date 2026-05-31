// @provider — full image flow against real Ark image API, seeded via the upstream V1 flow.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { seedWorkspace, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";

describe("image flow @provider", { skip: !RUN }, () => {
  let ws: SeededWorkspace;
  before(async () => { ws = await seedWorkspace({ label: `it-img-${Date.now()}` }); });
  after(async () => { await ws?.cleanup(); });

  it("propose prompt -> generate 3 candidates -> select first", async () => {
    const shotId = ws.shotIds[0];
    assert.ok(shotId, "seeded workspace had no shots");

    const proposal = await api<{
      data: { id: string; promptText: string };
      batch: { id: string; status: string; succeededCount: number };
      candidates: Array<{ id: string; imageUrl: string; status: string }>;
    }>(
      `/api/workspaces/${ws.workspaceId}/shots/${shotId}/image-prompts/propose`,
      { method: "POST", body: JSON.stringify({ userDirection: "warm office lighting" }) },
    );
    assert.ok(proposal.data.promptText.length > 20);
    assert.notEqual(proposal.batch.status, "FAILED");
    assert.ok(proposal.batch.succeededCount >= 1);
    const pick = proposal.candidates.find((c) => c.status === "SUCCEEDED" && c.imageUrl);
    assert.ok(pick && /^https?:\/\//.test(pick.imageUrl));

    const sel = await api<{ shotStatus: string }>(
      `/api/workspaces/${ws.workspaceId}/shots/${shotId}/image-candidates/select`,
      { method: "POST", body: JSON.stringify({ imageCandidateId: pick!.id, imageGenerationBatchId: proposal.batch.id }) },
    );
    assert.equal(sel.shotStatus, "IMAGE_SELECTED");
  });
});
