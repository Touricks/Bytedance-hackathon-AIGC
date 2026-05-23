import {
  buildTwelveSecondVideoPrompt,
  createFileTraceLogger,
  createImageTraceMeta,
  generateVideoWithSeedance
} from "@aigc-video/ai";
import type { Asset, GeneratedScript } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { markJobCompleted, markJobMediaGenerating } from "../job-state.js";
import { resolveSeedanceImageInput } from "../seedance-image-input.js";

interface MediaGenerationInput {
  imageAsset: Asset;
  scriptId: string;
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
  const traceLogger = createFileTraceLogger({ traceId: input.scriptId });

  const prompt = buildTwelveSecondVideoPrompt(script);
  try {
    const imageUrl = hasRealVideoProviderConfig()
      ? await resolveSeedanceImageInput(input.imageAsset)
      : input.imageAsset.url;
    await traceLogger.append({
      kind: "video.image_prepared",
      pipeline: "one_click_video",
      status: "ok",
      jobId,
      meta: {
        image: createImageTraceMeta({
          url: imageUrl,
          referenceMode: imageUrl.startsWith("data:image/") ? "data_url" : "url"
        }),
        imageUrl,
        imageAssetId: input.imageAsset.id,
        imageAssetSource: input.imageAsset.source
      }
    });
    const video = await generateVideoWithSeedance(
      {
        imageUrl,
        prompt
      },
      {
        traceLogger,
        jobId
      }
    );

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
  } catch (error) {
    await traceLogger.append({
      kind: "video.failed",
      pipeline: "one_click_video",
      status: "error",
      jobId,
      meta: {
        error: error instanceof Error ? error.message : "Unknown video failure"
      }
    });
    throw error;
  }
}
