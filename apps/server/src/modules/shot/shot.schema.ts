import { z } from "zod";

export const proposeImagePromptRequest = z.object({
  userDirection: z.string().optional(),
  candidateCount: z.number().int().positive().optional(),
}).strict();

const shotAssetRefRoleSchema = z.enum([
  "product_identity",
  "reference_style",
  "reference_scene",
  "first_frame_hint",
  "other",
]);

export const patchShotAssetRefsRequest = z
  .object({
    refs: z.array(
      z
        .object({
          assetId: z.string().min(1),
          role: shotAssetRefRoleSchema,
          weight: z.number().finite().positive().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export const regenerateImagePromptRequest = z.object({
  baseArtifactId: z.string().min(1),
  feedbackImageCandidateId: z.string().min(1),
  userDirection: z.string().trim().min(1).max(1000),
  candidateCount: z.number().int().positive().optional(),
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
  candidateCount: z.number().int().positive().optional(),
}).strict();

export const regenerateVideoScriptRequest = z.object({
  baseArtifactId: z.string().min(1),
  feedbackVideoCandidateId: z.string().min(1),
  userDirection: z.string().trim().min(1).max(1000),
  candidateCount: z.number().int().positive().optional(),
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
