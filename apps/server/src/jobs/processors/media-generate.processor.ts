import { buildTwelveSecondVideoPrompt, generateVideoWithSeedance } from "@aigc-video/ai";
import type { GeneratedScript } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { appendTrace } from "../../common/trace.js";

interface MediaGenerationInput {
  imageUrl: string;
}

export async function processMediaGeneration(
  jobId: string,
  input: MediaGenerationInput,
  script: GeneratedScript
) {
  const current = db.getJob(jobId);
  db.updateJob(jobId, {
    ...appendTrace(current, "media_generating", "Started 12 second video generation"),
    stage: "media_generating",
    progress: 70
  });

  const prompt = buildTwelveSecondVideoPrompt(script);
  const video = await generateVideoWithSeedance({
    imageUrl: input.imageUrl,
    prompt
  });

  const asset = db.createAsset({
    type: "final_video",
    url: video.videoUrl,
    source: video.provider,
    metadata: {
      prompt,
      provider: video.provider
    }
  });

  const afterVideo = db.getJob(jobId);
  db.updateJob(jobId, {
    ...appendTrace(afterVideo, "completed", "Final video generated", {
      assetId: asset.id
    }),
    status: "completed",
    stage: "completed",
    progress: 100,
    finalAssetId: asset.id
  });

  return asset;
}
