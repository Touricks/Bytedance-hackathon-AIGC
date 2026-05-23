import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateVideoWithSeedance } from "./seedance-video.provider.js";

describe("generateVideoWithSeedance", () => {
  it("falls back to the mock final video when Ark video is not configured", async () => {
    const originalMockUrl = process.env.MOCK_FINAL_VIDEO_URL;
    delete process.env.MOCK_FINAL_VIDEO_URL;

    try {
      const result = await generateVideoWithSeedance(
        {
          imageUrl: "/mocks/products/demo-product.svg",
          prompt: "test prompt"
        },
        { env: {} }
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

  it("calls the configured Ark video endpoint for Seedance image-to-video", async () => {
    const calls: Array<{ url: string; body: unknown; authorization?: string }> = [];

    const result = await generateVideoWithSeedance(
      {
        imageUrl: "/uploads/product-images/demo.png",
        prompt: "Create a vertical ecommerce product showcase video"
      },
      {
        baseURL: "https://ark.example/api/v3",
        env: {
          ARK_API_KEY: "test-key",
          ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
        },
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
    assert.equal(
      calls[0]!.url,
      "https://ark.example/api/v3/contents/generations/tasks"
    );
    assert.equal(calls[0]!.authorization, "Bearer test-key");
    assert.deepEqual(calls[0]!.body, {
      model: "ark-video-endpoint",
      content: [
        {
          type: "text",
          text: "Create a vertical ecommerce product showcase video"
        },
        {
          type: "image_url",
          image_url: {
            url: "/uploads/product-images/demo.png"
          },
          role: "first_frame"
        }
      ],
      duration: 12,
      ratio: "9:16"
    });
  });

  it("polls Ark video tasks when the create response returns a task id", async () => {
    const calls: string[] = [];
    const result = await generateVideoWithSeedance(
      {
        imageUrl: "https://cdn.example/product.png",
        prompt: "Create a vertical ecommerce product showcase video"
      },
      {
        baseURL: "https://ark.example/api/v3",
        env: {
          ARK_API_KEY: "test-key",
          ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
        },
        pollIntervalMs: 0,
        fetch: async (url) => {
          calls.push(String(url));
          if (calls.length === 1) {
            return new Response(JSON.stringify({ id: "task-123" }), {
              status: 200
            });
          }
          return new Response(
            JSON.stringify({
              status: "succeeded",
              content: { video_url: "https://cdn.example/video.mp4" }
            }),
            { status: 200 }
          );
        }
      }
    );

    assert.equal(result.provider, "seedance");
    assert.equal(result.videoUrl, "https://cdn.example/video.mp4");
    assert.deepEqual(calls, [
      "https://ark.example/api/v3/contents/generations/tasks",
      "https://ark.example/api/v3/contents/generations/tasks/task-123"
    ]);
  });

  it("fails loudly in real-provider mode when Ark video config is missing", async () => {
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
            { env: { MODEL_MODE: "real" } }
          ),
        /real-provider mode requires Ark video config/
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
