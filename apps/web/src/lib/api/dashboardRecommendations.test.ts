import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getDashboardRecommendations,
  getGroupRecommendation,
  type GroupRecommendation,
} from "./dashboardRecommendations.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function groupFixture(): GroupRecommendation {
  const cell = {
    audience: "youth" as const,
    audienceLabel: "青年",
    strategy: "scenario-demo" as const,
    strategyLabel: "场景演示",
    sampleCount: 3,
    impressions: 100,
    clicks: 10,
    conversions: 2,
    spendCents: 1000,
    gmvCents: 5000,
    roas: 5,
    avgRoas: 5,
    ctr: 0.1,
    cvr: 0.2,
    gmvPerVideoCents: 1666,
    cpaCents: 500,
    adjRoas: 4.8,
    adjGmvPerVideoCents: 1600,
    score: 1,
    rank: 1,
    confidence: "medium" as const,
  };
  return {
    groupKey: "美妆个护::种草型非标品",
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
    bestCombo: cell,
    recommendedAudience: "youth",
    recommendedAudienceLabel: "青年",
    recommendedStrategy: "scenario-demo",
    recommendedStrategyLabel: "场景演示",
    headline: "推荐 青年 + 场景演示",
    audienceRanking: [
      { ...cell, value: "youth", label: "青年", gmvShareOfGroup: 0.8, isRecommended: true },
    ],
    strategyRanking: [
      {
        ...cell,
        value: "scenario-demo",
        label: "场景演示",
        gmvShareOfGroup: 0.8,
        isRecommended: true,
      },
    ],
    cells: [cell],
  };
}

describe("dashboard recommendations api client", () => {
  it("requests all-group recommendations with weight query params", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (url, init) => {
      assert.equal(init?.method ?? "GET", "GET");
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          schemaVersion: "recommendation.v1",
          weights: { roas: 0.8, gmv: 0.2 },
          priorStrength: 2,
          totals: { records: 7, groups: 1 },
          groups: [groupFixture()],
        }),
        { status: 200 },
      );
    };

    const result = await getDashboardRecommendations({ roasWeight: 0.8, gmvWeight: 0.2 });

    // List endpoint returns a bare RecommendationResult (no `data` wrapper).
    assert.equal(result.schemaVersion, "recommendation.v1");
    assert.equal(result.groups[0]?.recommendedStrategy, "scenario-demo");
    assert.deepEqual(calls, [
      "http://localhost:3000/api/dashboard/recommendations?roasWeight=0.8&gmvWeight=0.2",
    ]);
  });

  it("requests a single group and unwraps { data, meta }", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (url, init) => {
      assert.equal(init?.method ?? "GET", "GET");
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          data: groupFixture(),
          meta: {
            schemaVersion: "recommendation.v1",
            weights: { roas: 0.4, gmv: 0.6 },
            priorStrength: 2,
            totals: { records: 7, groups: 5 },
          },
        }),
        { status: 200 },
      );
    };

    const result = await getGroupRecommendation(
      "beauty-personal-care",
      "seeding-nonstandard",
      { roasWeight: 0.4, gmvWeight: 0.6 },
    );

    assert.equal(result.data.recommendedAudience, "youth");
    assert.equal(result.meta.weights.gmv, 0.6);
    assert.deepEqual(calls, [
      "http://localhost:3000/api/dashboard/recommendations/beauty-personal-care/seeding-nonstandard?roasWeight=0.4&gmvWeight=0.6",
    ]);
  });

  it("omits the query string when no weights are given", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          schemaVersion: "recommendation.v1",
          weights: { roas: 0.6, gmv: 0.4 },
          priorStrength: 2,
          totals: { records: 0, groups: 0 },
          groups: [],
        }),
        { status: 200 },
      );
    };

    await getDashboardRecommendations();
    assert.deepEqual(calls, ["http://localhost:3000/api/dashboard/recommendations"]);
  });
});
