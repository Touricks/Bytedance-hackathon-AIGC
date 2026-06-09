import type { FastifyInstance } from "fastify";
import { toHttpError } from "../../common/errors.js";
import {
  dealTypeSchema,
  productCategorySchema,
  recommendationQuerySchema,
  recommendationService,
} from "./recommendation.service.js";

/**
 * 投放策略推荐 endpoints. Read-only analytics over the dashboard video registry:
 * given 商品一级类目 × 商品成交类型, recommend the best 适用人群 / 推销手法.
 *
 *   GET /api/dashboard/recommendations
 *   GET /api/dashboard/recommendations/:productCategory/:dealType
 *
 * Optional query: roasWeight, gmvWeight (composite-score weights), priorStrength
 * (shrinkage strength).
 */
export async function registerRecommendationController(app: FastifyInstance) {
  app.get("/api/dashboard/recommendations", async (request, reply) => {
    try {
      const query = recommendationQuerySchema.parse(request.query ?? {});
      return await recommendationService.getRecommendations(query);
    } catch (error) {
      const httpError = toHttpError(error);
      return reply.status(httpError.statusCode).send(httpError);
    }
  });

  app.get(
    "/api/dashboard/recommendations/:productCategory/:dealType",
    async (request, reply) => {
      try {
        const params = request.params as {
          productCategory: string;
          dealType: string;
        };
        const productCategory = productCategorySchema.parse(params.productCategory);
        const dealType = dealTypeSchema.parse(params.dealType);
        const query = recommendationQuerySchema.parse(request.query ?? {});
        return await recommendationService.getGroupRecommendation(
          productCategory,
          dealType,
          query,
        );
      } catch (error) {
        const httpError = toHttpError(error);
        return reply.status(httpError.statusCode).send(httpError);
      }
    },
  );
}
