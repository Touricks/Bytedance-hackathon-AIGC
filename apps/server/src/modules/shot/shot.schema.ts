import { z } from "zod";

export const aspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

export const proposeImagePromptRequest = z.object({
  referenceAssetIds: z.array(z.string()).default([]),
  userDirection: z.string().optional(),
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
  candidateId: z.string().optional(),
  imageCandidateId: z.string().optional(),
  imageGenerationBatchId: z.string().optional(),
}).transform((value, ctx) => {
  const imageCandidateId = value.candidateId ?? value.imageCandidateId;
  if (!imageCandidateId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "candidateId is required",
      path: ["candidateId"],
    });
    return z.NEVER;
  }
  return {
    imageCandidateId,
    imageGenerationBatchId: value.imageGenerationBatchId,
  };
});

export const proposeVideoScriptRequest = z.object({
  durationSec: z.number().int().min(1).max(8).optional(),
  useNeighborFrames: z.boolean().default(true),
  userDirection: z.string().optional(),
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
  candidateId: z.string().optional(),
  videoCandidateId: z.string().optional(),
  videoGenerationBatchId: z.string().optional(),
}).transform((value, ctx) => {
  const videoCandidateId = value.candidateId ?? value.videoCandidateId;
  if (!videoCandidateId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "candidateId is required",
      path: ["candidateId"],
    });
    return z.NEVER;
  }
  return {
    videoCandidateId,
    videoGenerationBatchId: value.videoGenerationBatchId,
  };
});

export const retryRequest = z.object({
  what: z.enum(["image_batch", "video_batch"]),
});
