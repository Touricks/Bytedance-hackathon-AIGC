import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createFileTraceLogger,
  getDefaultTraceBatchId
} from "../trace/trace-log.js";
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
      ratio: "9:16",
      generate_audio: true
    });
  });

  it("passes Seedance duration, ratio, and audio controls in the request body", async () => {
    const calls: Array<{ body: unknown }> = [];

    await generateVideoWithSeedance(
      {
        imageUrl: "/uploads/product-images/demo.png",
        prompt: "生成 1:1 商品展示视频",
        durationSec: 8,
        aspectRatio: "1:1",
        generateAudio: false
      },
      {
        baseURL: "https://ark.example/api/v3",
        env: {
          ARK_API_KEY: "test-key",
          ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
        },
        fetch: async (_url, init) => {
          calls.push({ body: JSON.parse(String(init?.body)) });
          return new Response(
            JSON.stringify({ videoUrl: "https://cdn.example/video.mp4" }),
            { status: 200 }
          );
        }
      }
    );

    assert.equal((calls[0]!.body as { duration: unknown }).duration, 8);
    assert.equal((calls[0]!.body as { ratio: unknown }).ratio, "1:1");
    assert.equal(
      (calls[0]!.body as { generate_audio: unknown }).generate_audio,
      false
    );
  });

  it("fails loudly when Seedance duration is outside the shared supported range", async () => {
    await assert.rejects(
      () =>
        generateVideoWithSeedance(
          {
            imageUrl: "/uploads/product-images/demo.png",
            prompt: "生成商品展示视频",
            durationSec: 15
          },
          { env: {} }
        ),
      /durationSec must be between 4 and 12/
    );

    await assert.rejects(
      () =>
        generateVideoWithSeedance(
          {
            imageUrl: "/uploads/product-images/demo.png",
            prompt: "生成商品展示视频",
            durationSec: 5.5
          },
          { env: {} }
        ),
      /durationSec must be an integer/
    );
  });

  it("returns normalized provider details and Ark video trace metadata", async () => {
    const events: unknown[] = [];

    const result = await generateVideoWithSeedance(
      {
        imageUrl: "data:image/png;base64,cHJvZHVjdA==",
        prompt: "Create a vertical ecommerce product showcase video"
      },
      {
        baseURL: "https://ark.example/api/v3",
        env: {
          ARK_API_KEY: "test-key",
          ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
        },
        traceLogger: {
          append: async (event) => {
            events.push(event);
          }
        },
        fetch: async () =>
          new Response(
            JSON.stringify({ videoUrl: "https://cdn.example/video.mp4" }),
            { status: 200 }
          )
      }
    );

    assert.deepEqual(result, {
      provider: "seedance",
      model: "ark-video-endpoint",
      videoUrl: "https://cdn.example/video.mp4",
      prompt: "Create a vertical ecommerce product showcase video"
    });
    assert.deepEqual(
      events.map((event) => (event as { kind: string }).kind),
      ["video.task_create_started", "video.task_created", "video.completed"]
    );
    assert.deepEqual((events[0] as { meta: Record<string, unknown> }).meta, {
      endpointFamily: "ark_video_task",
      baseURL: "https://ark.example/api/v3",
      prompt: "Create a vertical ecommerce product showcase video",
      imageUrl: "data:image/png;base64,cHJvZHVjdA==",
      duration: 12,
      ratio: "9:16",
      generateAudio: true
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

  it("writes script-scoped task polling trace events with jobId and redacted image data", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "seedance-trace-"));
    const traceLogger = createFileTraceLogger({
      traceId: "script_video_trace",
      traceRoot,
      traceScope: "users"
    });
    const calls: string[] = [];

    const result = await generateVideoWithSeedance(
      {
        imageUrl: "data:image/png;base64,cHJvZHVjdA==",
        prompt: "Create a vertical ecommerce product showcase video"
      },
      {
        baseURL: "https://ark.example/api/v3",
        env: {
          ARK_API_KEY: "test-key",
          ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
        },
        jobId: "job_video_trace",
        traceLogger,
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

    assert.equal(result.videoUrl, "https://cdn.example/video.mp4");
    assert.equal(
      traceLogger.filePath,
      path.join(traceRoot, "users", getDefaultTraceBatchId(), "events.jsonl")
    );

    const traceText = await readFile(traceLogger.filePath, "utf8");
    const events = traceText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.deepEqual(
      events.map((event) => event.kind),
      [
        "video.task_create_started",
        "video.task_created",
        "video.task_polled",
        "video.completed"
      ]
    );
    assert.equal(events[0].jobId, "job_video_trace");
    assert.equal(events[2].meta.taskId, "task-123");
    assert.equal(events[2].meta.status, "succeeded");
    assert.equal(events[3].meta.videoUrl, "https://cdn.example/video.mp4");
    assert.doesNotMatch(traceText, /cHJvZHVjdA==/);
    assert.match(traceText, /data:image\/<redacted>;base64,<redacted>/);
  });

  it("passes an already-normalized data URL through to Ark video", async () => {
    let requestBody: Record<string, unknown> | undefined;

    await generateVideoWithSeedance(
      {
        imageUrl: "data:image/png;base64,cHJvZHVjdA==",
        prompt: "Create a vertical ecommerce product showcase video"
      },
      {
        baseURL: "https://ark.example/api/v3",
        env: {
          ARK_API_KEY: "test-key",
          ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
        },
        fetch: async (_url, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(
            JSON.stringify({ videoUrl: "https://cdn.example/video.mp4" }),
            { status: 200 }
          );
        }
      }
    );

    const content = requestBody?.content as Array<{
      image_url?: { url: string };
    }>;
    assert.equal(
      content[1]?.image_url?.url,
      "data:image/png;base64,cHJvZHVjdA=="
    );
  });

  it("includes sanitized Ark failure diagnostics without leaking base64 payloads", async () => {
    await assert.rejects(
      () =>
        generateVideoWithSeedance(
          {
            imageUrl: "data:image/png;base64,c2Vuc2l0aXZlLWltYWdl",
            prompt: "Create a vertical ecommerce product showcase video"
          },
          {
            baseURL: "https://ark.example/api/v3",
            env: {
              ARK_API_KEY: "test-key",
              ARK_VIDEO_ENDPOINT_ID: "ark-video-endpoint"
            },
            fetch: async () =>
              new Response(
                JSON.stringify({
                  error: {
                    code: "InvalidImageURL",
                    message:
                      "invalid image data:image/png;base64,c2Vuc2l0aXZlLWltYWdl"
                  },
                  request_id: "req-123"
                }),
                { status: 400 }
              )
          }
        ),
      (error: unknown) => {
        assert(error instanceof Error);
        assert.match(error.message, /status 400/);
        assert.match(error.message, /InvalidImageURL/);
        assert.match(error.message, /request_id=req-123/);
        assert.doesNotMatch(error.message, /c2Vuc2l0aXZlLWltYWdl/);
        assert.match(error.message, /data:image\/<redacted>;base64,<redacted>/);
        return true;
      }
    );
  });

  it("waits up to about 200 seconds by default before timing out a task", async () => {
    let queryCount = 0;

    await assert.rejects(
      () =>
        generateVideoWithSeedance(
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
              if (String(url).endsWith("/contents/generations/tasks")) {
                return new Response(JSON.stringify({ id: "task-123" }), {
                  status: 200
                });
              }

              queryCount += 1;
              return new Response(JSON.stringify({ status: "running" }), {
                status: 200
              });
            }
          }
        ),
      /did not complete in time/
    );

    assert.equal(queryCount, 20);
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
