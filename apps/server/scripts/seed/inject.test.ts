import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { buildServer } from "../../src/app.js";
import { config } from "../../src/common/config.js";
import { db } from "../../src/db/client.js";
import {
  DASHBOARD_SEED_PLACEHOLDER_VIDEO,
  injectDashboardSeed,
} from "./inject.js";
import type { DashboardSeedFixture } from "./fixture.js";

describe("dashboard seed injection", () => {
  let dashboardAssetDir: string;
  let app: Awaited<ReturnType<typeof buildServer>>;

  before(async () => {
    dashboardAssetDir = await mkdtemp(
      path.join(os.tmpdir(), "daireel-dashboard-seed-assets-"),
    );
    config.dashboardAssetDir = dashboardAssetDir;
    app = await buildServer();
  });

  after(async () => {
    await app.close();
    await rm(dashboardAssetDir, { recursive: true, force: true });
  });

  it("creates streamable mock dashboard videos from the placeholder MP4", async () => {
    const uniqueKey = `seed_placeholder_${Date.now()}`;
    const workspaceId = `ws_${uniqueKey}`;
    const publicationId = `mock_pub_${uniqueKey}_dy`;
    const dashboardArtifactId = `mock_dash_${uniqueKey}`;
    const finalVideoJobId = `mock_fv_${uniqueKey}`;
    const fixture: DashboardSeedFixture = {
      workspace: { id: workspaceId, name: "Seed Placeholder Test" },
      videos: [
        {
          key: uniqueKey,
          name: "Seed placeholder video",
          creativeFactors: {
            productCategory: "home-living",
            dealType: "impulse-hit",
            audience: "general",
            strategy: "scenario-demo",
          },
          publications: [
            {
              key: "dy",
              platform: "douyin",
              accountName: "seed-test",
              publishedAt: "2026-05-20T00:00:00.000Z",
              days: 1,
              finalTotals: {
                impressions: 1000,
                clicks: 100,
                conversions: 10,
                spendCents: 10000,
                gmvCents: 50000,
              },
            },
          ],
        },
      ],
    };

    try {
      const summary = await injectDashboardSeed(fixture);
      assert.deepEqual(summary.dashboardArtifactIds, [dashboardArtifactId]);

      const rowResult = await db.db2.pool().query(
        `select final_video_job_id, local_url, duration_sec, width, height
         from dashboard_video_artifacts where id = $1`,
        [dashboardArtifactId],
      );
      assert.equal(rowResult.rowCount, 1);
      assert.deepEqual(rowResult.rows[0], {
        final_video_job_id: finalVideoJobId,
        local_url: `/api/dashboard/videos/${dashboardArtifactId}/file`,
        duration_sec: DASHBOARD_SEED_PLACEHOLDER_VIDEO.durationSec,
        width: DASHBOARD_SEED_PLACEHOLDER_VIDEO.width,
        height: DASHBOARD_SEED_PLACEHOLDER_VIDEO.height,
      });

      const placeholderBytes = await readFile(
        DASHBOARD_SEED_PLACEHOLDER_VIDEO.path,
      );
      assert.deepEqual(
        await readFile(
          path.join(dashboardAssetDir, dashboardArtifactId, "video.mp4"),
        ),
        placeholderBytes,
      );

      const fileResponse = await app.inject({
        method: "GET",
        url: `/api/dashboard/videos/${dashboardArtifactId}/file`,
      });
      assert.equal(fileResponse.statusCode, 200, fileResponse.body);
      assert.equal(fileResponse.headers["content-type"], "video/mp4");
      assert.deepEqual(fileResponse.rawPayload, placeholderBytes);
    } finally {
      await db.db2
        .pool()
        .query(`delete from external_kol_metrics where publication_id = $1`, [
          publicationId,
        ]);
      await db.db2
        .pool()
        .query(`delete from external_kol_publications where id = $1`, [
          publicationId,
        ]);
      await db.db2
        .pool()
        .query(`delete from dashboard_video_artifacts where id = $1`, [
          dashboardArtifactId,
        ]);
      await db.db2
        .pool()
        .query(`delete from final_video_jobs where id = $1`, [finalVideoJobId]);
      await db.db2
        .pool()
        .query(`delete from creative_workspace where id = $1`, [workspaceId]);
    }
  });
});
