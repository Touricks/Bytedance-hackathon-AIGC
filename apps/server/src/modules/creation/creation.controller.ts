import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { creationService } from "./creation.service.js";

export async function registerCreationController(app: FastifyInstance) {
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
