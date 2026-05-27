import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
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

  app.post("/api/materials/product-image", async (request, reply) => {
    try {
      const body = productImageUploadRequestSchema.parse(request.body);
      return await materialService.uploadProductImage(body);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });
}
