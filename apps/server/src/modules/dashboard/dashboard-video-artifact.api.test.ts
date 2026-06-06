import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";

async function createWorkspace(app: FastifyInstance, cleanupDirs: string[]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "daireel-dashboard-"));
  cleanupDirs.push(directory);
  const response = await app.inject({
    method: "POST",
    url: "/api/workspaces/init",
    payload: { directory },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<{ workspace: { id: string } }>().workspace.id;
}

describe("dashboard video artifact API", () => {
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

  it("imports a completed final video and lists its dashboard metadata", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);
    const finalVideoJobId = `fv_dashboard_${Date.now()}`;
    const localUrl = `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`;
    const creativeFactors = {
      productType: "offline-experience-service",
      audience: "child",
      strategy: "scenario-demo",
    };

    await db.db2.insertFinalVideoJob({
      id: finalVideoJobId,
      workspaceId,
      shotSetId: null,
      status: "SUCCEEDED",
      sourceShotVideoIds: [],
      sourceVideoScriptArtifactIds: [],
      localPath: "final/fv_dashboard/final.mp4",
      localUrl,
      durationSec: 18,
      width: 1080,
      height: 1920,
      compiledManifest: {
        schemaVersion: "final-video.v1",
        creativeTags: {
          schemaVersion: "creative-tags.v1",
          promptRequirementsArtifactId: "req_dashboard",
          shotPromptArtifactId: "shotprompt_dashboard",
          creativeFactors,
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
      compiledManifestHash: "sha256:dashboard-manifest",
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: `${finalVideoJobId}:idem`,
      completedAt: "2026-06-06T08:00:00.000Z",
    });

    const createResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
      payload: {
        finalVideoJobId,
        name: "618 亲子旅行成片",
      },
    });

    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json() as {
      data: {
        id: string;
        workspaceId: string;
        finalVideoJobId: string;
        name: string;
        localUrl: string;
        durationSec: number;
        importedAt: string;
        creativeFactors: typeof creativeFactors;
      };
    };
    assert.equal(created.data.workspaceId, workspaceId);
    assert.equal(created.data.finalVideoJobId, finalVideoJobId);
    assert.equal(created.data.name, "618 亲子旅行成片");
    assert.equal(created.data.localUrl, localUrl);
    assert.equal(created.data.durationSec, 18);
    assert.match(created.data.importedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(created.data.creativeFactors, creativeFactors);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
    });
    assert.equal(listResponse.statusCode, 200, listResponse.body);
    const listed = listResponse.json() as { data: Array<typeof created.data> };
    assert.equal(listed.data[0]?.id, created.data.id);
    assert.deepEqual(listed.data[0]?.creativeFactors, creativeFactors);
  });
});
