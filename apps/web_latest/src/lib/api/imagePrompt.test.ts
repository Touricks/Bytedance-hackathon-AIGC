import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { regenerateImagePrompt } from "./imagePrompt.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("image prompt api client", () => {
  it("regenerates image prompts with user feedback instead of final prompt JSON", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/shots/shot_1/image-prompts/regenerate",
      );
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        baseArtifactId: "art_img_base",
        userDirection: "入口标识更清晰",
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "art_img_next",
            shotId: "shot_1",
            version: 2,
            status: "ACTIVE",
            promptText: "重新生成后的分镜图提示",
            negativePrompt: null,
            referenceAssetIds: [],
            createdBy: "user",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
          artifact: {
            id: "art_img_next",
            shotId: "shot_1",
            version: 2,
            status: "ACTIVE",
            promptText: "重新生成后的分镜图提示",
            negativePrompt: null,
            referenceAssetIds: [],
            createdBy: "user",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
          batch: {},
          candidates: [],
        }),
        { status: 200 },
      );
    };

    const result = await regenerateImagePrompt("workspace_123", "shot_1", {
      baseArtifactId: "art_img_base",
      userDirection: "入口标识更清晰",
    });

    assert.equal(result.data.id, "art_img_next");
  });
});
