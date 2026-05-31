import { z } from "zod";

export const proposeImagePromptRequest = z.object({
  userDirection: z.string().optional(),
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
