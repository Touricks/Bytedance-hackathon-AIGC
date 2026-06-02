import { z } from "zod";

export const proposeImagePromptRequest = z.object({
  userDirection: z.string().optional(),
}).strict();

const imagePromptReferenceUsageRequest = z.object({
  assetId: z.string(),
  usage: z.enum(["product_identity", "style_reference", "scene_reference"]),
  instruction: z.string(),
}).strict();

export const regenerateImagePromptRequest = z.object({
  baseArtifactId: z.string().min(1),
  prompt: z.object({
    promptText: z.string().min(1),
    negativePrompt: z.string().nullable(),
    visualStyle: z.string().nullable(),
    composition: z.string().nullable(),
    lighting: z.string().nullable(),
    productVisibilityRule: z.string().min(1),
    referenceImageUsage: z.array(imagePromptReferenceUsageRequest),
    qualityChecklist: z.array(z.string()),
    context: z.unknown().optional(),
  }).strict(),
}).strict();

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
  userDirection: z.string().optional(),
}).strict();

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
