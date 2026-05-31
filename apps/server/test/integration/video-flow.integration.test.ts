// @expensive — full video flow; per-video takes ~1–5 min, so this suite can take 5–15 min.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { seedWorkspace, seedShotWithSelectedImage, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";
const ALLOW = process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("video flow @expensive", { skip: !RUN || !ALLOW }, () => {
  let ws: SeededWorkspace;
  let ctx: Awaited<ReturnType<typeof seedShotWithSelectedImage>>;

  before(async () => {
    ws = await seedWorkspace({ label: `it-vid-${Date.now()}` });
    ctx = await seedShotWithSelectedImage(ws, 0);
  });
  after(async () => { await ws?.cleanup(); });

  it("propose script -> generate 2 candidates -> select first", async () => {
    const script = await api<{
      data: { id: string; durationSec: number };
      batch: { id: string; status: string; succeededCount: number };
      candidates: Array<{ id: string; videoUrl: string; status: string }>;
    }>(
      `/api/workspaces/${ws.workspaceId}/shots/${ctx.shotId}/video-scripts/propose`,
      { method: "POST", body: JSON.stringify({}) },
    );
    assert.equal(script.data.durationSec, 4);
    assert.notEqual(script.batch.status, "FAILED");
    assert.ok(script.batch.succeededCount >= 1);

    const pick = script.candidates.find((c) => c.status === "SUCCEEDED" && c.videoUrl);
    assert.ok(pick && /^https?:\/\//.test(pick.videoUrl));

    const sel = await api<{ shotStatus: string }>(
      `/api/workspaces/${ws.workspaceId}/shots/${ctx.shotId}/video-candidates/select`,
      { method: "POST", body: JSON.stringify({ videoCandidateId: pick!.id, videoGenerationBatchId: script.batch.id }) },
    );
    assert.equal(sel.shotStatus, "VIDEO_SELECTED");
  });
});
