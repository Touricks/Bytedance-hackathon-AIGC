import { buildTwelveSecondVideoPrompt, generateVideoWithSeedance } from "@aigc-video/ai";
import type { Asset, GeneratedScript } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { markJobCompleted, markJobMediaGenerating } from "../job-state.js";
import { resolveSeedanceImageInput } from "../seedance-image-input.js";

interface MediaGenerationInput {
  imageAsset: Asset;
}

function hasRealVideoProviderConfig() {
  return Boolean(process.env.ARK_API_KEY && process.env.ARK_VIDEO_ENDPOINT_ID);
}

export async function processMediaGeneration(
  jobId: string,
  input: MediaGenerationInput,
  script: GeneratedScript
) {
  await markJobMediaGenerating(jobId);

  const prompt = buildTwelveSecondVideoPrompt(script);
  const imageUrl = hasRealVideoProviderConfig()
    ? await resolveSeedanceImageInput(input.imageAsset)
    : input.imageAsset.url;
  const video = await generateVideoWithSeedance({
    imageUrl,
    prompt
  });

  const asset = await db.createAsset({
    type: "final_video",
    url: video.videoUrl,
    source: video.provider,
    metadata: {
      prompt,
      provider: video.provider
    }
  });

  await markJobCompleted(jobId, asset.id);

  return asset;
}
