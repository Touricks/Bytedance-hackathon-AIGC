// @smoke — relies on a primed workspace fixture but does not invoke any
// real provider; it only inspects the shot-workflow-status endpoint shape.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api } from "../helpers/api-client.js";

const RUN = process.env.RUN_REAL_PROVIDER_TESTS === "true";

describe("refresh recovery @smoke", { skip: !RUN }, () => {
  it("shot-workflow-status carries enough state to resume polling", async () => {
    const workspaceId = process.env.TEST_FIXTURE_WORKSPACE!;
    assert.ok(workspaceId, "TEST_FIXTURE_WORKSPACE env required");
    const res = await api<{
      data: {
        shots: Array<{
          shotId: string;
          status: string;
          nextAction: string;
          activeImageBatchId?: string;
        }>;
      };
    }>(`/api/workspaces/${workspaceId}/shot-workflow-status`);
    assert.ok(Array.isArray(res.data.shots));
    for (const s of res.data.shots) {
      assert.equal(typeof s.status, "string");
      assert.equal(typeof s.nextAction, "string");
    }
  });
});
