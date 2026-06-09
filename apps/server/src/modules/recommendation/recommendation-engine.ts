/**
 * 投放策略推荐引擎 (Placement-strategy recommendation engine) — pure core.
 *
 * Given a flat list of published-video performance records (each carrying its
 * four creative factors plus cumulative投放 metrics), this engine answers one
 * question per business group:
 *
 *   For a group defined by 商品一级类目 (productCategory) × 商品成交类型
 *   (dealType), which 适用人群 (audience) and 推销手法 (strategy) deliver the
 *   best return — judged by ROAS (effectiveness) and GMV (scale)?
 *
 * Design notes
 * ------------
 * - This file is intentionally DB-agnostic and side-effect free. It consumes
 *   plain {@link PerformanceRecord}s and returns plain data, so it can be unit
 *   tested without Postgres and reused by any caller (API, script, future job).
 * - "Average ROAS" over a group is computed as Σgmv / Σspend — a spend-weighted
 *   mean, which is the financially correct way to average a ratio. The naive
 *   per-video mean is also exposed as {@link FactorCellMetrics.avgRoas}.
 * - Two factors (ROAS, GMV) are combined into one comparable score. ROAS alone
 *   rewards tiny-but-efficient cells; GMV alone rewards big-spend cells.
 * - Small cells are pulled toward the group baseline by empirical-Bayes
 *   shrinkage so a single lucky video cannot top the ranking.
 *
 * See docs/auto_report/report.md for the full method write-up.
 */
import {
  AUDIENCE_LABELS,
  DEAL_TYPE_LABELS,
  PRODUCT_CATEGORY_LABELS,
  STRATEGY_LABELS,
  type Audience,
  type CreativeFactors,
  type DealType,
  type ProductCategory,
  type Strategy,
} from "@aigc-video/shared";

export const RECOMMENDATION_SCHEMA_VERSION = "recommendation.v1" as const;

// ─── Inputs ──────────────────────────────────────────────────────────────────

/** One published video's cumulative投放 result, tagged with its creative factors. */
export interface PerformanceRecord {
  creativeFactors: CreativeFactors;
  impressions: number;
  clicks: number;
  conversions: number;
  spendCents: number;
  gmvCents: number;
  /** Optional provenance, surfaced back for traceability. */
  publicationId?: string;
  platform?: string;
  accountName?: string;
}

export interface RecommendationOptions {
  /** Weight on the ROAS axis of the composite score. Default 0.6. */
  roasWeight?: number;
  /** Weight on the GMV axis of the composite score. Default 0.4. */
  gmvWeight?: number;
  /**
   * Empirical-Bayes pseudo-count. A cell with `n` samples keeps weight
   * `n / (n + priorStrength)` on its own ROAS/GMV and borrows the rest from the
   * group baseline. Higher = more conservative for small cells. Default 2.
   */
  priorStrength?: number;
}

type Confidence = "high" | "medium" | "low";

// ─── Outputs ─────────────────────────────────────────────────────────────────

export interface FactorCellMetrics {
  sampleCount: number;
  impressions: number;
  clicks: number;
  conversions: number;
  spendCents: number;
  gmvCents: number;
  /** Spend-weighted ROAS: Σgmv / Σspend. */
  roas: number;
  /** Unweighted mean of per-video ROAS (records with spend > 0). */
  avgRoas: number;
  ctr: number;
  cvr: number;
  gmvPerVideoCents: number;
  /** Cost per acquisition (spend / conversions), in cents. */
  cpaCents: number;
}

export interface ScoredFactorMetrics extends FactorCellMetrics {
  /** ROAS after shrinkage toward the group baseline. */
  adjRoas: number;
  /** GMV-per-video after shrinkage toward the group baseline, in cents. */
  adjGmvPerVideoCents: number;
  /** Composite 0..1 score (within-group, normalized). */
  score: number;
  rank: number;
  confidence: Confidence;
}

/** A single (audience, strategy) cell of the group's performance matrix. */
export interface ComboCell extends ScoredFactorMetrics {
  audience: Audience;
  audienceLabel: string;
  strategy: Strategy;
  strategyLabel: string;
}

/** A marginal ranking entry for one factor value (audience- or strategy-level). */
export interface RankedFactor<T extends string> extends ScoredFactorMetrics {
  value: T;
  label: string;
  /** Share of the group's total GMV attributable to this factor value. */
  gmvShareOfGroup: number;
  isRecommended: boolean;
}

export interface GroupRecommendation {
  groupKey: string;
  productCategory: ProductCategory;
  productCategoryLabel: string;
  dealType: DealType;
  dealTypeLabel: string;
  /** Total publication records in the group. */
  publicationCount: number;
  /** Distinct (audience, strategy) cells observed. */
  comboCount: number;
  groupRoas: number;
  groupAvgRoas: number;
  groupSpendCents: number;
  groupGmvCents: number;
  groupGmvPerVideoCents: number;
  confidence: Confidence;
  /** Headline recommendation: the top joint (audience × strategy) cell. */
  bestCombo: ComboCell;
  recommendedAudience: Audience;
  recommendedAudienceLabel: string;
  recommendedStrategy: Strategy;
  recommendedStrategyLabel: string;
  /** Human-readable (zh) rationale for the headline recommendation. */
  headline: string;
  /** Marginal audience ranking (aggregated across strategies). */
  audienceRanking: RankedFactor<Audience>[];
  /** Marginal strategy ranking (aggregated across audiences). */
  strategyRanking: RankedFactor<Strategy>[];
  /** Full (audience × strategy) matrix, ranked by score. */
  cells: ComboCell[];
}

export interface RecommendationResult {
  schemaVersion: typeof RECOMMENDATION_SCHEMA_VERSION;
  weights: { roas: number; gmv: number };
  priorStrength: number;
  totals: { records: number; groups: number };
  groups: GroupRecommendation[];
}

// ─── Numeric helpers ─────────────────────────────────────────────────────────

const ratio = (num: number, den: number) => (den > 0 ? num / den : 0);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Min-max normalize; when all values are equal, every value is treated as best. */
function safeNorm(value: number, min: number, max: number): number {
  if (!(max > min)) return 1;
  return clamp01((value - min) / (max - min));
}

function confidenceFor(sampleCount: number): Confidence {
  if (sampleCount >= 4) return "high";
  if (sampleCount >= 2) return "medium";
  return "low";
}

function emptyTotals() {
  return {
    sampleCount: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    spendCents: 0,
    gmvCents: 0,
    roasSum: 0, // Σ of per-record roas, for the unweighted mean
    roasSamples: 0, // count of records with spend > 0
  };
}
type Accum = ReturnType<typeof emptyTotals>;

function addRecord(acc: Accum, r: PerformanceRecord): void {
  acc.sampleCount += 1;
  acc.impressions += r.impressions;
  acc.clicks += r.clicks;
  acc.conversions += r.conversions;
  acc.spendCents += r.spendCents;
  acc.gmvCents += r.gmvCents;
  if (r.spendCents > 0) {
    acc.roasSum += r.gmvCents / r.spendCents;
    acc.roasSamples += 1;
  }
}

function finalizeMetrics(acc: Accum): FactorCellMetrics {
  return {
    sampleCount: acc.sampleCount,
    impressions: acc.impressions,
    clicks: acc.clicks,
    conversions: acc.conversions,
    spendCents: acc.spendCents,
    gmvCents: acc.gmvCents,
    roas: ratio(acc.gmvCents, acc.spendCents),
    avgRoas: ratio(acc.roasSum, acc.roasSamples),
    ctr: ratio(acc.clicks, acc.impressions),
    cvr: ratio(acc.conversions, acc.clicks),
    gmvPerVideoCents: ratio(acc.gmvCents, acc.sampleCount),
    cpaCents: ratio(acc.spendCents, acc.conversions),
  };
}

/** Shrink a cell statistic toward the group baseline by sample-count credibility. */
function shrink(cellValue: number, baseline: number, n: number, prior: number): number {
  const w = n / (n + prior);
  return w * cellValue + (1 - w) * baseline;
}

// ─── Scoring of a set of factor cells within one group ───────────────────────

interface ScoringContext {
  groupRoas: number;
  groupGmvPerVideoCents: number;
  roasW: number;
  gmvW: number;
  prior: number;
}

/**
 * Given finalized metrics per cell, attach shrinkage + a within-set composite
 * score, then rank. Shared by the joint matrix and the marginal rankings.
 */
function scoreAndRank<C extends FactorCellMetrics>(
  cells: C[],
  ctx: ScoringContext,
): Array<C & ScoredFactorMetrics> {
  const adjusted = cells.map((cell) => ({
    cell,
    adjRoas: shrink(cell.roas, ctx.groupRoas, cell.sampleCount, ctx.prior),
    adjGmv: shrink(
      cell.gmvPerVideoCents,
      ctx.groupGmvPerVideoCents,
      cell.sampleCount,
      ctx.prior,
    ),
  }));

  const roasVals = adjusted.map((a) => a.adjRoas);
  const gmvVals = adjusted.map((a) => a.adjGmv);
  const minRoas = Math.min(...roasVals);
  const maxRoas = Math.max(...roasVals);
  const minGmv = Math.min(...gmvVals);
  const maxGmv = Math.max(...gmvVals);

  const scored = adjusted.map(({ cell, adjRoas, adjGmv }) => {
    const roasNorm = safeNorm(adjRoas, minRoas, maxRoas);
    const gmvNorm = safeNorm(adjGmv, minGmv, maxGmv);
    const score = ctx.roasW * roasNorm + ctx.gmvW * gmvNorm;
    return {
      ...cell,
      adjRoas,
      adjGmvPerVideoCents: adjGmv,
      score,
      rank: 0,
      confidence: confidenceFor(cell.sampleCount),
    } as C & ScoredFactorMetrics;
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.adjRoas - a.adjRoas ||
      b.gmvCents - a.gmvCents ||
      b.sampleCount - a.sampleCount,
  );
  scored.forEach((cell, index) => {
    cell.rank = index + 1;
  });
  return scored;
}

// ─── Headline rationale ──────────────────────────────────────────────────────

const yuan = (cents: number) => (cents / 100).toFixed(0);

function buildHeadline(
  productCategoryLabel: string,
  dealTypeLabel: string,
  best: ComboCell,
  groupRoas: number,
): string {
  const lift =
    groupRoas > 0
      ? `${(((best.adjRoas - groupRoas) / groupRoas) * 100).toFixed(0)}%`
      : "n/a";
  const confLabel =
    best.confidence === "high" ? "高" : best.confidence === "medium" ? "中" : "低";
  return (
    `在「${productCategoryLabel} × ${dealTypeLabel}」分组下，推荐` +
    `【适用人群：${best.audienceLabel}】+【推销手法：${best.strategyLabel}】。` +
    `该组合平均ROAS ${best.roas.toFixed(2)}、单视频GMV ${yuan(best.gmvPerVideoCents)}元，` +
    `较组内基准ROAS（${groupRoas.toFixed(2)}）约 ${lift}，` +
    `样本 ${best.sampleCount} 条，置信度${confLabel}。`
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

const groupKeyOf = (c: CreativeFactors) => `${c.productCategory}::${c.dealType}`;

/**
 * Build per-group (商品一级类目 × 商品成交类型) recommendations from raw
 * performance records.
 */
export function recommendFromRecords(
  records: PerformanceRecord[],
  options: RecommendationOptions = {},
): RecommendationResult {
  const rawRoasW = options.roasWeight ?? 0.6;
  const rawGmvW = options.gmvWeight ?? 0.4;
  const weightSum = rawRoasW + rawGmvW || 1;
  const roasW = rawRoasW / weightSum;
  const gmvW = rawGmvW / weightSum;
  const prior = options.priorStrength ?? 2;

  // Partition records by group.
  const byGroup = new Map<string, PerformanceRecord[]>();
  for (const record of records) {
    const key = groupKeyOf(record.creativeFactors);
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(record);
    else byGroup.set(key, [record]);
  }

  const groups: GroupRecommendation[] = [];
  for (const [groupKey, groupRecords] of byGroup) {
    const firstRecord = groupRecords[0];
    if (!firstRecord) continue; // unreachable: buckets are never empty
    const { productCategory, dealType } = firstRecord.creativeFactors;

    // Group baseline.
    const groupAcc = emptyTotals();
    for (const r of groupRecords) addRecord(groupAcc, r);
    const groupMetrics = finalizeMetrics(groupAcc);
    const ctx: ScoringContext = {
      groupRoas: groupMetrics.roas,
      groupGmvPerVideoCents: groupMetrics.gmvPerVideoCents,
      roasW,
      gmvW,
      prior,
    };

    const cells = scoreJointCells(groupRecords, ctx);
    const audienceRanking = rankMarginal(
      groupRecords,
      (c) => c.creativeFactors.audience,
      AUDIENCE_LABELS,
      groupMetrics.gmvCents,
      ctx,
    );
    const strategyRanking = rankMarginal(
      groupRecords,
      (c) => c.creativeFactors.strategy,
      STRATEGY_LABELS,
      groupMetrics.gmvCents,
      ctx,
    );

    const bestCombo = cells[0];
    if (!bestCombo) continue; // unreachable: a non-empty group has ≥1 cell
    const productCategoryLabel = PRODUCT_CATEGORY_LABELS[productCategory];
    const dealTypeLabel = DEAL_TYPE_LABELS[dealType];

    groups.push({
      groupKey,
      productCategory,
      productCategoryLabel,
      dealType,
      dealTypeLabel,
      publicationCount: groupMetrics.sampleCount,
      comboCount: cells.length,
      groupRoas: groupMetrics.roas,
      groupAvgRoas: groupMetrics.avgRoas,
      groupSpendCents: groupMetrics.spendCents,
      groupGmvCents: groupMetrics.gmvCents,
      groupGmvPerVideoCents: groupMetrics.gmvPerVideoCents,
      confidence: confidenceFor(groupMetrics.sampleCount),
      bestCombo,
      recommendedAudience: bestCombo.audience,
      recommendedAudienceLabel: bestCombo.audienceLabel,
      recommendedStrategy: bestCombo.strategy,
      recommendedStrategyLabel: bestCombo.strategyLabel,
      headline: buildHeadline(
        productCategoryLabel,
        dealTypeLabel,
        bestCombo,
        groupMetrics.roas,
      ),
      audienceRanking,
      strategyRanking,
      cells,
    });
  }

  // Most commercially material groups first.
  groups.sort((a, b) => b.groupGmvCents - a.groupGmvCents);

  return {
    schemaVersion: RECOMMENDATION_SCHEMA_VERSION,
    weights: { roas: roasW, gmv: gmvW },
    priorStrength: prior,
    totals: { records: records.length, groups: groups.length },
    groups,
  };
}

function scoreJointCells(
  groupRecords: PerformanceRecord[],
  ctx: ScoringContext,
): ComboCell[] {
  const byCombo = new Map<string, { audience: Audience; strategy: Strategy; acc: Accum }>();
  for (const record of groupRecords) {
    const { audience, strategy } = record.creativeFactors;
    const key = `${audience}::${strategy}`;
    let entry = byCombo.get(key);
    if (!entry) {
      entry = { audience, strategy, acc: emptyTotals() };
      byCombo.set(key, entry);
    }
    addRecord(entry.acc, record);
  }

  const base = [...byCombo.values()].map((entry) => ({
    audience: entry.audience,
    audienceLabel: AUDIENCE_LABELS[entry.audience],
    strategy: entry.strategy,
    strategyLabel: STRATEGY_LABELS[entry.strategy],
    ...finalizeMetrics(entry.acc),
  }));

  return scoreAndRank(base, ctx);
}

function rankMarginal<T extends string>(
  groupRecords: PerformanceRecord[],
  pick: (record: PerformanceRecord) => T,
  labels: Record<T, string>,
  groupGmvCents: number,
  ctx: ScoringContext,
): RankedFactor<T>[] {
  const byValue = new Map<T, Accum>();
  for (const record of groupRecords) {
    const value = pick(record);
    let acc = byValue.get(value);
    if (!acc) {
      acc = emptyTotals();
      byValue.set(value, acc);
    }
    addRecord(acc, record);
  }

  const base = [...byValue.entries()].map(([value, acc]) => ({
    value,
    label: labels[value],
    gmvShareOfGroup: ratio(acc.gmvCents, groupGmvCents),
    isRecommended: false,
    ...finalizeMetrics(acc),
  }));

  const ranked = scoreAndRank(base, ctx) as RankedFactor<T>[];
  const top = ranked[0];
  if (top) top.isRecommended = true;
  return ranked;
}
