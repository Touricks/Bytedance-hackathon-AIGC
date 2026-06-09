import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import { importDashboardVideoRequest } from "./dashboard-video-artifact.schema.js";
import { dashboardVideoArtifactService } from "./dashboard-video-artifact.service.js";

export async function registerDashboardVideoArtifactController(
  app: FastifyInstance,
) {
  app.get("/api/dashboard/videos", async (_request, reply) => {
    try {
      return await dashboardVideoArtifactService.listAll();
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get("/api/dashboard/videos/:artifactId/file", async (request, reply) => {
    try {
      const params = request.params as { artifactId: string };
      reply.header("Content-Type", "video/mp4");
      return reply.send(
        await dashboardVideoArtifactService.streamVideo(params.artifactId),
      );
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.post("/api/workspaces/:workspaceId/dashboard/videos", async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      const body = importDashboardVideoRequest.parse(request.body);
      return await dashboardVideoArtifactService.importFinalVideo(
        params.workspaceId,
        body,
      );
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get("/api/workspaces/:workspaceId/dashboard/videos", async (request, reply) => {
    try {
      const params = request.params as { workspaceId: string };
      return await dashboardVideoArtifactService.list(params.workspaceId);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/dashboard/videos/:artifactId",
    async (request, reply) => {
      try {
        const params = request.params as {
          workspaceId: string;
          artifactId: string;
        };
        return await dashboardVideoArtifactService.get(
          params.workspaceId,
          params.artifactId,
        );
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );
}
