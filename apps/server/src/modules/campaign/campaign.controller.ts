import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import {
  createCampaignPublicationRequest,
  recordCampaignMetricsRequest,
} from "./campaign.schema.js";
import { campaignService } from "./campaign.service.js";

export async function registerCampaignController(app: FastifyInstance) {
  app.post(
    "/api/workspaces/:workspaceId/campaign-publications",
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        const body = createCampaignPublicationRequest.parse(request.body);
        return await campaignService.createPublication(params.workspaceId, body);
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/campaign-publications",
    async (request, reply) => {
      try {
        const params = request.params as { workspaceId: string };
        return await campaignService.listPublications(params.workspaceId);
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/campaign-publications/:publicationId",
    async (request, reply) => {
      try {
        const params = request.params as {
          workspaceId: string;
          publicationId: string;
        };
        return await campaignService.getPublication(
          params.workspaceId,
          params.publicationId,
        );
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/campaign-publications/:publicationId/metrics",
    async (request, reply) => {
      try {
        const params = request.params as {
          workspaceId: string;
          publicationId: string;
        };
        const body = recordCampaignMetricsRequest.parse(request.body);
        return await campaignService.recordMetrics(
          params.workspaceId,
          params.publicationId,
          body,
        );
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );
}
