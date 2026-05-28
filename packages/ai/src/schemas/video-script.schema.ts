import { z } from "zod";

export const VideoShotScriptOutputSchema = z.object({
  durationSec: z.number().int().min(1).max(8),
  shotGoal: z.string().min(1),
  startFrameDescription: z.string().min(1),
  endFrameDescription: z.string().min(1),
  continuityWithPrevious: z.string().optional(),
  continuityWithNext: z.string().optional(),
  cameraMotion: z.string().min(1),
  subjectMotion: z.string().min(1),
  productVisibility: z.string().min(1),
  sceneConsistency: z.string().min(1),
  voiceover: z.string().optional(),
  onscreenText: z.string().optional(),
  providerPrompt: z.string().min(30),
  negativePrompt: z.string().optional(),
  riskNotes: z.array(z.string()).default([]),
});
export type VideoShotScriptOutput = z.infer<typeof VideoShotScriptOutputSchema>;
