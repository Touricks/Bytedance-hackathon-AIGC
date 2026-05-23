import type { FastifyInstance } from "fastify";
import {
  materialUploadRequestSchema,
  productImageUploadRequestSchema
} from "./material.schema.js";
import { materialService } from "./material.service.js";

export async function registerMaterialController(app: FastifyInstance) {
  app.post("/api/materials", async (request) => {
    const body = materialUploadRequestSchema.parse(request.body);
    return materialService.registerProductImage(body.imageUrl);
  });

  app.post("/api/materials/product-image", async (request) => {
    const body = productImageUploadRequestSchema.parse(request.body);
    return materialService.uploadProductImage(body);
  });
}
