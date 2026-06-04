import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { finalVideoDownloadUrl, listFinalVideos } from "./finalVideo.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("final video api client", () => {
  it("lists workspace final videos for restoring the latest compose job", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
      });
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "fv_1",
              workspaceId: "workspace_123",
              status: "SUCCEEDED",
              localUrl: "/api/workspaces/workspace_123/final-videos/fv_1/file",
              durationSec: 12,
              compiledManifestHash: "hash",
              errorMessage: null,
              createdAt: "2026-06-03T00:00:00.000Z",
            },
          ],
        }),
        { status: 200 },
      );
    };

    const result = await listFinalVideos("workspace_123");

    assert.equal(result.data[0]?.id, "fv_1");
    assert.deepEqual(calls, [
      {
        method: "GET",
        url: "http://localhost:3000/api/workspaces/workspace_123/final-videos",
      },
    ]);
  });

  it("builds an attachment download URL without changing the preview URL", () => {
    assert.equal(
      finalVideoDownloadUrl("/api/workspaces/ws/final-videos/fv/file"),
      "/api/workspaces/ws/final-videos/fv/file?download=1",
    );
    assert.equal(
      finalVideoDownloadUrl("/api/workspaces/ws/final-videos/fv/file?token=abc"),
      "/api/workspaces/ws/final-videos/fv/file?token=abc&download=1",
    );
  });
});
