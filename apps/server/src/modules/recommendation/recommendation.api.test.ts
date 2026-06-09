import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import type { CreativeFactors } from "@aigc-video/shared";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";

/**
 * DB-backed coverage for the repository SQL + controller wiring. The pure
 * scoring logic is covered separately in recommendation-engine.test.ts; here we
 * only prove that dashboard_video_artifacts → external_kol_publications →
 * latest external_kol_metrics is joined and aggregated correctly end to end.
 *
 * All rows use a `rectest_` id prefix and are removed in `after`.
 */
const PREFIX = "rectest";
const WORKSPACE_ID = `${PREFIX}_ws`;

let seq = 0;

async function seedRecord(
  factors: CreativeFactors,
  totals: { impressions: number; clicks: number; conversions: number; spendCents: number; gmvCents: number },
): Promise<void> {
  const pool = db.db2.pool();
  const id = `${PREFIX}_${seq++}`;
  const jobId = `${id}_job`;
  const dashId = `${id}_dash`;
  const pubId = `${id}_pub`;
  await pool.query(
    `insert into final_video_jobs
       (id, workspace_id, status, source_shot_video_ids, source_video_script_artifact_ids)
     values ($1,$2,'SUCCEEDED','{}'::text[],'{}'::text[])
     on conflict (id) do nothing`,
    [jobId, WORKSPACE_ID],
  );
  await pool.query(
    `insert into dashboard_video_artifacts
       (id, workspace_id, final_video_job_id, name, local_url, creative_factors)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (id) do nothing`,
    [dashId, WORKSPACE_ID, jobId, id, `/x/${id}`, JSON.stringify(factors)],
  );
  await pool.query(
    `insert into external_kol_publications
       (id, workspace_id, job_id, platform, account_name)
     values ($1,$2,$3,'douyin','tester')
     on conflict (id) do nothing`,
    [pubId, WORKSPACE_ID, jobId],
  );
  // Two cumulative snapshots; the later one (final totals) must be the one used.
  await pool.query(
    `insert into external_kol_metrics
       (id, publication_id, impressions, clicks, conversions, spend_cents, gmv_cents, created_at)
     values
       ($1,$2,$3,$4,$5,$6,$7,'2026-05-01T00:00:00.000Z'),
       ($8,$2,$9,$10,$11,$12,$13,'2026-05-10T00:00:00.000Z')
     on conflict (id) do nothing`,
    [
      `${pubId}_m0`, pubId,
      Math.round(totals.impressions / 2), Math.round(totals.clicks / 2),
      Math.round(totals.conversions / 2), Math.round(totals.spendCents / 2),
      Math.round(totals.gmvCents / 2),
      `${pubId}_m1`,
      totals.impressions, totals.clicks, totals.conversions, totals.spendCents, totals.gmvCents,
    ],
  );
}

// A group neither seed fixture uses, so this test is isolated from any other
// mock data already in the dev DB.
const factors = (p: Partial<CreativeFactors>): CreativeFactors => ({
  productCategory: "home-living",
  dealType: "premium-brand",
  audience: "general",
  strategy: "scenario-demo",
  ...p,
});

async function cleanup(): Promise<void> {
  const pool = db.db2.pool();
  await pool.query(
    `delete from external_kol_metrics where publication_id like '${PREFIX}_%'`,
  );
  await pool.query(`delete from external_kol_publications where id like '${PREFIX}_%'`);
  await pool.query(`delete from dashboard_video_artifacts where id like '${PREFIX}_%'`);
  await pool.query(`delete from final_video_jobs where id like '${PREFIX}_%'`);
  await pool.query(`delete from creative_workspace where id = $1`, [WORKSPACE_ID]);
}

describe("recommendation API", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
    await cleanup();
    await db.db2.pool().query(
      `insert into creative_workspace (id, current_script_id, status, trace_file)
       values ($1,'s','READY','t') on conflict (id) do nothing`,
      [WORKSPACE_ID],
    );
    // Group: home-living × premium-brand. youth+scenario-demo (roas 5, 2 videos) should beat
    // general+pain-solution (roas 2, 1 video).
    await seedRecord(factors({ audience: "youth", strategy: "scenario-demo" }), {
      impressions: 100000, clicks: 3000, conversions: 200, spendCents: 1000, gmvCents: 5000,
    });
    await seedRecord(factors({ audience: "youth", strategy: "scenario-demo" }), {
      impressions: 100000, clicks: 3000, conversions: 200, spendCents: 1000, gmvCents: 5000,
    });
    await seedRecord(factors({ audience: "general", strategy: "pain-solution" }), {
      impressions: 100000, clicks: 3000, conversions: 200, spendCents: 1000, gmvCents: 2000,
    });
  });

  after(async () => {
    await cleanup();
    await app.close();
    await db.close();
  });

  it("recommends the best audience/strategy for a seeded group", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard/recommendations/home-living/premium-brand",
    });
    assert.equal(response.statusCode, 200, response.body);
    const { data } = response.json<{ data: Record<string, unknown> }>();
    assert.equal(data.recommendedAudience, "youth");
    assert.equal(data.recommendedStrategy, "scenario-demo");
    // Uses the latest snapshot (final totals), so Σgmv/Σspend = 12000/3000 = 4.
    assert.equal(data.groupRoas, 4);
    assert.equal(data.publicationCount, 3);
  });

  it("lists the seeded group among all recommendations", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard/recommendations",
    });
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json<{ groups: Array<{ groupKey: string }> }>();
    assert.ok(
      body.groups.some(
        (g) => g.groupKey === "home-living::premium-brand",
      ),
    );
  });

  it("returns 400 for an invalid factor value", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard/recommendations/not-a-category/seeding-nonstandard",
    });
    assert.equal(response.statusCode, 400);
  });

  it("returns 404 for a group with no data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard/recommendations/automotive/impulse-hit",
    });
    assert.equal(response.statusCode, 404);
  });
});
