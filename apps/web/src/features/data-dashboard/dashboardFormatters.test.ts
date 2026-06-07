import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSparkline,
  computeMatrixScale,
  fmtNum,
  formatDelta,
  heatmapColor,
  heatmapTextColor,
  kpiDisplay,
  matrixMetricDisplay,
  matrixNorm,
} from "./dashboardFormatters.js";
import { getDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";

describe("formatDelta", () => {
  it("marks a rise as good and a drop as bad", () => {
    assert.deepEqual(formatDelta(1.23, ""), { up: true, tone: "good", text: "1.23" });
    assert.deepEqual(formatDelta(-0.46, "pp"), { up: false, tone: "bad", text: "0.46pp" });
  });

  it("inverts the polarity when a higher value is worse", () => {
    assert.equal(formatDelta(0.5, "pp", true).tone, "bad");
    assert.equal(formatDelta(-0.5, "pp", true).tone, "good");
  });
});

describe("kpiDisplay & matrixMetricDisplay", () => {
  it("keeps two decimals for ROAS and a percent suffix otherwise", () => {
    assert.equal(kpiDisplay("roas", 3.6), "3.60");
    assert.equal(kpiDisplay("ctr", 2.96), "2.96%");
    assert.equal(matrixMetricDisplay("roas", 5.4), "5.40");
    assert.equal(matrixMetricDisplay("cvr", 3.1), "3.10%");
  });
});

describe("fmtNum", () => {
  it("abbreviates large counts in 万 / 亿", () => {
    assert.equal(fmtNum(128000), "12.8万");
    assert.equal(fmtNum(45231684), "4523万");
  });
});

describe("heatmapColor", () => {
  it("stays within bounds and gets darker (lower lightness) as t rises", () => {
    const low = heatmapColor(0);
    const high = heatmapColor(1);
    assert.match(low, /^oklch\(96% /);
    assert.match(high, /^oklch\(44% /);
    assert.equal(heatmapColor(-1), heatmapColor(0));
    assert.equal(heatmapColor(2), heatmapColor(1));
  });

  it("flips text color to white once the fill is dark", () => {
    assert.equal(heatmapTextColor(0.2), "#3a3550");
    assert.equal(heatmapTextColor(0.8), "#fff");
  });
});

describe("buildSparkline", () => {
  it("produces a line path and a closed area path", () => {
    const { path, area } = buildSparkline([1, 3, 2, 4], 120, 32);
    assert.match(path, /^M0\.0 /);
    assert.ok(area.endsWith("L 120 32 L 0 32 Z"));
  });

  it("returns empty geometry for empty data", () => {
    assert.deepEqual(buildSparkline([], 100, 30), { path: "", area: "" });
  });
});

describe("computeMatrixScale", () => {
  it("finds the best cell across the seed matrix for ROAS", () => {
    const snapshot = getDashboardAnalyticsSnapshot();
    const channelIds = snapshot.channels.map((channel) => channel.id);
    const scale = computeMatrixScale(snapshot.strategyMatrix.rows, channelIds, "roas");

    assert.equal(scale.best?.strategy, "pain-solution");
    assert.equal(scale.best?.channelId, "mia");
    assert.equal(scale.best?.value, 5.4);
    assert.equal(scale.hi, 5.4);
    assert.equal(matrixNorm(scale.hi, scale), 1);
    assert.equal(matrixNorm(scale.lo, scale), 0);
  });
});
