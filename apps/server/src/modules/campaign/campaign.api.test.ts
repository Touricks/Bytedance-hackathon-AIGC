import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";

async function createWorkspace(app: FastifyInstance, cleanupDirs: string[]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "daireel-campaign-"));
  cleanupDirs.push(directory);
  const response = await app.inject({
    method: "POST",
    url: "/api/workspaces/init",
    payload: { directory },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json() as { workspace: { id: string } };
  return body.workspace.id;
}

describe("campaign publication API", () => {
  let app: FastifyInstance;
  const cleanupDirs: string[] = [];

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
    await Promise.all(
      cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("creates a KOL/channel publication and lists latest metrics", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);

    const createResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/campaign-publications`,
      payload: {
        platform: "douyin",
        channelName: "beauty-live-stream",
        kolName: "Ava",
        publishUrl: "https://example.com/p/douyin-001",
        status: "published",
        notes: "Seed channel for campaign reporting.",
      },
    });
    assert.equal(createResponse.statusCode, 200);
    const created = createResponse.json() as {
      data: {
        id: string;
        workspaceId: string;
        platform: string;
        channelName: string;
        kolName: string;
        latestMetrics: null;
      };
    };
    assert.equal(created.data.workspaceId, workspaceId);
    assert.equal(created.data.platform, "douyin");
    assert.equal(created.data.channelName, "beauty-live-stream");
    assert.equal(created.data.latestMetrics, null);

    const metricsResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/campaign-publications/${created.data.id}/metrics`,
      payload: {
        impressions: 1000,
        clicks: 125,
        conversions: 8,
        spendCents: 5000,
        capturedAt: "2026-05-30T08:30:00.000Z",
        source: "manual",
        metadata: { platformPostId: "douyin-001" },
      },
    });
    assert.equal(metricsResponse.statusCode, 200);
    const metrics = metricsResponse.json() as {
      data: { impressions: number; clicks: number; ctr: number };
    };
    assert.equal(metrics.data.impressions, 1000);
    assert.equal(metrics.data.clicks, 125);
    assert.equal(metrics.data.ctr, 0.125);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/campaign-publications`,
    });
    assert.equal(listResponse.statusCode, 200);
    const listed = listResponse.json() as {
      data: Array<{
        id: string;
        latestMetrics: { clicks: number; ctr: number } | null;
      }>;
    };
    const firstPublication = listed.data[0];
    assert(firstPublication);
    assert.equal(firstPublication.id, created.data.id);
    assert.equal(firstPublication.latestMetrics?.clicks, 125);
    assert.equal(firstPublication.latestMetrics?.ctr, 0.125);
  });

  it("keeps campaign publications scoped to their workspace", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);
    const otherWorkspaceId = await createWorkspace(app, cleanupDirs);

    const createResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/campaign-publications`,
      payload: {
        platform: "tiktok",
        channelName: "creator-alpha",
      },
    });
    assert.equal(createResponse.statusCode, 200);
    const created = createResponse.json() as { data: { id: string } };

    const crossWorkspaceResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${otherWorkspaceId}/campaign-publications/${created.data.id}`,
    });
    assert.equal(crossWorkspaceResponse.statusCode, 404);
  });
});
