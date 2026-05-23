import { buildTwelveSecondVideoPrompt, generateVideoWithSeedance } from "@aigc-video/ai";
import type { GeneratedScript } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { markJobCompleted, markJobMediaGenerating } from "../job-state.js";

interface MediaGenerationInput {
  imageUrl: string;
}

export async function processMediaGeneration(
  jobId: string,
  input: MediaGenerationInput,
  script: GeneratedScript
) {
  await markJobMediaGenerating(jobId);

  const prompt = buildTwelveSecondVideoPrompt(script);
  const video = await generateVideoWithSeedance({
    imageUrl: input.imageUrl,
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
