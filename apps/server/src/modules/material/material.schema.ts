import { z } from "zod";

export const materialUploadRequestSchema = z.object({
  imageUrl: z.string().url().or(z.string().startsWith("/"))
});
