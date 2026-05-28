import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateImagesWithArk } from "./ark-image.provider.js";

const cfg = {
  task: "image" as const,
  provider: "ark-seedream",
  apiKey: "test-key",
  endpointId: "ep-image",
  baseURL: "https://ark.example/v3",
};

describe("generateImagesWithArk", () => {
  it("creates an async task and polls until image_url returned", async () => {
    const responses = [
      () => new Response(JSON.stringify({ id: "task-1" }), { status: 200 }),
      () => new Response(JSON.stringify({ status: "running" }), { status: 200 }),
      () =>
        new Response(
          JSON.stringify({
            status: "succeeded",
            data: { images: [{ url: "https://cdn.example/1.png" }, { url: "https://cdn.example/2.png" }] },
          }),
          { status: 200 },
        ),
    ];
    let callCount = 0;
    const fetchImpl = async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      const factory = responses[callCount++];
      if (!factory) throw new Error(`Unexpected fetch call #${callCount}`);
      return factory();
    };

    const result = await generateImagesWithArk(
      { prompt: "p", count: 2, aspectRatio: "9:16" },
      cfg,
      { fetch: fetchImpl as typeof fetch, pollIntervalMs: 0, maxPollAttempts: 5 },
    );

    assert.equal(result.provider, "ark-seedream");
    assert.equal(result.model, "ep-image");
    assert.deepEqual(
      result.candidates.map((c) => c.imageUrl),
      ["https://cdn.example/1.png", "https://cdn.example/2.png"],
    );
    assert.equal(callCount, 3);
  });

  it("throws on failed task status", async () => {
    const responses = [
      () => new Response(JSON.stringify({ id: "task-2" }), { status: 200 }),
      () => new Response(JSON.stringify({ status: "failed", message: "nope" }), { status: 200 }),
    ];
    let callCount = 0;
    const fetchImpl = async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      const factory = responses[callCount++];
      if (!factory) throw new Error(`Unexpected fetch call #${callCount}`);
      return factory();
    };

    await assert.rejects(
      () =>
        generateImagesWithArk({ prompt: "p", count: 1, aspectRatio: "9:16" }, cfg, {
          fetch: fetchImpl as typeof fetch,
          pollIntervalMs: 0,
          maxPollAttempts: 5,
        }),
      /failed/i,
    );
  });
});
