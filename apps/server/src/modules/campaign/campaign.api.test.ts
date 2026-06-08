import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";

async function createWorkspace(
  app: FastifyInstance,
  cleanupDirs: string[],
  cleanupWorkspaceIds: string[],
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "daireel-campaign-"));
  cleanupDirs.push(directory);
  const response = await app.inject({
    method: "POST",
    url: "/api/workspaces/init",
    payload: { directory },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json() as { workspace: { id: string } };
  cleanupWorkspaceIds.push(body.workspace.id);
  return body.workspace.id;
}

async function seedFinalVideoJob(workspaceId: string, suffix: string) {
  const id = `fv_campaign_${suffix}`;
  await db.db2.insertFinalVideoJob({
    id,
    workspaceId,
    shotSetId: null,
    status: "SUCCEEDED",
    sourceShotVideoIds: [],
    sourceVideoScriptArtifactIds: [],
    localPath: `final/${id}/final.mp4`,
    localUrl: `/api/workspaces/${workspaceId}/final-videos/${id}/file`,
    durationSec: 15,
    width: 1080,
    height: 1920,
    compiledManifest: { schemaVersion: "final-video-manifest" },
    compiledManifestHash: `sha256:${id}`,
    ffmpegLog: null,
    errorMessage: null,
    idempotencyKey: `${id}:idem`,
    completedAt: "2026-06-06T00:00:00.000Z",
  });
  return id;
}

describe("campaign publication API", () => {
  let app: FastifyInstance;
  const cleanupDirs: string[] = [];
  const cleanupWorkspaceIds: string[] = [];

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    if (cleanupWorkspaceIds.length > 0) {
      await db.db2.pool().query("begin");
      try {
        // external_kol_metrics has no workspace_id; it cascades when its
        // publication is deleted, so publications must be deleted first.
        for (const table of [
          "external_kol_publications",
          "dashboard_video_artifacts",
          "final_video_jobs",
        ]) {
          await db.db2
            .pool()
            .query(`delete from ${table} where workspace_id = any($1::text[])`, [
              cleanupWorkspaceIds,
            ]);
        }
        await db.db2
          .pool()
          .query("delete from creative_workspace where id = any($1::text[])", [
            cleanupWorkspaceIds,
          ]);
        await db.db2.pool().query("commit");
      } catch (error) {
        await db.db2.pool().query("rollback");
        throw error;
      }
    }
    await app.close();
    await Promise.all(
      cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("creates a slim KOL/channel placement", async () => {
    const workspaceId = await createWorkspace(
      app,
      cleanupDirs,
      cleanupWorkspaceIds,
    );

    const createResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/campaign-publications`,
      payload: {
        platform: "douyin",
        accountName: "beauty-live-stream",
        publishUrl: "https://example.com/p/douyin-001",
        publishedAt: "2026-05-30T08:30:00.000Z",
      },
    });
    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json() as {
      data: {
        id: string;
        workspaceId: string;
        jobId: string | null;
        platform: string;
        accountName: string;
        publishUrl: string | null;
        publishedAt: string;
        latestMetrics: null;
      };
    };
    assert.equal(created.data.workspaceId, workspaceId);
    assert.equal(created.data.jobId, null);
    assert.equal(created.data.platform, "douyin");
    assert.equal(created.data.accountName, "beauty-live-stream");
    assert.equal(created.data.publishUrl, "https://example.com/p/douyin-001");
    assert.equal(created.data.publishedAt, "2026-05-30T08:30:00.000Z");
    assert.equal(created.data.latestMetrics, null);
    // Slimmed-away fields must not resurface.
    assert.equal("status" in created.data, false);
    assert.equal("notes" in created.data, false);
    assert.equal("channelName" in created.data, false);
    assert.equal("dashboardVideoArtifactId" in created.data, false);
  });

  it("records cumulative metrics and derives ctr/cvr/roas", async () => {
    const workspaceId = await createWorkspace(
      app,
      cleanupDirs,
      cleanupWorkspaceIds,
    );
    const created = (
      await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/campaign-publications`,
        payload: { platform: "douyin", accountName: "beauty-live-stream" },
      })
    ).json() as { data: { id: string } };

    const metricsResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/campaign-publications/${created.data.id}/metrics`,
      payload: {
        impressions: 1000,
        clicks: 125,
        conversions: 8,
        spendCents: 5000,
        gmvCents: 20000,
      },
    });
    assert.equal(metricsResponse.statusCode, 200, metricsResponse.body);
    const metrics = metricsResponse.json() as {
      data: {
        impressions: number;
        clicks: number;
        conversions: number;
        spendCents: number;
        gmvCents: number;
        ctr: number | null;
        cvr: number | null;
        roas: number | null;
      };
    };
    assert.equal(metrics.data.impressions, 1000);
    assert.equal(metrics.data.clicks, 125);
    assert.equal(metrics.data.conversions, 8);
    assert.equal(metrics.data.spendCents, 5000);
    assert.equal(metrics.data.gmvCents, 20000);
    assert.equal(metrics.data.ctr, 0.125); // clicks / impressions
    assert.equal(metrics.data.cvr, 0.064); // conversions / clicks
    assert.equal(metrics.data.roas, 4); // gmvCents / spendCents
    // Per-snapshot context fields were dropped from the slim model.
    assert.equal("capturedAt" in metrics.data, false);
    assert.equal("source" in metrics.data, false);
    assert.equal("metadata" in metrics.data, false);
  });

  it("list embeds the latest cumulative metrics snapshot", async () => {
    const workspaceId = await createWorkspace(
      app,
      cleanupDirs,
      cleanupWorkspaceIds,
    );
    const created = (
      await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/campaign-publications`,
        payload: { platform: "douyin", accountName: "beauty-live-stream" },
      })
    ).json() as { data: { id: string } };
    const metricsUrl = `/api/workspaces/${workspaceId}/campaign-publications/${created.data.id}/metrics`;

    // Two cumulative snapshots over time; the newest one must win.
    await app.inject({
      method: "POST",
      url: metricsUrl,
      payload: {
        impressions: 1000,
        clicks: 100,
        conversions: 5,
        spendCents: 4000,
        gmvCents: 8000,
      },
    });
    await app.inject({
      method: "POST",
      url: metricsUrl,
      payload: {
        impressions: 2000,
        clicks: 250,
        conversions: 20,
        spendCents: 5000,
        gmvCents: 20000,
      },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/campaign-publications`,
    });
    assert.equal(listResponse.statusCode, 200);
    const listed = listResponse.json() as {
      data: Array<{
        id: string;
        latestMetrics: {
          impressions: number;
          clicks: number;
          ctr: number | null;
          roas: number | null;
        } | null;
      }>;
    };
    const pub = listed.data.find((p) => p.id === created.data.id);
    assert(pub, "created publication should be listed");
    assert.equal(pub.latestMetrics?.impressions, 2000);
    assert.equal(pub.latestMetrics?.clicks, 250);
    assert.equal(pub.latestMetrics?.ctr, 0.125); // 250 / 2000
    assert.equal(pub.latestMetrics?.roas, 4); // 20000 / 5000
  });

  it("rejects a jobId that belongs to another workspace", async () => {
    const workspaceId = await createWorkspace(
      app,
      cleanupDirs,
      cleanupWorkspaceIds,
    );
    const otherWorkspaceId = await createWorkspace(
      app,
      cleanupDirs,
      cleanupWorkspaceIds,
    );
    const foreignJobId = await seedFinalVideoJob(
      otherWorkspaceId,
      `mismatch_${Date.now()}`,
    );

    const createResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/campaign-publications`,
      payload: {
        jobId: foreignJobId,
        platform: "douyin",
        accountName: "beauty-live-stream",
      },
    });
    assert.equal(createResponse.statusCode, 400, createResponse.body);
    assert.match(createResponse.body, /FINAL_VIDEO_WORKSPACE_MISMATCH/);
  });

  it("accepts an in-workspace jobId with no dashboard import required", async () => {
    const workspaceId = await createWorkspace(
      app,
      cleanupDirs,
      cleanupWorkspaceIds,
    );
    // Seed only the final video job — deliberately NO dashboard artifact, which
    // the retired import-guard would have rejected with 409.
    const jobId = await seedFinalVideoJob(
      workspaceId,
      `no_dashboard_${Date.now()}`,
    );

    const createResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/campaign-publications`,
      payload: {
        jobId,
        platform: "douyin",
        accountName: "beauty-live-stream",
      },
    });
    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json() as { data: { jobId: string | null } };
    assert.equal(created.data.jobId, jobId);
  });

  it("keeps publications scoped to their workspace", async () => {
    const workspaceId = await createWorkspace(
      app,
      cleanupDirs,
      cleanupWorkspaceIds,
    );
    const otherWorkspaceId = await createWorkspace(
      app,
      cleanupDirs,
      cleanupWorkspaceIds,
    );
    const created = (
      await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/campaign-publications`,
        payload: { platform: "tiktok", accountName: "creator-alpha" },
      })
    ).json() as { data: { id: string } };

    const crossWorkspaceResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${otherWorkspaceId}/campaign-publications/${created.data.id}`,
    });
    assert.equal(crossWorkspaceResponse.statusCode, 404);
  });
});
