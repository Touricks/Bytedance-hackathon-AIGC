import {
  dealTypeSchema,
  productCategorySchema,
  type DealType,
  type ProductCategory,
} from "@aigc-video/shared";
import { z } from "zod";
import { NotFoundError } from "../../common/errors.js";
import {
  recommendFromRecords,
  type GroupRecommendation,
  type RecommendationOptions,
  type RecommendationResult,
} from "./recommendation-engine.js";
import { recommendationRepository } from "./recommendation.repository.js";

const weight = z.coerce.number().min(0).max(1);

/** Query parameters accepted by the recommendation endpoints. */
export const recommendationQuerySchema = z
  .object({
    roasWeight: weight.optional(),
    gmvWeight: weight.optional(),
    priorStrength: z.coerce.number().min(0).max(50).optional(),
  })
  .strict();
export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;

function toOptions(query: RecommendationQuery): RecommendationOptions {
  return {
    roasWeight: query.roasWeight,
    gmvWeight: query.gmvWeight,
    priorStrength: query.priorStrength,
  };
}

export const recommendationService = {
  /** Recommendations for every (商品一级类目 × 商品成交类型) group with data. */
  async getRecommendations(
    query: RecommendationQuery = {},
  ): Promise<RecommendationResult> {
    const records = await recommendationRepository.loadPerformanceRecords();
    return recommendFromRecords(records, toOptions(query));
  },

  /** Recommendation for one group; 404 if no data exists for that combination. */
  async getGroupRecommendation(
    productCategory: ProductCategory,
    dealType: DealType,
    query: RecommendationQuery = {},
  ): Promise<{ data: GroupRecommendation; meta: Omit<RecommendationResult, "groups"> }> {
    const result = await this.getRecommendations(query);
    const group = result.groups.find(
      (candidate) =>
        candidate.productCategory === productCategory &&
        candidate.dealType === dealType,
    );
    if (!group) {
      throw new NotFoundError("RecommendationGroup");
    }
    const meta = {
      schemaVersion: result.schemaVersion,
      weights: result.weights,
      priorStrength: result.priorStrength,
      totals: result.totals,
    };
    return { data: group, meta };
  },
};

export { productCategorySchema, dealTypeSchema };
