import { z } from "zod";

export const legacyGeneratedStoryboardShotSchema = z.object({
  index: z.number().int().min(1),
  durationSec: z.number().positive().max(12),
  purpose: z.enum(["hook", "benefit", "cta"]).optional(),
  visualPrompt: z.string().min(8),
  cameraMotion: z.string().min(2),
  voiceover: z.string().min(1),
  subtitle: z.string().min(1)
});

export const legacyGeneratedScriptSchema = z.object({
  narrative: z.string().min(8),
  visualStyle: z.string().min(2),
  shots: z.array(legacyGeneratedStoryboardShotSchema).min(2).max(4)
});

export type LegacyGeneratedScript = z.infer<typeof legacyGeneratedScriptSchema>;
export type LegacyGeneratedStoryboardShot = z.infer<
  typeof legacyGeneratedStoryboardShotSchema
>;

/**
 * @deprecated V0 script-shot schema kept for creative-blueprint legacy paths.
 * V1 workspace video export must use ShotPromptArtifact as its prompt source.
 */
export const storyboardShotSchema = legacyGeneratedStoryboardShotSchema;

/**
 * @deprecated V0 GeneratedScript kept for legacy fixture/mock compatibility.
 * It cannot represent V1 ShotPromptArtifact timing, references, negative prompt,
 * or TTS fields and must not be used as the Seedance prompt source.
 */
export const generatedScriptSchema = legacyGeneratedScriptSchema;

/**
 * @deprecated Use LegacyGeneratedScript only for explicit V0 legacy paths.
 */
export type GeneratedScript = LegacyGeneratedScript;

/**
 * @deprecated Use LegacyGeneratedStoryboardShot only for explicit V0 legacy paths.
 */
export type GeneratedStoryboardShot = LegacyGeneratedStoryboardShot;
