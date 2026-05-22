import type { FastifyInstance } from "fastify";
import { materialUploadRequestSchema } from "./material.schema.js";
import { materialService } from "./material.service.js";

export async function registerMaterialController(app: FastifyInstance) {
  app.post("/api/materials", async (request) => {
    const body = materialUploadRequestSchema.parse(request.body);
    return materialService.registerProductImage(body.imageUrl);
  });
}
