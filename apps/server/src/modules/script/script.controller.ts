import type { FastifyInstance } from "fastify";
import { jobIdParamsSchema } from "./script.schema.js";
import { scriptService } from "./script.service.js";

export async function registerScriptController(app: FastifyInstance) {
  app.get("/api/scripts/:jobId", async (request) => {
    const params = jobIdParamsSchema.parse(request.params);
    return scriptService.getScriptByJob(params.jobId);
  });
}
