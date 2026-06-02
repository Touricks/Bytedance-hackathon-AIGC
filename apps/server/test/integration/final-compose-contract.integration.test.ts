// Disabled: final compose contract acceptance is a multi-real-model integration test.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";
import { seedWorkspace, seedShotWithSelectedImage, type SeededWorkspace } from "../helpers/seed-workspace.js";

interface TraceEventLite {
  traceType: string;
  name: string;
  createdAt: string;
  metadata: unknown;
}

describe("final compose contract @disabled", { skip: true }, () => {
  let ws: SeededWorkspace;
  let composeStartedAt = 0;
  let composeFinishedAt = 0;

  before(async () => {
    ws = await seedWorkspace({ label: `it-contract-${Date.now()}` });
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

  it("emits no text/image/video provider_call events during compose", async () => {
    composeStartedAt = Date.now();
    const start = await api<{ data: { finalVideoJobId: string } }>(
      `/api/workspaces/${ws.workspaceId}/final-videos`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `it-contract-${Date.now()}` },
        body: JSON.stringify({ outputAspectRatio: "9:16" }),
      },
    );
    await pollUntil({
      label: "final compose",
      intervalMs: 4000,
      timeoutMs: 10 * 60_000,
      fetcher: () => api<{ data: { status: string } }>(`/api/final-videos/${start.data.finalVideoJobId}`),
      isDone: (v) => ["SUCCEEDED", "FAILED"].includes(v.data.status),
    });
    composeFinishedAt = Date.now();

    // Traces endpoint returns TraceEventRow[] directly (NOT wrapped in {data: [...]}).
    const traces = await api<TraceEventLite[]>(`/api/workspaces/${ws.workspaceId}/traces?limit=500`);
    const duringCompose = traces.filter((t) => {
      const ts = new Date(t.createdAt).getTime();
      return ts >= composeStartedAt && ts <= composeFinishedAt + 5_000;
    });
    const offendingProviderCalls = duringCompose.filter(
      (t) =>
        t.traceType === "provider_call" &&
        ["ark", "ark-seedream", "seedance"].includes(String((t.metadata as Record<string, unknown> | null)?.provider ?? "")),
    );
    assert.equal(
      offendingProviderCalls.length,
      0,
      `unexpected provider_call rows: ${JSON.stringify(offendingProviderCalls)}`,
    );
  });
});
