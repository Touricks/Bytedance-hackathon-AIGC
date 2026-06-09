import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreativeFactors } from "@aigc-video/shared";
import { DashboardComboMatrix } from "./DashboardComboMatrix.js";
import type {
  ComboCell,
  GroupRecommendation,
} from "../../lib/api/dashboardRecommendations.js";

const selectedFactors: CreativeFactors = {
  productCategory: "beauty-personal-care",
  dealType: "seeding-nonstandard",
  audience: "general",
  strategy: "pain-solution",
};

function cell(
  audience: string,
  audienceLabel: string,
  strategy: string,
  strategyLabel: string,
  roas: number,
  rank: number,
): ComboCell {
  return {
    audience: audience as CreativeFactors["audience"],
    audienceLabel,
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
    confidence: "medium",
  };
}

function recommendation(cells: ComboCell[]): GroupRecommendation {
  const best = cells.find((c) => c.rank === 1) ?? cells[0]!;
  return {
    groupKey: "beauty-personal-care::seeding-nonstandard",
    productCategory: "beauty-personal-care",
    productCategoryLabel: "美妆个护",
    dealType: "seeding-nonstandard",
    dealTypeLabel: "种草型非标品",
    publicationCount: 7,
    comboCount: cells.length,
    groupRoas: 4.5,
    groupAvgRoas: 4.32,
    groupSpendCents: 30000,
    groupGmvCents: 135000,
    groupGmvPerVideoCents: 19285,
    confidence: "high",
    bestCombo: best,
    recommendedAudience: best.audience,
    recommendedAudienceLabel: best.audienceLabel,
    recommendedStrategy: best.strategy,
    recommendedStrategyLabel: best.strategyLabel,
    headline: "headline",
    audienceRanking: [],
    strategyRanking: [],
    cells,
  };
}

function render(rec: GroupRecommendation | null, loading = false) {
  return renderToStaticMarkup(
    React.createElement(DashboardComboMatrix, {
      recommendation: rec,
      loading,
      selectedFactors,
    }),
  );
}

describe("DashboardComboMatrix", () => {
  const cells = [
    cell("youth", "青年", "scenario-demo", "场景演示", 5.48, 1),
    cell("youth", "青年", "emotional-story", "情绪故事", 3.84, 2),
    cell("general", "不限定", "pain-solution", "痛点解决", 3.0, 3),
  ];

  it("renders the audience × strategy axes and stars the best cell", () => {
    const html = render(recommendation(cells));

    // Axis header + axis labels (both audiences and strategies appear).
    assert.match(html, /适用人群 \\ 推销手法/);
    assert.match(html, /场景演示/);
    assert.match(html, /情绪故事/);
    assert.match(html, /痛点解决/);
    assert.match(html, /青年/);
    assert.match(html, /不限定/);
    // Metric values + best-cell star.
    assert.match(html, /5\.48/);
    assert.match(html, /★/);
    // Best-combo legend names the rank-1 cell.
    assert.match(html, /最优组合：青年 × 场景演示/);
    // The selected video's audience (不限定) is flagged 现.
    assert.match(html, /现/);
  });

  it("renders a placeholder when there is no recommendation", () => {
    assert.match(render(null), /分组暂无足够投放数据/);
  });

  it("renders a loading state", () => {
    assert.match(render(null, true), /正在计算各组合效果/);
  });
});
