import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createShotImageAutoSelection } from "./shotImageAutoSelection.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("shot image auto-selection api client", () => {
  it("creates an auto-selection job with candidate count and idempotency key", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/shot-image-auto-selections",
      );
      assert.equal(init?.method, "POST");
      assert.equal((init?.headers as Record<string, string>)["Idempotency-Key"], "key_123");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        candidateCount: 4,
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "sias_123",
            workspaceId: "workspace_123",
            status: "PENDING",
            currentStage: "image_selection",
            stageState: {},
            shotSetId: "shotset_1",
            candidateCount: 4,
            autoSelectionStrategy: "first_success",
            errorCode: null,
            errorMessage: null,
            idempotencyKey: "key_123",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
            startedAt: null,
            completedAt: null,
          },
        }),
        { status: 200 },
      );
    };

    const result = await createShotImageAutoSelection(
      "workspace_123",
      { candidateCount: 4 },
      "key_123",
    );

    assert.equal(result.data.id, "sias_123");
  });
});
