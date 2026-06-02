import { z } from "zod";

export const VideoShotScriptOutputSchema = z.object({
  durationSec: z.number(),
  shotGoal: z.string(),
  startFrameDescription: z.string(),
  endFrameDescription: z.string(),
  continuityWithPrevious: z.string().nullable(),
  continuityWithNext: z.string().nullable(),
  cameraMotion: z.string(),
  subjectMotion: z.string(),
  productVisibility: z.string(),
  sceneConsistency: z.string(),
  voiceover: z.string().nullable(),
  onscreenText: z.string().nullable(),
  providerPrompt: z.string(),
  negativePrompt: z.string().nullable(),
  riskNotes: z.array(z.string()),
}).strict();
export type VideoShotScriptOutput = z.infer<typeof VideoShotScriptOutputSchema>;
