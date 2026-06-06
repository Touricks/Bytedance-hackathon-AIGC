import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  audienceSchema,
  creativeFactorsSchema,
  productTypeSchema,
  strategySchema,
} from "@aigc-video/shared";
import { loadDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";

describe("dashboard analytics seed data contract", () => {
  it("exposes every section needed by the 分析诊断看板", async () => {
    const snapshot = await loadDashboardAnalyticsSnapshot();

    assert.equal(snapshot.schemaVersion, "dashboard-analytics-seed.v1");
    assert.ok(snapshot.fieldGuide.sections.kpis.includes("CTR"));
    assert.deepEqual(Object.keys(snapshot).sort(), [
      "assistantPresets",
      "channels",
      "diagnosis",
      "factorCatalog",
      "fieldGuide",
      "filters",
      "funnel",
      "kpis",
      "meta",
      "schemaVersion",
      "strategyMatrix",
      "strategyRecommendation",
      "user",
      "videos",
    ]);
  });

  it("documents unavailable performance metrics without exposing a mock frontend mode", async () => {
    const snapshot = await loadDashboardAnalyticsSnapshot();

    assert.deepEqual(snapshot.meta.syntheticMetricKeys.sort(), [
      "complete",
      "ctr",
      "cvr",
      "funnel",
      "gmv",
      "retain3s",
      "roas",
    ]);
    assert.doesNotMatch(JSON.stringify(snapshot.meta), /mock frontend/i);
  });

  it("covers the creative factor catalog from the shared factor enums", async () => {
    const snapshot = await loadDashboardAnalyticsSnapshot();

    assert.deepEqual(
      Object.keys(snapshot.factorCatalog.productTypes).sort(),
      [...productTypeSchema.options].sort(),
    );
    assert.deepEqual(
      Object.keys(snapshot.factorCatalog.audiences).sort(),
      [...audienceSchema.options].sort(),
    );
    assert.deepEqual(
      Object.keys(snapshot.factorCatalog.strategies).sort(),
      [...strategySchema.options].sort(),
    );
    assert.equal(
      snapshot.factorCatalog.strategies["pain-solution"].flow,
      "痛点出现 -> 原因解释 -> 解决方式 -> 证据证明 -> 行动引导。",
    );
  });

  it("keeps every sample video tied to a valid creative factor snapshot", async () => {
    const snapshot = await loadDashboardAnalyticsSnapshot();

    for (const video of snapshot.videos) {
      assert.doesNotThrow(() => creativeFactorsSchema.parse(video.creativeFactors));
    }
  });
});
