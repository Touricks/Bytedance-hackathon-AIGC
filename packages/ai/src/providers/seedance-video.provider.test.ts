import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateVideoWithSeedance } from "./seedance-video.provider.js";

describe("generateVideoWithSeedance", () => {
  it("falls back to the mock final video when Seedance is not configured", async () => {
    const originalMockUrl = process.env.MOCK_FINAL_VIDEO_URL;
    delete process.env.MOCK_FINAL_VIDEO_URL;

    try {
      const result = await generateVideoWithSeedance(
        {
          imageUrl: "/mocks/products/demo-product.svg",
          prompt: "test prompt"
        },
        { apiUrl: "", apiKey: "" }
      );

      assert.equal(result.provider, "mock");
      assert.equal(result.videoUrl, "/mocks/videos/fallback-flower.mp4");
    } finally {
      if (originalMockUrl === undefined) {
        delete process.env.MOCK_FINAL_VIDEO_URL;
      } else {
        process.env.MOCK_FINAL_VIDEO_URL = originalMockUrl;
      }
    }
  });

  it("calls the configured Seedance image-to-video endpoint", async () => {
    const calls: Array<{ url: string; body: unknown; authorization?: string }> = [];

    const result = await generateVideoWithSeedance(
      {
        imageUrl: "/uploads/product-images/demo.png",
        prompt: "Create a vertical ecommerce product showcase video"
      },
      {
        apiUrl: "https://seedance.example/generate",
        apiKey: "test-key",
        model: "seedance-test-model",
        fetch: async (url, init) => {
          calls.push({
            url: String(url),
            body: JSON.parse(String(init?.body)),
            authorization: new Headers(init?.headers).get("authorization") ?? undefined
          });
          return new Response(
            JSON.stringify({ videoUrl: "https://cdn.example/video.mp4" }),
            { status: 200 }
          );
        }
      }
    );

    assert.equal(result.provider, "seedance");
    assert.equal(result.videoUrl, "https://cdn.example/video.mp4");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://seedance.example/generate");
    assert.equal(calls[0]!.authorization, "Bearer test-key");
    assert.deepEqual(calls[0]!.body, {
      model: "seedance-test-model",
      image_url: "/uploads/product-images/demo.png",
      prompt: "Create a vertical ecommerce product showcase video",
      duration: 12,
      aspect_ratio: "9:16"
    });
  });

  it("fails loudly in real-provider mode when Seedance credentials are missing", async () => {
    const originalMode = process.env.MODEL_MODE;
    process.env.MODEL_MODE = "real";

    try {
      await assert.rejects(
        () =>
          generateVideoWithSeedance(
            {
              imageUrl: "/mocks/products/demo-product.svg",
              prompt: "test prompt"
            },
            { apiUrl: "", apiKey: "" }
          ),
        /real-provider mode requires Seedance config/
      );
    } finally {
      if (originalMode === undefined) {
        delete process.env.MODEL_MODE;
      } else {
        process.env.MODEL_MODE = originalMode;
      }
    }
  });
});
