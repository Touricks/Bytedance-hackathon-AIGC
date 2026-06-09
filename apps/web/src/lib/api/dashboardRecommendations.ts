import type {
  Audience,
  DealType,
  ProductCategory,
  Strategy,
} from "@aigc-video/shared";
import { fetchJson } from "./client.js";

/**
 * Client for the 投放策略推荐 engine
 * (GET /api/dashboard/recommendations[/:productCategory/:dealType]).
 *
 * The engine response types live in apps/server and are not exported from
 * @aigc-video/shared, so they are mirrored here — the same hand-declared-type
 * convention used by dashboardVideoArtifacts.ts. Money fields are in CENTS.
 */

export type RecommendationConfidence = "high" | "medium" | "low";

export interface FactorCellMetrics {
  sampleCount: number;
  impressions: number;
  clicks: number;
  conversions: number;
  spendCents: number;
  gmvCents: number;
  roas: number;
  avgRoas: number;
  ctr: number;
  cvr: number;
  gmvPerVideoCents: number;
  cpaCents: number;
}

export interface ScoredFactorMetrics extends FactorCellMetrics {
  adjRoas: number;
  adjGmvPerVideoCents: number;
  score: number;
  rank: number;
  confidence: RecommendationConfidence;
}

export interface ComboCell extends ScoredFactorMetrics {
  audience: Audience;
  audienceLabel: string;
  strategy: Strategy;
  strategyLabel: string;
}

export interface RankedAudience extends ScoredFactorMetrics {
  value: Audience;
  label: string;
  gmvShareOfGroup: number;
  isRecommended: boolean;
}

export interface RankedStrategy extends ScoredFactorMetrics {
  value: Strategy;
  label: string;
  gmvShareOfGroup: number;
  isRecommended: boolean;
}

export interface GroupRecommendation {
  groupKey: string;
  productCategory: ProductCategory;
  productCategoryLabel: string;
  dealType: DealType;
  dealTypeLabel: string;
  publicationCount: number;
  comboCount: number;
  groupRoas: number;
  groupAvgRoas: number;
  groupSpendCents: number;
  groupGmvCents: number;
  groupGmvPerVideoCents: number;
  confidence: RecommendationConfidence;
  bestCombo: ComboCell;
  recommendedAudience: Audience;
  recommendedAudienceLabel: string;
  recommendedStrategy: Strategy;
  recommendedStrategyLabel: string;
  headline: string;
  audienceRanking: RankedAudience[];
  strategyRanking: RankedStrategy[];
  cells: ComboCell[];
}

export interface RecommendationMeta {
  schemaVersion: "recommendation.v1";
  weights: { roas: number; gmv: number };
  priorStrength: number;
  totals: { records: number; groups: number };
}

export interface RecommendationResult extends RecommendationMeta {
  groups: GroupRecommendation[];
}

export interface RecommendationWeights {
  roasWeight?: number;
  gmvWeight?: number;
  priorStrength?: number;
}

function buildQuery(opts: RecommendationWeights = {}): string {
  const params = new URLSearchParams();
  if (opts.roasWeight !== undefined) params.set("roasWeight", String(opts.roasWeight));
  if (opts.gmvWeight !== undefined) params.set("gmvWeight", String(opts.gmvWeight));
  if (opts.priorStrength !== undefined) {
    params.set("priorStrength", String(opts.priorStrength));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Recommendations for every (商品一级类目 × 商品成交类型) group with data. */
export function getDashboardRecommendations(opts: RecommendationWeights = {}) {
  return fetchJson<RecommendationResult>(
    `/api/dashboard/recommendations${buildQuery(opts)}`,
  );
}

/** Recommendation for one group; rejects (404) when the group has no data. */
export function getGroupRecommendation(
  productCategory: ProductCategory,
  dealType: DealType,
  opts: RecommendationWeights = {},
) {
  const path =
    `/api/dashboard/recommendations/${encodeURIComponent(productCategory)}` +
    `/${encodeURIComponent(dealType)}`;
  return fetchJson<{ data: GroupRecommendation; meta: RecommendationMeta }>(
    `${path}${buildQuery(opts)}`,
  );
}
