import { z } from "zod";

export const VideoShotScriptOutputSchema = z.object({
  durationSec: z.number().int().min(1).max(8),
  shotGoal: z.string().min(1),
  startFrameDescription: z.string().min(1),
  endFrameDescription: z.string().min(1),
  continuityWithPrevious: z.string().nullable().optional(),
  continuityWithNext: z.string().nullable().optional(),
  cameraMotion: z.string().min(1),
  subjectMotion: z.string().min(1),
  productVisibility: z.string().min(1),
  sceneConsistency: z.string().min(1),
  voiceover: z.string().nullable().optional(),
  onscreenText: z.string().nullable().optional(),
  providerPrompt: z.string().min(30),
  negativePrompt: z.string().nullable().optional(),
  riskNotes: z.array(z.string()).default([]),
});
export type VideoShotScriptOutput = z.infer<typeof VideoShotScriptOutputSchema>;
