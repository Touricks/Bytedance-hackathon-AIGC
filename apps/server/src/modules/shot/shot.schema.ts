import { z } from "zod";

export const aspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

export const proposeImagePromptRequest = z.object({
  referenceAssetIds: z.array(z.string()).default([]),
  userHint: z.string().optional(),
  stylePresetId: z.string().optional(),
});

export const patchImagePromptRequest = z.object({
  promptText: z.string().min(1),
  negativePrompt: z.string().optional(),
  referenceAssetIds: z.array(z.string()).default([]),
});

export const createImageBatchRequest = z.object({
  imagePromptArtifactId: z.string(),
  count: z.number().int().min(1).optional(),
  aspectRatio: aspectRatioSchema.default("9:16"),
});

export const selectImageRequest = z.object({
  imageCandidateId: z.string(),
  imageGenerationBatchId: z.string(),
});

export const proposeVideoScriptRequest = z.object({
  durationSec: z.number().int().min(1).max(8),
  useNeighborFrames: z.boolean().default(true),
  userHint: z.string().optional(),
});

export const patchVideoScriptRequest = z.object({
  baseVersion: z.number().int().min(1),
  durationSec: z.number().int().min(1).max(8),
  scriptJson: z.unknown(),
  providerPrompt: z.string().min(30),
});

export const createVideoBatchRequest = z.object({
  videoScriptArtifactId: z.string(),
  count: z.number().int().min(1).optional(),
  aspectRatio: aspectRatioSchema.default("9:16"),
});

export const selectVideoRequest = z.object({
  videoCandidateId: z.string(),
  videoGenerationBatchId: z.string(),
});

export const retryRequest = z.object({
  what: z.enum(["image_batch", "video_batch"]),
});
