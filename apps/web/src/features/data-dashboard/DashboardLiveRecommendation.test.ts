import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreativeFactors } from "@aigc-video/shared";
import { DashboardLiveRecommendation } from "./DashboardLiveRecommendation.js";
import type { GroupRecommendation } from "../../lib/api/dashboardRecommendations.js";

const selectedFactors: CreativeFactors = {
  productCategory: "beauty-personal-care",
  dealType: "seeding-nonstandard",
  audience: "general",
  strategy: "pain-solution",
};

function cell(strategy: string, strategyLabel: string, roas: number, rank: number) {
  return {
    audience: "youth" as const,
    audienceLabel: "青年",
    strategy: strategy as CreativeFactors["strategy"],
    strategyLabel,
    sampleCount: 3,
    impressions: 100,
    clicks: 10,
    conversions: 2,
    spendCents: 1000,
    gmvCents: Math.round(roas * 1000),
    roas,
    avgRoas: roas,
    ctr: 0.1,
    cvr: 0.2,
    gmvPerVideoCents: Math.round((roas * 1000) / 3),
    cpaCents: 500,
    adjRoas: roas - 0.2,
    adjGmvPerVideoCents: 1600,
    score: rank === 1 ? 1 : 0.3,
    rank,
    confidence: "medium" as const,
  };
}

function recommendation(): GroupRecommendation {
  const best = cell("scenario-demo", "场景演示", 5.48, 1);
  return {
    groupKey: "beauty-personal-care::seeding-nonstandard",
    productCategory: "beauty-personal-care",
    productCategoryLabel: "美妆个护",
    dealType: "seeding-nonstandard",
    dealTypeLabel: "种草型非标品",
    publicationCount: 7,
    comboCount: 3,
    groupRoas: 4.5,
    groupAvgRoas: 4.32,
    groupSpendCents: 30000,
    groupGmvCents: 135000,
    groupGmvPerVideoCents: 19285,
    confidence: "high",
    bestCombo: best,
    recommendedAudience: "youth",
    recommendedAudienceLabel: "青年",
    recommendedStrategy: "scenario-demo",
    recommendedStrategyLabel: "场景演示",
    headline: "在「美妆个护 × 种草型非标品」分组下，推荐【适用人群：青年】+【推销手法：场景演示】。",
    audienceRanking: [
      { ...best, value: "youth", label: "青年", gmvShareOfGroup: 0.84, isRecommended: true },
    ],
    strategyRanking: [
      { ...best, value: "scenario-demo", label: "场景演示", gmvShareOfGroup: 0.6, isRecommended: true },
      { ...cell("pain-solution", "痛点解决", 3.0, 3), value: "pain-solution", label: "痛点解决", gmvShareOfGroup: 0.2, isRecommended: false },
    ],
    cells: [best],
  };
}

function render(props: Partial<Parameters<typeof DashboardLiveRecommendation>[0]> = {}) {
  return renderToStaticMarkup(
    React.createElement(DashboardLiveRecommendation, {
      recommendation: null,
      loading: false,
      error: null,
      weightMode: "roas",
      onWeightModeChange: () => undefined,
      selectedFactors,
      ...props,
    }),
  );
}

describe("DashboardLiveRecommendation", () => {
  it("renders the recommended factors, headline, confidence and ROAS bars", () => {
    const html = render({ recommendation: recommendation() });

    assert.match(html, /效率优先/);
    assert.match(html, /规模优先/);
    // Recommended factors + headline.
    assert.match(html, /场景演示/);
    assert.match(html, /人群：青年/);
    assert.match(html, /推荐【适用人群：青年】/);
    // Confidence badge (group confidence = high → 高).
    assert.match(html, /置信度 高/);
    // ROAS ranking values rendered.
    assert.match(html, /5\.48/);
    assert.match(html, /3\.00/);
    // The current strategy (pain-solution) is flagged 当前.
    assert.match(html, /当前/);
    // The recommended strategy is flagged 推荐.
    assert.match(html, /推荐/);
  });

  it("renders a loading state", () => {
    const html = render({ loading: true });
    assert.match(html, /正在计算最优投放策略/);
  });

  it("renders the no-data placeholder when recommendation is null", () => {
    const html = render({ recommendation: null });
    assert.match(html, /分组暂无足够投放数据/);
  });

  it("renders an error message", () => {
    const html = render({ error: "boom" });
    assert.match(html, /策略推荐加载失败：boom/);
  });
});
