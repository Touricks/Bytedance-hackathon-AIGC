import { z } from "zod";

export const StoryboardImagePromptOutputSchema = z.object({
  promptText: z.string(),
  negativePrompt: z.string().nullable(),
  visualStyle: z.string().nullable(),
  composition: z.string().nullable(),
  lighting: z.string().nullable(),
  productVisibilityRule: z.string(),
  referenceImageUsage: z
    .array(
      z.object({
        assetId: z.string(),
        usage: z.enum([
          "product_identity",
          "style_reference",
          "scene_reference",
          "composition_reference",
        ]),
        instruction: z.string(),
      }).strict(),
    ),
  qualityChecklist: z.array(z.string()),
}).strict();
export type StoryboardImagePromptOutput = z.infer<typeof StoryboardImagePromptOutputSchema>;
