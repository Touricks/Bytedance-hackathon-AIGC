import { z } from "zod";

export const createGenerationJobRequestSchema = z.object({
  scriptId: z.string().min(1)
});

export type CreateGenerationJobRequest = z.infer<
  typeof createGenerationJobRequestSchema
>;
