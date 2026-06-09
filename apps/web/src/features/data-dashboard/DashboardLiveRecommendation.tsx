import { Check, ChevronRight, TrendingUp } from "lucide-react";
import {
  AUDIENCE_LABELS,
  STRATEGY_LABELS,
  type CreativeFactors,
} from "@aigc-video/shared";
import { DashboardSegmented } from "./DashboardControls.js";
import type { WeightMode } from "./dashboardTypes.js";
import type {
  GroupRecommendation,
  RecommendationConfidence,
} from "../../lib/api/dashboardRecommendations.js";

const WEIGHT_OPTIONS: { value: WeightMode; label: string }[] = [
  { value: "roas", label: "效率优先" },
  { value: "gmv", label: "规模优先" },
];

const CONFIDENCE_LABELS: Record<RecommendationConfidence, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

/**
 * Live 投放策略推荐 panel — replaces the static StrategyRec. Driven by the
 * engine's recommendation for the selected video's (商品一级类目 × 商品成交类型)
 * group: recommended 适用人群 + 推销手法, confidence, the zh headline, a
 * 效率/规模 优先 weight toggle, and per-推销手法 ROAS ranking bars.
 */
export function DashboardLiveRecommendation({
  recommendation,
  loading,
  error,
  weightMode,
  onWeightModeChange,
  selectedFactors,
}: {
  recommendation: GroupRecommendation | null;
  loading: boolean;
  error: string | null;
  weightMode: WeightMode;
  onWeightModeChange: (mode: WeightMode) => void;
  selectedFactors: CreativeFactors;
}) {
  return (
    <div className="dash-srec">
      <div className="dash-srec-toggle">
        <span className="dash-srec-kicker">推荐权重</span>
        <DashboardSegmented
          options={WEIGHT_OPTIONS}
          value={weightMode}
          onChange={onWeightModeChange}
        />
      </div>
      <RecommendationBody
        recommendation={recommendation}
        loading={loading}
        error={error}
        selectedFactors={selectedFactors}
      />
    </div>
  );
}

function RecommendationBody({
  recommendation,
  loading,
  error,
  selectedFactors,
}: {
  recommendation: GroupRecommendation | null;
  loading: boolean;
  error: string | null;
  selectedFactors: CreativeFactors;
}) {
  if (loading) {
    return <p className="dash-srec-note">正在计算最优投放策略…</p>;
  }
  if (error) {
    return <p className="dash-srec-note">策略推荐加载失败：{error}</p>;
  }
  if (!recommendation) {
    return (
      <p className="dash-srec-note">
        该「商品一级类目 × 商品成交类型」分组暂无足够投放数据，无法给出推荐。
      </p>
    );
  }

  const currentAudience = AUDIENCE_LABELS[selectedFactors.audience] ?? "当前人群";
  const currentStrategy = STRATEGY_LABELS[selectedFactors.strategy] ?? "当前手法";
  const maxRoas = Math.max(
    ...recommendation.strategyRanking.map((entry) => entry.roas),
    0.0001,
  );

  return (
    <>
      <div className="dash-srec-switch">
        <div className="dash-srec-col dash-srec-cur">
          <span className="dash-srec-kicker">当前组合</span>
          <span className="dash-srec-name">{currentStrategy}</span>
          <span className="dash-srec-flow">人群：{currentAudience}</span>
        </div>
        <div className="dash-srec-arrow">
          <ChevronRight size={18} strokeWidth={2} />
        </div>
        <div className="dash-srec-col dash-srec-sug">
          <span className="dash-srec-kicker">建议采用</span>
          <span className="dash-srec-name">
            {recommendation.recommendedStrategyLabel}
            <i className="dash-srec-lift">
              置信度 {CONFIDENCE_LABELS[recommendation.confidence]}
            </i>
          </span>
          <span className="dash-srec-flow">
            人群：{recommendation.recommendedAudienceLabel}
          </span>
        </div>
      </div>

      <p className="dash-srec-note">{recommendation.headline}</p>

      <div className="dash-srec-rank">
        <div className="dash-srec-rank-hd">本分组各推销手法平均 ROAS</div>
        {recommendation.strategyRanking.map((entry) => {
          const isBest = entry.isRecommended;
          const isCurrent = entry.value === selectedFactors.strategy;
          return (
            <div
              key={entry.value}
              className={
                "dash-srank-row" +
                (isBest ? " is-best" : "") +
                (isCurrent ? " is-cur" : "")
              }
            >
              <span className="dash-srank-name">
                {entry.label}
                {isBest ? <i className="dash-srank-tag rec">推荐</i> : null}
                {isCurrent ? <i className="dash-srank-tag cur">当前</i> : null}
              </span>
              <span className="dash-srank-bar">
                <i style={{ width: `${(entry.roas / maxRoas) * 100}%` }} />
              </span>
              <span className="dash-srank-val">{entry.roas.toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      <ul className="dash-srec-reasons">
        <li>
          <Check size={13} strokeWidth={2.4} />
          推荐人群「{recommendation.recommendedAudienceLabel}」贡献本分组
          {(audienceGmvShare(recommendation) * 100).toFixed(0)}% 的 GMV
        </li>
        <li>
          <TrendingUp size={13} strokeWidth={2.4} />
          最优组合平均 ROAS {recommendation.bestCombo.roas.toFixed(2)}，组内基准
          {recommendation.groupRoas.toFixed(2)}
        </li>
      </ul>
    </>
  );
}

function audienceGmvShare(recommendation: GroupRecommendation): number {
  const recommended = recommendation.audienceRanking.find(
    (entry) => entry.value === recommendation.recommendedAudience,
  );
  return recommended?.gmvShareOfGroup ?? 0;
}
