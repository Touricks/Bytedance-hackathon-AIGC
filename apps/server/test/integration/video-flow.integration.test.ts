// @expensive — full video flow; per-video takes ~1–5 min, so this suite can take 5–15 min.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";
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
    const script = await api<{ data: { id: string; durationSec: number } }>(
      `/api/workspaces/${ws.workspaceId}/shots/${ctx.shotId}/video-scripts/propose`,
      { method: "POST", body: JSON.stringify({ durationSec: 4, useNeighborFrames: true }) },
    );
    assert.equal(script.data.durationSec, 4);

    const batch = await api<{ data: { batchId: string } }>(
      `/api/shots/${ctx.shotId}/video-batches`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `it-vid-${ctx.shotId}-${Date.now()}` },
        body: JSON.stringify({ videoScriptArtifactId: script.data.id, count: 2, aspectRatio: "9:16" }),
      },
    );

    const final = await pollUntil({
      label: "video batch",
      intervalMs: 8000,
      timeoutMs: 15 * 60_000,
      fetcher: () =>
        api<{ data: { status: string; succeededCount: number; candidates: Array<{ id: string; videoUrl: string; status: string }> } }>(
          `/api/shots/${ctx.shotId}/video-batches/${batch.data.batchId}`,
        ),
      isDone: (v) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(v.data.status),
    });
    assert.notEqual(final.data.status, "FAILED");
    assert.ok(final.data.succeededCount >= 1);

    const pick = final.data.candidates.find((c) => c.status === "SUCCEEDED" && c.videoUrl);
    assert.ok(pick && /^https?:\/\//.test(pick.videoUrl));

    const sel = await api<{ shotStatus: string }>(
      `/api/shots/${ctx.shotId}/selected-video`,
      { method: "POST", body: JSON.stringify({ videoCandidateId: pick!.id, videoGenerationBatchId: batch.data.batchId }) },
    );
    assert.equal(sel.shotStatus, "VIDEO_SELECTED");
  });
});
