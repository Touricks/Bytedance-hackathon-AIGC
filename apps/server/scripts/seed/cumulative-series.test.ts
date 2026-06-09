import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCumulativeSeries, type MetricCounts } from "./cumulative-series.js";

const FINAL: MetricCounts = {
  impressions: 200_000,
  clicks: 5_000,
  conversions: 320,
  spendCents: 800_000,
  gmvCents: 4_200_000,
};
const START = "2026-05-20T00:00:00.000Z";

const METRIC_KEYS: (keyof MetricCounts)[] = [
  "impressions",
  "clicks",
  "conversions",
  "spendCents",
  "gmvCents",
];

describe("buildCumulativeSeries", () => {
  it("produces exactly one snapshot per day", () => {
    assert.equal(buildCumulativeSeries(FINAL, 14, START).length, 14);
    assert.equal(buildCumulativeSeries(FINAL, 1, START).length, 1);
  });

  it("ends the series exactly at the final totals", () => {
    const series = buildCumulativeSeries(FINAL, 14, START);
    const last = series[series.length - 1];
    for (const key of METRIC_KEYS) {
      assert.equal(last[key], FINAL[key], `last ${key}`);
    }
  });

  it("is monotonically non-decreasing for every metric", () => {
    const series = buildCumulativeSeries(FINAL, 30, START);
    for (let i = 1; i < series.length; i++) {
      for (const key of METRIC_KEYS) {
        assert.ok(
          series[i][key] >= series[i - 1][key],
          `${key} dropped at day ${i}: ${series[i - 1][key]} -> ${series[i][key]}`,
        );
      }
    }
  });

  it("emits non-negative integers for every metric", () => {
    const series = buildCumulativeSeries(FINAL, 30, START);
    for (const snapshot of series) {
      for (const key of METRIC_KEYS) {
        assert.ok(Number.isInteger(snapshot[key]), `${key} integer`);
        assert.ok(snapshot[key] >= 0, `${key} non-negative`);
      }
    }
  });

  it("steps the createdAt date one day at a time from the start date", () => {
    const series = buildCumulativeSeries(FINAL, 3, START);
    assert.equal(series[0].createdAtISO, "2026-05-20T00:00:00.000Z");
    assert.equal(series[1].createdAtISO, "2026-05-21T00:00:00.000Z");
    assert.equal(series[2].createdAtISO, "2026-05-22T00:00:00.000Z");
  });

  it("is deterministic for identical inputs", () => {
    assert.deepEqual(
      buildCumulativeSeries(FINAL, 14, START),
      buildCumulativeSeries(FINAL, 14, START),
    );
  });
});
