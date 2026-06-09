import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  audienceSchema,
  dealTypeSchema,
  productCategorySchema,
  strategySchema,
} from "@aigc-video/shared";
import { loadDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";

describe("dashboard analytics seed data contract", () => {
  it("exposes every section needed by the 分析诊断看板", async () => {
    const snapshot = await loadDashboardAnalyticsSnapshot();

    assert.equal(snapshot.schemaVersion, "dashboard-analytics-seed");
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
      Object.keys(snapshot.factorCatalog.productCategories).sort(),
      [...productCategorySchema.options].sort(),
    );
    assert.deepEqual(
      Object.keys(snapshot.factorCatalog.dealTypes).sort(),
      [...dealTypeSchema.options].sort(),
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

  it("keeps every sample video tied to the full four dashboard attribution factors", async () => {
    const snapshot = await loadDashboardAnalyticsSnapshot();

    for (const video of snapshot.videos) {
      assert.equal("productCategory" in video.creativeFactors, true);
      assert.doesNotThrow(() =>
        productCategorySchema.parse(video.creativeFactors.productCategory),
      );
      assert.doesNotThrow(() => dealTypeSchema.parse(video.creativeFactors.dealType));
      assert.doesNotThrow(() => audienceSchema.parse(video.creativeFactors.audience));
      assert.doesNotThrow(() => strategySchema.parse(video.creativeFactors.strategy));
    }
  });
});
