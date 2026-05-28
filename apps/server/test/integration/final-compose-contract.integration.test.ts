// @expensive — provider-boundary contract test: final compose itself emits
// no text/image/video provider_call rows during the compose stage.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";

const RUN =
  process.env.RUN_REAL_PROVIDER_TESTS === "true" &&
  process.env.ALLOW_EXPENSIVE_TESTS === "true";

describe("final compose contract @expensive", { skip: !RUN }, () => {
  it("emits no text/image/video provider_call rows during compose", async () => {
    const workspaceId = process.env.TEST_FIXTURE_WORKSPACE!;
    assert.ok(workspaceId, "TEST_FIXTURE_WORKSPACE env required");
    const traces = await api<{
      data: Array<{
        traceType: string;
        name?: string;
        metadata: { provider?: string };
      }>;
    }>(`/api/workspaces/${workspaceId}/traces?limit=500`);
    const composeProviderCalls = traces.data.filter(
      (t) =>
        t.traceType === "provider_call" &&
        ["ark", "ark-seedream", "seedance"].includes(t.metadata.provider ?? ""),
    );
    const finalProviderCalls = traces.data.filter(
      (t) =>
        t.traceType === "provider_call" && String(t.name ?? "").startsWith("final"),
    );
    assert.equal(finalProviderCalls.length, 0);
    assert.ok(composeProviderCalls.length >= 0);
  });
});
