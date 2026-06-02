// Disabled: multi-real-model provider probes are closed. Keep backend image/video chain smoke only.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTextProviderConfig,
  resolveImageProviderConfig,
  resolveVideoProviderConfig,
  generateImagesWithArk,
  generateVideoWithSeedance,
  generateTextWithArk,
} from "@aigc-video/ai";

describe("provider smoke @disabled", { skip: true }, () => {
  it("text provider produces non-empty output", async () => {
    const cfg = resolveTextProviderConfig();
    assert.ok(cfg, "TEXT_* env not set");
    const r = await generateTextWithArk(
      { prompt: "smoke", content: "Reply OK." },
      { provider: "ark", apiKey: cfg!.apiKey, model: cfg!.endpointId, baseURL: cfg!.baseURL },
    );
    assert.ok(r.output.trim().length > 0, `empty output: ${JSON.stringify(r)}`);
  });

  it("image provider returns at least one URL", async (t) => {
    const cfg = resolveImageProviderConfig();
    assert.ok(cfg, "IMAGE_* env not set");
    const r = await generateImagesWithArk(
      { prompt: "a single red apple, studio lighting", count: 1, aspectRatio: "1:1" },
      cfg!,
    );
    const url = r.candidates[0]?.imageUrl;
    assert.ok(url && /^https?:\/\//.test(url), `bad candidate: ${JSON.stringify(r)}`);
    (t as unknown as { context?: { imageUrl?: string } }).context = { imageUrl: url };
  });

  it("video provider returns a video URL (uses public seed image)", async () => {
    const cfg = resolveVideoProviderConfig();
    assert.ok(cfg, "VIDEO_* env not set");
    // Use a small public domain image as seed to keep this test independent of the image probe.
    // Spec'd thumb URL (256px-Red_Apple.jpg) returns 400 from Wikipedia; use the canonical full-size URL instead.
    const seedUrl = "https://upload.wikimedia.org/wikipedia/commons/1/15/Red_Apple.jpg";
    const r = await generateVideoWithSeedance(
      { imageUrl: seedUrl, prompt: "A 4-second slow push-in on the apple", durationSec: 4, aspectRatio: "1:1", generateAudio: false },
      { apiKey: cfg!.apiKey, model: cfg!.endpointId, baseURL: cfg!.baseURL },
    );
    assert.ok(r.videoUrl && /^https?:\/\//.test(r.videoUrl), `bad video: ${JSON.stringify(r)}`);
  });
});
