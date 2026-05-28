// @expensive — requires a fully primed workspace with selected videos per shot
// AND a worker running ffmpeg. Gated by ALLOW_EXPENSIVE_TESTS=true.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";
import { pollUntil } from "../helpers/poll.js";

const RUN =
  process.env.RUN_REAL_PROVIDER_TESTS === "true" &&
  process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("final compose @expensive", { skip: !RUN }, () => {
  it("composes and produces deterministic manifest hash across two runs", async () => {
    const workspaceId = process.env.TEST_FIXTURE_WORKSPACE!;
    assert.ok(workspaceId, "TEST_FIXTURE_WORKSPACE env required");

    const r1 = await api<{ data: { finalVideoJobId: string } }>(
      `/api/workspaces/${workspaceId}/final-videos`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `run-1-${Date.now()}` },
        body: JSON.stringify({}),
      },
    );
    const done1 = await pollUntil({
      label: "final compose 1",
      intervalMs: 5000,
      timeoutMs: 10 * 60_000,
      fetcher: () =>
        api<{
          data: { status: string; compiledManifestHash: string | null };
        }>(`/api/final-videos/${r1.data.finalVideoJobId}`),
      isDone: (v) => ["SUCCEEDED", "FAILED"].includes(v.data.status),
    });
    assert.equal(done1.data.status, "SUCCEEDED");
    assert.match(done1.data.compiledManifestHash ?? "", /^sha256:/);

    const r2 = await api<{ data: { finalVideoJobId: string } }>(
      `/api/workspaces/${workspaceId}/final-videos`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `run-2-${Date.now()}` },
        body: JSON.stringify({}),
      },
    );
    const done2 = await pollUntil({
      label: "final compose 2",
      intervalMs: 5000,
      timeoutMs: 10 * 60_000,
      fetcher: () =>
        api<{
          data: { status: string; compiledManifestHash: string | null };
        }>(`/api/final-videos/${r2.data.finalVideoJobId}`),
      isDone: (v) => ["SUCCEEDED", "FAILED"].includes(v.data.status),
    });
    assert.equal(done2.data.compiledManifestHash, done1.data.compiledManifestHash);
  });
});
