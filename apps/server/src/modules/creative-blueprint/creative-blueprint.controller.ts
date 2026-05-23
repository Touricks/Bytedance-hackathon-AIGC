import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { creativeBlueprintService } from "./creative-blueprint.service.js";
import { createCreativeBlueprintRequestSchema } from "./creative-blueprint.schema.js";

export async function registerCreativeBlueprintController(app: FastifyInstance) {
  app.post("/api/creative-blueprints", async (request, reply) => {
    try {
      const body = createCreativeBlueprintRequestSchema.parse(request.body);
      return await creativeBlueprintService.createCreativeBlueprint(body);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get("/api/creative-blueprints/:scriptId", async (request, reply) => {
    try {
      const params = request.params as { scriptId: string };
      return await creativeBlueprintService.getCreativeBlueprint(params.scriptId);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });
}
