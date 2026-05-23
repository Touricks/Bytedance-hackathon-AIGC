import { z } from "zod";

export const storyboardShotSchema = z.object({
  index: z.number().int().min(1),
  durationSec: z.number().positive().max(12),
  purpose: z.enum(["hook", "benefit", "cta"]).optional(),
  visualPrompt: z.string().min(8),
  cameraMotion: z.string().min(2),
  voiceover: z.string().min(1),
  subtitle: z.string().min(1)
});

export const generatedScriptSchema = z.object({
  narrative: z.string().min(8),
  visualStyle: z.string().min(2),
  shots: z.array(storyboardShotSchema).min(2).max(4)
});

export type GeneratedScript = z.infer<typeof generatedScriptSchema>;
export type GeneratedStoryboardShot = z.infer<typeof storyboardShotSchema>;
