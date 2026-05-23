import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createGenerationJob, uploadProductImage } from "./client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("api client", () => {
  it("surfaces product image upload validation failures as readable errors", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          statusCode: 400,
          message: "Uploaded product image must be a valid image file"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

    const file = new File(["fake image bytes"], "fake-product.png", {
      type: "image/png"
    });

    await assert.rejects(
      () => uploadProductImage(file),
      /Uploaded product image must be a valid image file/
    );
  });

  it("creates a generation job from scriptId and returns hydrated job detail", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "http://localhost:3000/api/creation/jobs");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { scriptId: "script_123" });

      return new Response(
        JSON.stringify({
          job: {
            id: "job_123",
            productId: "product_123",
            scriptId: "script_123",
            status: "queued",
            stage: "queued",
            progress: 0,
            payload: { scriptId: "script_123" },
            trace: [],
            createdAt: "2026-05-23T00:00:00.000Z",
            updatedAt: "2026-05-23T00:00:00.000Z"
          },
          script: {
            id: "script_123",
            productId: "product_123",
            version: 1,
            narrative: "A short product story",
            visualStyle: "clean",
            frozen: true,
            rawJson: {},
            createdAt: "2026-05-23T00:00:00.000Z"
          },
          shots: []
        }),
        { status: 200 }
      );
    };

    const detail = await createGenerationJob({ scriptId: "script_123" });

    assert.equal(detail.job.id, "job_123");
    assert.equal(detail.job.scriptId, "script_123");
    assert.equal(detail.script?.id, "script_123");
    assert.deepEqual(detail.shots, []);
  });
});
