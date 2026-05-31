// @expensive — runs image + video for every shot, then composes. Can take 20–40 min for a 4-shot workspace.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";
import { seedWorkspace, seedShotWithSelectedImage, type SeededWorkspace } from "../helpers/seed-workspace.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";
const ALLOW = process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("final compose @expensive", { skip: !RUN || !ALLOW }, () => {
  let ws: SeededWorkspace;

  before(async () => {
    ws = await seedWorkspace({ label: `it-final-${Date.now()}` });
    // Per-shot: image-select, then video-script propose directly returns candidates.
    for (let i = 0; i < ws.shotIds.length; i++) {
      const ctx = await seedShotWithSelectedImage(ws, i);
      const script = await api<{
        batch: { id: string };
        candidates: Array<{ id: string; videoUrl: string; status: string }>;
      }>(
        `/api/workspaces/${ws.workspaceId}/shots/${ctx.shotId}/video-scripts/propose`,
        { method: "POST", body: JSON.stringify({}) },
      });
      const pick = script.candidates.find((c) => c.status === "SUCCEEDED" && c.videoUrl);
      assert.ok(pick, `shot ${i} produced no video`);
      await api(`/api/workspaces/${ws.workspaceId}/shots/${ctx.shotId}/video-candidates/select`, {
        method: "POST",
        body: JSON.stringify({ videoCandidateId: pick!.id, videoGenerationBatchId: script.batch.id }),
      });
    }
  });
  after(async () => { await ws?.cleanup(); });

  it("composes and produces a deterministic manifest hash across two runs", async () => {
    async function compose(label: string) {
      const start = await api<{ data: { finalVideoJobId: string } }>(
        `/api/workspaces/${ws.workspaceId}/final-videos`,
        {
          method: "POST",
          headers: { "Idempotency-Key": `it-${label}-${Date.now()}` },
          body: JSON.stringify({ outputAspectRatio: "9:16" }),
        },
      );
      const done = await pollUntil({
        label,
        intervalMs: 4000,
        timeoutMs: 10 * 60_000,
        fetcher: () =>
          api<{ data: { status: string; compiledManifestHash: string | null; localUrl: string | null } }>(
            `/api/final-videos/${start.data.finalVideoJobId}`,
          ),
        isDone: (v) => ["SUCCEEDED", "FAILED"].includes(v.data.status),
      });
      assert.equal(done.data.status, "SUCCEEDED");
      assert.ok(done.data.compiledManifestHash?.startsWith("sha256:"));
      return done.data;
    }
    const r1 = await compose("run-1");
    const r2 = await compose("run-2");
    assert.equal(r2.compiledManifestHash, r1.compiledManifestHash, "manifest hash should be deterministic");
  });
});
