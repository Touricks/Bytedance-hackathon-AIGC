#!/usr/bin/env tsx
import {
  resolveTextProviderConfig,
  resolveImageProviderConfig,
  resolveVideoProviderConfig,
  generateImagesWithArk,
  generateVideoWithSeedance,
  generateTextWithArk,
  maskSecret,
} from "@aigc-video/ai";

console.log(
  '[disabled] smoke:providers is disabled. Run "pnpm --filter @aigc-video/server test:integration:smoke" for backend image/video chain smoke tests.'
);
process.exit(0);

type Result = { name: string; ok: boolean; detail: string };

async function probeText(): Promise<Result> {
  const cfg = resolveTextProviderConfig();
  if (!cfg) return { name: "text", ok: false, detail: "TEXT_* env not set" };
  try {
    const r = await generateTextWithArk(
      { prompt: "smoke", content: "Reply with the single word OK." },
      { provider: "ark", apiKey: cfg.apiKey, model: cfg.endpointId, baseURL: cfg.baseURL },
    );
    return { name: "text", ok: true, detail: `model=${cfg.endpointId} output=${r.output.slice(0, 30)}` };
  } catch (e) {
    return { name: "text", ok: false, detail: (e as Error).message.slice(0, 200) };
  }
}

async function probeImage(): Promise<{ result: Result; fullUrl: string | null }> {
  const cfg = resolveImageProviderConfig();
  if (!cfg) {
    return {
      result: { name: "image", ok: false, detail: "IMAGE_* env not set" },
      fullUrl: null,
    };
  }
  try {
    const r = await generateImagesWithArk(
      { prompt: "a single red apple on a white background, studio lighting", count: 1, aspectRatio: "1:1" },
      cfg,
    );
    const url = r.candidates[0]?.imageUrl ?? null;
    return {
      result: {
        name: "image",
        ok: Boolean(url),
        detail: url ? `url=${url.slice(0, 80)}…` : "no candidate returned",
      },
      fullUrl: url,
    };
  } catch (e) {
    return {
      result: { name: "image", ok: false, detail: (e as Error).message.slice(0, 200) },
      fullUrl: null,
    };
  }
}

async function probeVideo(seedImageUrl: string | null): Promise<Result> {
  const cfg = resolveVideoProviderConfig();
  if (!cfg) return { name: "video", ok: false, detail: "VIDEO_* env not set" };
  if (!seedImageUrl) return { name: "video", ok: false, detail: "skipped — image probe did not produce a URL" };
  try {
    const r = await generateVideoWithSeedance(
      {
        imageUrl: seedImageUrl,
        prompt: "A 4-second slow push-in on a single red apple",
        durationSec: 4,
        aspectRatio: "1:1",
        generateAudio: false,
      },
      { apiKey: cfg.apiKey, model: cfg.endpointId, baseURL: cfg.baseURL },
    );
    return { name: "video", ok: Boolean(r.videoUrl), detail: r.videoUrl ? `url=${r.videoUrl.slice(0, 80)}…` : "no video url" };
  } catch (e) {
    return { name: "video", ok: false, detail: (e as Error).message.slice(0, 200) };
  }
}

async function main() {
  console.log(`[smoke-providers] TEXT_API_KEY=${maskSecret(process.env.TEXT_API_KEY ?? "")}`);
  console.log(`[smoke-providers] IMAGE_API_KEY=${maskSecret(process.env.IMAGE_API_KEY ?? "")}`);
  console.log(`[smoke-providers] VIDEO_API_KEY=${maskSecret(process.env.VIDEO_API_KEY ?? "")}`);

  const text = await probeText();
  console.log(`[smoke-providers] ${text.ok ? "✓" : "✗"} text — ${text.detail}`);

  const image = await probeImage();
  console.log(`[smoke-providers] ${image.result.ok ? "✓" : "✗"} image — ${image.result.detail}`);

  const video = await probeVideo(image.fullUrl);
  console.log(`[smoke-providers] ${video.ok ? "✓" : "✗"} video — ${video.detail}`);

  if (!text.ok || !image.result.ok || !video.ok) process.exit(1);
}

main().catch((e) => {
  console.error("[smoke-providers] unexpected error", e);
  process.exit(2);
});
