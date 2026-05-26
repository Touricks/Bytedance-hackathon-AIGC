import type { FastifyInstance } from "fastify";
import { getPipelineContracts } from "@aigc-video/ai";

export async function registerPipelineController(app: FastifyInstance) {
  app.get("/api/pipeline/contracts", async () => getPipelineContracts());
}
