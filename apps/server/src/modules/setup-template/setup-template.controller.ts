import type { FastifyInstance } from "fastify";
import { setupTemplateService } from "./setup-template.service.js";

export async function registerSetupTemplateController(app: FastifyInstance) {
  app.get("/api/setup-templates/creative-requirements", async () => ({
    data: setupTemplateService.listCreativeRequirementTemplates(),
  }));
}
