import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";

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
        creativeTags: Record<string, unknown>;
        latestMetrics: null;
      };
    };
    assert.equal(created.data.workspaceId, workspaceId);
    assert.equal(created.data.platform, "douyin");
    assert.equal(created.data.channelName, "beauty-live-stream");
    assert.deepEqual(created.data.creativeTags, {});
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

  it("snapshots final video creative tags into campaign publications", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);
    const finalVideoJobId = `fv_campaign_tags_${Date.now()}`;
    await db.db2.insertFinalVideoJob({
      id: finalVideoJobId,
      workspaceId,
      shotSetId: null,
      status: "SUCCEEDED",
      sourceShotVideoIds: [],
      sourceVideoScriptArtifactIds: [],
      localPath: "final/fv_campaign_tags/final.mp4",
      localUrl: `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`,
      durationSec: 15,
      width: 1080,
      height: 1920,
      compiledManifest: {
        schemaVersion: "final-video.v1",
        creativeTags: {
          schemaVersion: "creative-tags.v1",
          promptRequirementsArtifactId: "req_123",
          shotPromptArtifactId: "shotprompt_123",
          creativeFactors: {
            productType: "offline-experience-service",
            audience: "child",
            strategy: "scenario-demo",
          },
          creativeRequirementTemplate: {
            source: "setup-template",
            templateId: "offline-child-travel",
            templateNameSnapshot: "亲子旅游·家长向",
            templateVersion: "p0-2026-06",
            status: "applied",
          },
          fallback: false,
        },
      },
      compiledManifestHash: "sha256:manifest",
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: `${finalVideoJobId}:idem`,
      completedAt: "2026-06-06T00:00:00.000Z",
    });

    const createResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/campaign-publications`,
      payload: {
        finalVideoJobId,
        platform: "douyin",
        channelName: "family-travel",
      },
    });

    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json() as {
      data: {
        creativeTags: {
          schemaVersion: string;
          promptRequirementsArtifactId: string;
          creativeFactors: {
            productType: string;
            audience: string;
            strategy: string;
          };
          creativeRequirementTemplate: {
            source: string;
            templateId: string;
            templateNameSnapshot: string;
            templateVersion: string;
            status: string;
          };
          fallback: boolean;
        };
      };
    };
    assert.equal(created.data.creativeTags.schemaVersion, "creative-tags.v1");
    assert.equal(created.data.creativeTags.promptRequirementsArtifactId, "req_123");
    assert.deepEqual(created.data.creativeTags.creativeFactors, {
      productType: "offline-experience-service",
      audience: "child",
      strategy: "scenario-demo",
    });
    assert.deepEqual(created.data.creativeTags.creativeRequirementTemplate, {
      source: "setup-template",
      templateId: "offline-child-travel",
      templateNameSnapshot: "亲子旅游·家长向",
      templateVersion: "p0-2026-06",
      status: "applied",
    });
    assert.equal(created.data.creativeTags.fallback, false);
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
