import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { listWorkspaceShotSets } from "./shots.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("shot set api client", () => {
  it("lists active workspace shot sets without archived query params", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/shot-sets",
      );
      assert.equal(init?.method ?? "GET", "GET");
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "shot_set_active",
              workspaceId: "workspace_123",
              shotPromptArtifactId: "shotprompt_current",
              status: "active",
              sourceFingerprint: {
                shotPromptArtifactId: "shotprompt_current",
              },
              upstream: {
                upstreamChanged: false,
                changedSources: [],
              },
              shotCount: 3,
              createdAt: "2026-06-02T00:00:00.000Z",
              archivedAt: null,
            },
          ],
        }),
        { status: 200 },
      );
    };

    const result = await listWorkspaceShotSets("workspace_123");

    assert.equal(result.data[0]?.id, "shot_set_active");
    assert.equal(result.data[0]?.shotCount, 3);
  });
});
