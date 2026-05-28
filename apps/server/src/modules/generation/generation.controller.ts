import type { FastifyInstance } from "fastify";

export async function registerGenerationController(app: FastifyInstance) {
  app.post("/api/workspaces/:workspaceId/final-videos", async (_req, reply) =>
    reply.status(501).send({ code: "NOT_IMPLEMENTED" }),
  );
  app.get("/api/final-videos/:finalVideoJobId", async (_req, reply) =>
    reply.status(501).send({ code: "NOT_IMPLEMENTED" }),
  );
  app.get("/api/workspaces/:workspaceId/final-videos", async (_req, reply) =>
    reply.status(501).send({ code: "NOT_IMPLEMENTED" }),
  );
  app.get("/api/workspaces/:workspaceId/final-videos/:finalVideoJobId/file", async (_req, reply) =>
    reply.status(501).send({ code: "NOT_IMPLEMENTED" }),
  );
}
