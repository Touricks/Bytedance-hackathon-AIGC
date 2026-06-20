import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  recommendFromRecords,
  type PerformanceRecord,
} from "../../src/modules/recommendation/recommendation-engine.js";
import { loadFixtureFromFile } from "./fixture.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const recommendationFixturePath = path.join(
  scriptDir,
  "../fixtures/recommendation-seed.json",
);

async function recommendationFixtureRecords(): Promise<PerformanceRecord[]> {
  const fixture = await loadFixtureFromFile(recommendationFixturePath);
  return fixture.videos.flatMap((video) =>
    video.publications.map((publication) => ({
      creativeFactors: video.creativeFactors,
      impressions: publication.finalTotals.impressions,
      clicks: publication.finalTotals.clicks,
      conversions: publication.finalTotals.conversions,
      spendCents: publication.finalTotals.spendCents,
      gmvCents: publication.finalTotals.gmvCents,
      publicationId: `${video.key}:${publication.key}`,
      platform: publication.platform,
      accountName: publication.accountName,
    })),
  );
}

describe("recommendation fixture", () => {
  it("contains a usable home-living repeat-consumable group", async () => {
    const result = recommendFromRecords(await recommendationFixtureRecords());
    const group = result.groups.find(
      (candidate) =>
        candidate.productCategory === "home-living" &&
        candidate.dealType === "repeat-consumable",
    );

    assert.ok(group, "expected home-living x repeat-consumable data");
    assert.equal(group.publicationCount, 12);
    assert.equal(group.comboCount, 5);
    assert.equal(group.confidence, "high");
    assert.equal(group.recommendedAudience, "youth");
    assert.equal(group.recommendedStrategy, "pain-solution");
    assert.ok(group.bestCombo.roas > group.groupRoas);
    assert.match(group.headline, /家居家装 × 复购型消耗品/);
  });
});
