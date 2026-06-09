#!/usr/bin/env tsx
/**
 * Run the recommendation engine against a seed fixture WITHOUT a database.
 *
 * Each publication's `finalTotals` is treated as one performance record (the
 * cumulative series ends exactly at finalTotals, so this matches what the DB
 * repository would load). Useful for previewing engine output and for
 * generating the numbers quoted in docs/auto_report/report.md.
 *
 *   pnpm --filter @aigc-video/server exec tsx scripts/recommendation-preview.ts
 *   tsx scripts/recommendation-preview.ts --fixture scripts/fixtures/recommendation-seed.json
 *   tsx scripts/recommendation-preview.ts --roas 0.3 --gmv 0.7   # scale-first weighting
 *   tsx scripts/recommendation-preview.ts --json                 # full JSON dump
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  recommendFromRecords,
  type PerformanceRecord,
} from "../src/modules/recommendation/recommendation-engine.js";
import { loadFixtureFromFile } from "./seed/fixture.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE = path.join(scriptDir, "fixtures/recommendation-seed.json");

interface Args {
  fixture: string;
  roasWeight?: number;
  gmvWeight?: number;
  priorStrength?: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = argv.filter((arg) => arg !== "--");
  const out: Args = { fixture: DEFAULT_FIXTURE, json: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--fixture") out.fixture = path.resolve(args[++i] ?? "");
    else if (arg === "--roas") out.roasWeight = Number(args[++i]);
    else if (arg === "--gmv") out.gmvWeight = Number(args[++i]);
    else if (arg === "--prior") out.priorStrength = Number(args[++i]);
    else if (arg === "--json") out.json = true;
    else throw new Error(`Unknown option "${arg}"`);
  }
  return out;
}

const yuan = (cents: number) =>
  `¥${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = await loadFixtureFromFile(args.fixture);

  const records: PerformanceRecord[] = [];
  for (const video of fixture.videos) {
    for (const pub of video.publications) {
      records.push({
        creativeFactors: video.creativeFactors,
        impressions: pub.finalTotals.impressions,
        clicks: pub.finalTotals.clicks,
        conversions: pub.finalTotals.conversions,
        spendCents: pub.finalTotals.spendCents,
        gmvCents: pub.finalTotals.gmvCents,
        publicationId: `${video.key}:${pub.key}`,
        platform: pub.platform,
        accountName: pub.accountName,
      });
    }
  }

  const result = recommendFromRecords(records, {
    roasWeight: args.roasWeight,
    gmvWeight: args.gmvWeight,
    priorStrength: args.priorStrength,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    `推荐引擎预览  ·  ${result.totals.records} 条投放记录  ·  ${result.totals.groups} 个分组` +
      `  ·  权重 ROAS ${result.weights.roas.toFixed(2)} / GMV ${result.weights.gmv.toFixed(2)}` +
      `  ·  收缩强度 ${result.priorStrength}\n`,
  );

  for (const group of result.groups) {
    console.log(
      `━━ ${group.productCategoryLabel} × ${group.dealTypeLabel} ` +
        `(${group.publicationCount} 条 / ${group.comboCount} 组合, 置信度 ${group.confidence})`,
    );
    console.log(
      `   组内基准: ROAS ${group.groupRoas.toFixed(2)} | GMV ${yuan(group.groupGmvCents)} ` +
        `| 单视频GMV ${yuan(group.groupGmvPerVideoCents)}`,
    );
    console.log(`   ▶ ${group.headline}`);
    console.log(
      `   适用人群排序: ` +
        group.audienceRanking
          .map(
            (a) =>
              `${a.label}(ROAS ${a.roas.toFixed(2)},GMV占比 ${(a.gmvShareOfGroup * 100).toFixed(0)}%${a.isRecommended ? ",★" : ""})`,
          )
          .join("  "),
    );
    console.log(
      `   推销手法排序: ` +
        group.strategyRanking
          .map(
            (s) =>
              `${s.label}(ROAS ${s.roas.toFixed(2)},score ${s.score.toFixed(2)}${s.isRecommended ? ",★" : ""})`,
          )
          .join("  "),
    );
    console.log(`   组合矩阵 (按综合分):`);
    for (const cell of group.cells) {
      console.log(
        `     ${String(cell.rank).padStart(2)}. ${cell.audienceLabel} + ${cell.strategyLabel}` +
          `  score ${cell.score.toFixed(3)}  ROAS ${cell.roas.toFixed(2)}` +
          ` (调整后 ${cell.adjRoas.toFixed(2)})  单视频GMV ${yuan(cell.gmvPerVideoCents)}` +
          `  n=${cell.sampleCount} [${cell.confidence}]`,
      );
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
