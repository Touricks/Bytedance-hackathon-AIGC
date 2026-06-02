// Disabled: seeded refresh recovery currently walks the upstream real-provider module chain.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { seedWorkspace, type SeededWorkspace } from "../helpers/seed-workspace.js";

describe("refresh recovery @disabled", { skip: true }, () => {
  let ws: SeededWorkspace;
  before(async () => { ws = await seedWorkspace({ label: `it-refresh-${Date.now()}` }); });
  after(async () => { await ws?.cleanup(); });

  it("shot-workflow-status returns one row per seeded shot with status + nextAction", async () => {
    const res = await api<{
      data: {
        workspaceId: string;
        shots: Array<{ shotId: string; orderIndex: number; status: string; nextAction: string; activeImageBatchId?: string | null }>;
        canComposeFinalVideo: boolean;
      };
    }>(`/api/workspaces/${ws.workspaceId}/shot-workflow-status`);

    assert.equal(res.data.workspaceId, ws.workspaceId);
    assert.equal(res.data.shots.length, ws.shotIds.length);
    for (const s of res.data.shots) {
      assert.equal(typeof s.status, "string");
      assert.equal(typeof s.nextAction, "string");
    }
    assert.equal(res.data.canComposeFinalVideo, false);
  });
});
