import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { runImageToVideoProbe } from "./image-to-video.js";
import { runToTextProbe } from "./to-text.js";

async function writeProbeImage(rootPrefix: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), rootPrefix));
  const imagePath = path.join(root, "product.png");
  await writeFile(imagePath, Buffer.from("probe-image"));
  return { root, imagePath };
}

describe("provider probes", () => {
  it("runs a multimodal to-text probe from a local image path and writes a probe trace", async () => {
    const { root, imagePath } = await writeProbeImage("probe-text-");
    const providerRequests: unknown[] = [];

    const result = await runToTextProbe({
      imagePath,
      prompt: "Describe the product image",
      traceRoot: root,
      traceId: "probe-fixed-to-text",
      env: {
        ARK_API_KEY: "test-key",
        ARK_TEXT_ENDPOINT_ID: "Doubao-Seed-2.0-pro",
        ARK_BASE_URL: "https://ark.example/api/v3"
      },
      createClient: () => ({
        chat: {
          completions: {
            create: async (request) => {
              providerRequests.push(request);
              return {
                choices: [
                  {
                    message: {
                      content: "A compact product on a clean background."
                    }
                  }
                ]
              };
            }
          }
        }
      })
    });

    assert.equal(result.traceId, "probe-fixed-to-text");
    assert.equal(
      result.traceFile,
      path.join(root, "tests", "probe-fixed-to-text", "events.jsonl")
    );
    assert.equal(result.output, "A compact product on a clean background.");
    assert.equal(result.provider, "ark");
    assert.equal(result.model, "Doubao-Seed-2.0-pro");
    assert.deepEqual(providerRequests, [
      {
        model: "Doubao-Seed-2.0-pro",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe the product image" },
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64,cHJvYmUtaW1hZ2U=",
                  detail: "high"
                }
              }
            ]
          }
        ],
        temperature: 0,
        top_p: 0.9
      }
    ]);

    const traceText = await readFile(result.traceFile, "utf8");
    const events = traceText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      events.map((event) => event.kind),
      ["probe.image_prepared", "provider.request_started", "provider.response_received"]
    );
    assert.match(traceText, /provider.response_received/);
    assert.match(traceText, /Describe the product image/);
    assert.match(traceText, /A compact product/);
    assert.match(traceText, /"sha256"/);
    assert.doesNotMatch(traceText, /cHJvYmUtaW1hZ2U=/);
    assert.match(traceText, /data:image\/<redacted>;base64,<redacted>/);
  });

  it("runs an image-to-video probe from a local image path and writes a probe trace", async () => {
    const { root, imagePath } = await writeProbeImage("probe-video-");
    const requests: unknown[] = [];

    const result = await runImageToVideoProbe({
      imagePath,
      prompt: "Animate this product",
      traceRoot: root,
      traceId: "probe-fixed-image-to-video",
      env: {
        ARK_API_KEY: "test-key",
        ARK_VIDEO_ENDPOINT_ID: "seedance-endpoint",
        ARK_BASE_URL: "https://ark.example/api/v3"
      },
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({ videoUrl: "https://cdn.example/probe.mp4" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    });

    assert.equal(result.traceId, "probe-fixed-image-to-video");
    assert.equal(
      result.traceFile,
      path.join(root, "tests", "probe-fixed-image-to-video", "events.jsonl")
    );
    assert.equal(result.videoUrl, "https://cdn.example/probe.mp4");
    assert.equal(requests.length, 1);

    const traceText = await readFile(result.traceFile, "utf8");
    assert.match(traceText, /video.image_prepared/);
    assert.match(traceText, /video.task_created/);
    assert.match(traceText, /video.completed/);
    assert.match(traceText, /Animate this product/);
    assert.match(traceText, /"sha256"/);
    assert.doesNotMatch(traceText, /cHJvYmUtaW1hZ2U=/);
    assert.match(traceText, /data:image\/<redacted>;base64,<redacted>/);
  });
});
