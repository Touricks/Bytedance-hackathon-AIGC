import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateVideoWithSeedance } from "./seedance-video.provider.js";

describe("generateVideoWithSeedance", () => {
  it("falls back to the mock final video when Seedance is not configured", async () => {
    const result = await generateVideoWithSeedance(
      {
        imageUrl: "/mocks/products/demo-product.svg",
        prompt: "test prompt"
      },
      { apiUrl: "", apiKey: "" }
    );

    assert.equal(result.provider, "mock");
    assert.match(result.videoUrl, /\.mp4/);
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
});
