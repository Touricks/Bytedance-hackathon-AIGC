import { z } from "zod";

export const materialUploadRequestSchema = z.object({
  imageUrl: z.string().url().or(z.string().startsWith("/"))
});

export const productImageUploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().regex(/^image\/[a-zA-Z0-9.+-]+$/),
  dataBase64: z.string().min(1)
});
