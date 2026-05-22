import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { createGenerationJobRequestSchema } from "./creation.schema.js";
import { creationService } from "./creation.service.js";

export async function registerCreationController(app: FastifyInstance) {
  app.post("/api/creation/jobs", async (request, reply) => {
    try {
      const body = createGenerationJobRequestSchema.parse(request.body);
      return creationService.createGenerationJob(body);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get("/api/jobs/:jobId", async (request, reply) => {
    try {
      const params = request.params as { jobId: string };
      return creationService.getJobDetail(params.jobId);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });
}
