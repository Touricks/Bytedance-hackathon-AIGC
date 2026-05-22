import { z } from "zod";

export const createGenerationJobRequestSchema = z.object({
  title: z.string().min(1),
  sellingPoints: z.string().min(1),
  audience: z.string().min(1),
  imageUrl: z.string().url().or(z.string().startsWith("/"))
});

export type CreateGenerationJobRequest = z.infer<
  typeof createGenerationJobRequestSchema
>;
