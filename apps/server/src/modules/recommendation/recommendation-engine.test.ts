import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CreativeFactors } from "@aigc-video/shared";
import {
  recommendFromRecords,
  type PerformanceRecord,
} from "./recommendation-engine.js";

function factors(p: Partial<CreativeFactors>): CreativeFactors {
  return {
    productCategory: "beauty-personal-care",
    dealType: "seeding-nonstandard",
    audience: "general",
    strategy: "scenario-demo",
    ...p,
  };
}

function rec(
  f: Partial<CreativeFactors>,
  spendCents: number,
  gmvCents: number,
  extra: Partial<PerformanceRecord> = {},
): PerformanceRecord {
  return {
    creativeFactors: factors(f),
    impressions: 100000,
    clicks: 3000,
    conversions: 200,
    spendCents,
    gmvCents,
    ...extra,
  };
}

/** Repeat a record `n` times (one per published video). */
function repeat(n: number, factory: () => PerformanceRecord): PerformanceRecord[] {
  return Array.from({ length: n }, factory);
}

const approx = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

function firstGroup(result: ReturnType<typeof recommendFromRecords>) {
  const group = result.groups[0];
  assert.ok(group, "expected at least one group");
  return group;
}

describe("recommendation engine", () => {
  it("returns no groups for empty input", () => {
    const result = recommendFromRecords([]);
    assert.equal(result.groups.length, 0);
    assert.equal(result.totals.records, 0);
    assert.equal(result.schemaVersion, "recommendation.v1");
  });

  it("computes spend-weighted ROAS and unweighted avg ROAS for a group", () => {
    // Two videos: roas 5.0 and roas 3.0. Weighted = Σgmv/Σspend; avg = mean.
    const records = [
      rec({ audience: "youth", strategy: "scenario-demo" }, 1000, 5000),
      rec({ audience: "youth", strategy: "scenario-demo" }, 2000, 6000),
    ];
    const group = firstGroup(recommendFromRecords(records));
    // Σgmv=11000, Σspend=3000 → 3.6667
    approx(group.groupRoas, 11000 / 3000);
    // mean(5.0, 3.0) = 4.0
    approx(group.groupAvgRoas, 4);
    assert.equal(group.publicationCount, 2);
  });

  it("normalizes ROAS/GMV weights so the composite stays in [0,1]", () => {
    const records = [
      rec({ audience: "youth", strategy: "scenario-demo" }, 1000, 5000),
      rec({ audience: "senior", strategy: "authority-proof" }, 1000, 2000),
    ];
    const result = recommendFromRecords(records, { roasWeight: 3, gmvWeight: 1 });
    approx(result.weights.roas, 0.75);
    approx(result.weights.gmv, 0.25);
    const wGroup = firstGroup(result);
    for (const cell of wGroup.cells) {
      assert.ok(cell.score >= 0 && cell.score <= 1);
    }
  });

  // The headline scenario: a single-sample ROAS fluke vs. a balanced, well
  // sampled cell. Numbers chosen so shrinkage decides the winner.
  const fluke = () => rec({ audience: "general", strategy: "curiosity-hook" }, 300, 2700); // roas 9, 1 sample
  const balanced = () =>
    rec({ audience: "youth", strategy: "scenario-demo" }, 1200, 6000); // roas 5, well sampled
  const weak = () => rec({ audience: "senior", strategy: "authority-proof" }, 1500, 4500); // roas 3
  const scenario = [...repeat(6, balanced), fluke(), ...repeat(4, weak)];

  it("damps a 1-sample ROAS fluke with default shrinkage", () => {
    const group = firstGroup(recommendFromRecords(scenario));
    assert.equal(group.bestCombo.audience, "youth");
    assert.equal(group.bestCombo.strategy, "scenario-demo");
    assert.equal(group.recommendedStrategy, "scenario-demo");
    // The fluke is still present in the matrix but not recommended.
    const flukeCell = group.cells.find((c) => c.strategy === "curiosity-hook");
    assert.ok(flukeCell);
    assert.equal(flukeCell?.confidence, "low");
    assert.ok((flukeCell?.rank ?? 0) > 1);
  });

  it("lets the fluke win when shrinkage is disabled (priorStrength 0)", () => {
    const group = firstGroup(recommendFromRecords(scenario, { priorStrength: 0 }));
    assert.equal(group.bestCombo.strategy, "curiosity-hook");
  });

  it("shrinks a small cell's ROAS toward the group baseline", () => {
    const group = firstGroup(recommendFromRecords(scenario));
    const flukeCell = group.cells.find((c) => c.strategy === "curiosity-hook");
    assert.ok(flukeCell);
    // Raw roas 9 is pulled down toward the group baseline (~4.2).
    assert.ok(flukeCell!.roas > 8.9);
    assert.ok(flukeCell!.adjRoas < flukeCell!.roas);
    assert.ok(flukeCell!.adjRoas > group.groupRoas);
  });

  it("ranks audiences and strategies marginally with a single recommendation", () => {
    const group = firstGroup(recommendFromRecords(scenario));
    assert.equal(group.audienceRanking.filter((a) => a.isRecommended).length, 1);
    assert.equal(group.strategyRanking.filter((s) => s.isRecommended).length, 1);
    // Ranks are 1..n and gmv shares are within [0,1].
    group.audienceRanking.forEach((a, i) => {
      assert.equal(a.rank, i + 1);
      assert.ok(a.gmvShareOfGroup >= 0 && a.gmvShareOfGroup <= 1);
    });
    const shareSum = group.audienceRanking.reduce(
      (sum, a) => sum + a.gmvShareOfGroup,
      0,
    );
    approx(shareSum, 1, 1e-6);
  });

  it("partitions independent groups and orders them by GMV", () => {
    const records = [
      // Group 1: small GMV.
      rec(
        { productCategory: "books-education", dealType: "search-standard" },
        1000,
        2000,
      ),
      // Group 2: large GMV (should sort first).
      rec(
        { productCategory: "consumer-electronics", dealType: "premium-brand" },
        5000,
        40000,
      ),
      rec(
        { productCategory: "consumer-electronics", dealType: "premium-brand" },
        4000,
        30000,
      ),
    ];
    const result = recommendFromRecords(records);
    assert.equal(result.groups.length, 2);
    const [g0, g1] = result.groups;
    assert.ok(g0 && g1);
    assert.equal(g0.productCategory, "consumer-electronics");
    assert.equal(g1.productCategory, "books-education");
  });

  it("does not divide by zero on records with zero spend", () => {
    const records = [
      rec({ audience: "youth", strategy: "visual-story" }, 0, 0, {
        impressions: 0,
        clicks: 0,
        conversions: 0,
      }),
    ];
    const group = firstGroup(recommendFromRecords(records));
    approx(group.groupRoas, 0);
    approx(group.bestCombo.ctr, 0);
    approx(group.bestCombo.cvr, 0);
  });

  it("produces a localized headline naming the recommended factors", () => {
    const group = firstGroup(recommendFromRecords(scenario));
    assert.match(group.headline, /美妆个护/);
    assert.match(group.headline, /种草型非标品/);
    assert.match(group.headline, /场景演示/);
  });
});
