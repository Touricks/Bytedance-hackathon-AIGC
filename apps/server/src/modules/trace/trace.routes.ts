import type { FastifyInstance } from "fastify";
import { traceService } from "./trace.service.js";

export async function registerTraceController(app: FastifyInstance) {
  app.get("/api/workspaces/:workspaceId/traces", async (req) => {
    const params = req.params as { workspaceId: string };
    const query = req.query as { limit?: string; cursor?: string };
    return traceService.list(params.workspaceId, {
      limit: query.limit ? Number(query.limit) : 50,
      cursor: query.cursor,
    });
  });
  app.get("/api/shots/:shotId/traces", async (req) => {
    const params = req.params as { shotId: string };
    const query = req.query as { limit?: string; cursor?: string };
    return traceService.listShot(params.shotId, {
      limit: query.limit ? Number(query.limit) : 50,
      cursor: query.cursor,
    });
  });
}
