import { z } from "zod";

export const StoryboardImagePromptOutputSchema = z.object({
  promptText: z.string().min(20),
  negativePrompt: z.string().optional(),
  visualStyle: z.string().optional(),
  composition: z.string().optional(),
  lighting: z.string().optional(),
  productVisibilityRule: z.string().min(1),
  referenceImageUsage: z
    .array(
      z.object({
        assetId: z.string().min(1),
        usage: z.enum([
          "product_identity",
          "style_reference",
          "scene_reference",
          "composition_reference",
        ]),
        instruction: z.string().min(1),
      }),
    )
    .default([]),
  qualityChecklist: z.array(z.string()).default([]),
});
export type StoryboardImagePromptOutput = z.infer<typeof StoryboardImagePromptOutputSchema>;
