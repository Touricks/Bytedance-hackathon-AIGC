import { z } from "zod";
import { storyboardShotSchema } from "./script.js";

export const creativeFieldSchema = z.enum([
  "productImage",
  "title",
  "sellingPoints",
  "audience",
  "stylePreference"
]);

export const improvementHintSchema = z.object({
  ifVideoLooksBad: z.string().min(1),
  suggestedUserAction: z.string().min(1),
  fieldsToChange: z.array(creativeFieldSchema).min(1)
});

export const creativeBlueprintSchema = z.object({
  narrative: z.string().min(8),
  visualStyle: z.string().min(2),
  targetAudience: z.string().min(1),
  coreSellingPoint: z.string().min(1),
  shots: z.array(storyboardShotSchema).min(2).max(4),
  renderBrief: z.object({
    productConsistencyRules: z.array(z.string().min(1)),
    avoid: z.array(z.string().min(1)),
    videoPromptSummary: z.string().min(1)
  }),
  improvementHints: z.array(improvementHintSchema).min(1)
});

export const createCreativeBlueprintRequestSchema = z.object({
  title: z.string().min(1),
  sellingPoints: z.string().min(1),
  audience: z.string().min(1),
  stylePreference: z.string().min(1),
  imageUrl: z.string().url().or(z.string().startsWith("/")),
  draftScriptId: z.string().optional()
});

export type CreativeField = z.infer<typeof creativeFieldSchema>;
export type ImprovementHint = z.infer<typeof improvementHintSchema>;
export type CreativeBlueprint = z.infer<typeof creativeBlueprintSchema>;
export type CreateCreativeBlueprintRequest = z.infer<
  typeof createCreativeBlueprintRequestSchema
>;
