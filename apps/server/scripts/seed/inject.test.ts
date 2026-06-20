import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, describe, it } from "node:test";
import { buildServer } from "../../src/app.js";
import { config } from "../../src/common/config.js";
import { db } from "../../src/db/client.js";
import { __setDashboardS3OpsForTests } from "../../src/modules/dashboard/dashboard-asset-storage.js";
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
    config.dashboardS3Bucket = undefined;
    __setDashboardS3OpsForTests(undefined);
    app = await buildServer();
  });

  after(async () => {
    config.dashboardS3Bucket = undefined;
    __setDashboardS3OpsForTests(undefined);
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
        `select final_video_job_id, local_url, duration_sec, width, height,
                storage_kind, storage_bucket, video_object_key, metadata_object_key
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
        storage_kind: "LOCAL",
        storage_bucket: null,
        video_object_key: null,
        metadata_object_key: null,
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

  it("writes mock dashboard videos to S3 when dashboard S3 storage is configured", async () => {
    const uniqueKey = `seed_s3_${Date.now()}`;
    const workspaceId = `ws_${uniqueKey}`;
    const publicationId = `mock_pub_${uniqueKey}_dy`;
    const dashboardArtifactId = `mock_dash_${uniqueKey}`;
    const finalVideoJobId = `mock_fv_${uniqueKey}`;
    const videoObjectKey = `dashboard/${dashboardArtifactId}/video.mp4`;
    const metadataObjectKey = `dashboard/${dashboardArtifactId}/metadata.json`;
    const bucket = "dashboard-seed-bucket";
    const putKeys: string[] = [];
    const s3Objects = new Map<
      string,
      { body: Buffer; contentType: string | undefined }
    >();
    const fixture: DashboardSeedFixture = {
      workspace: { id: workspaceId, name: "Seed S3 Placeholder Test" },
      videos: [
        {
          key: uniqueKey,
          name: "Seed S3 placeholder video",
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
              accountName: "seed-s3-test",
              publishedAt: "2026-05-21T00:00:00.000Z",
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

    config.dashboardS3Bucket = bucket;
    __setDashboardS3OpsForTests({
      putObject: async ({ bucket: actualBucket, key, body, contentType }) => {
        assert.equal(actualBucket, bucket);
        putKeys.push(key);
        s3Objects.set(key, {
          body: Buffer.isBuffer(body) ? body : Buffer.from(body),
          contentType,
        });
      },
      getObjectStream: async ({ bucket: actualBucket, key, range }) => {
        assert.equal(actualBucket, bucket);
        const object = s3Objects.get(key);
        assert.ok(object, `missing object ${key}`);
        assert.equal(range, undefined);
        return Readable.from([object.body]);
      },
      headObject: async ({ bucket: actualBucket, key }) => {
        assert.equal(actualBucket, bucket);
        const object = s3Objects.get(key);
        assert.ok(object, `missing object ${key}`);
        return {
          contentLength: object.body.length,
          contentType: object.contentType,
        };
      },
    });

    try {
      const summary = await injectDashboardSeed(fixture);
      assert.deepEqual(summary.dashboardArtifactIds, [dashboardArtifactId]);
      assert.deepEqual(putKeys, [videoObjectKey, metadataObjectKey]);

      const rowResult = await db.db2.pool().query(
        `select final_video_job_id, local_url, duration_sec, width, height,
                storage_kind, storage_bucket, video_object_key, metadata_object_key
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
        storage_kind: "S3",
        storage_bucket: bucket,
        video_object_key: videoObjectKey,
        metadata_object_key: metadataObjectKey,
      });

      const placeholderBytes = await readFile(
        DASHBOARD_SEED_PLACEHOLDER_VIDEO.path,
      );
      assert.deepEqual(s3Objects.get(videoObjectKey)?.body, placeholderBytes);
      assert.equal(s3Objects.get(videoObjectKey)?.contentType, "video/mp4");
      assert.equal(
        s3Objects.get(metadataObjectKey)?.contentType,
        "application/json",
      );

      const metadata = JSON.parse(
        s3Objects.get(metadataObjectKey)?.body.toString("utf8") ?? "{}",
      ) as {
        schemaVersion: string;
        finalVideoJobId: string;
        storage: {
          kind: string;
          bucket: string;
          videoObjectKey: string;
          metadataObjectKey: string;
          localAssetDir: string | null;
        };
      };
      assert.equal(metadata.schemaVersion, "dashboard-video-metadata");
      assert.equal(metadata.finalVideoJobId, finalVideoJobId);
      assert.deepEqual(metadata.storage, {
        kind: "S3",
        bucket,
        videoObjectKey,
        metadataObjectKey,
        localAssetDir: null,
      });

      const fileResponse = await app.inject({
        method: "GET",
        url: `/api/dashboard/videos/${dashboardArtifactId}/file`,
      });
      assert.equal(fileResponse.statusCode, 200, fileResponse.body);
      assert.equal(fileResponse.headers["content-type"], "video/mp4");
      assert.deepEqual(fileResponse.rawPayload, placeholderBytes);
    } finally {
      config.dashboardS3Bucket = undefined;
      __setDashboardS3OpsForTests(undefined);
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
