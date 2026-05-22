import { z } from "zod";

export const jobIdParamsSchema = z.object({
  jobId: z.string().min(1)
});
