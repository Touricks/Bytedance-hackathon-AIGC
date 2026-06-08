import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { config } from "../../common/config.js";
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
  return {
    directory,
    workspaceId: response.json<{ workspace: { id: string } }>().workspace.id,
  };
}

describe("dashboard video artifact API", () => {
  let app: FastifyInstance;
  const cleanupDirs: string[] = [];
  const cleanupWorkspaceIds: string[] = [];
  let dashboardAssetDir: string;

  before(async () => {
    dashboardAssetDir = await mkdtemp(path.join(os.tmpdir(), "daireel-dashboard-assets-"));
    cleanupDirs.push(dashboardAssetDir);
    config.dashboardAssetDir = dashboardAssetDir;
    app = await buildServer();
  });

  after(async () => {
    if (cleanupWorkspaceIds.length > 0) {
      await db.db2.pool().query("begin");
      try {
        await db.db2.pool().query(
          "delete from dashboard_video_artifacts where workspace_id = any($1::text[])",
          [cleanupWorkspaceIds],
        );
        await db.db2.pool().query(
          "delete from final_video_jobs where workspace_id = any($1::text[])",
          [cleanupWorkspaceIds],
        );
        await db.db2.pool().query(
          "delete from creative_workspace where id = any($1::text[])",
          [cleanupWorkspaceIds],
        );
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

  it("imports a completed final video and lists its dashboard metadata", async () => {
    const { directory, workspaceId } = await createWorkspace(app, cleanupDirs);
    cleanupWorkspaceIds.push(workspaceId);
    const finalVideoJobId = `fv_dashboard_${Date.now()}`;
    const localUrl = `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`;
    const localPath = `final/${finalVideoJobId}/final.mp4`;
    const sourceVideoBytes = Buffer.from("fake mp4 bytes");
    const creativeFactors = {
      productType: "offline-experience-service",
      audience: "child",
      strategy: "scenario-demo",
      visualStyle: "authentic",
    };
    const finalFilePath = path.join(directory, ".daireel", localPath);
    await mkdir(path.dirname(finalFilePath), { recursive: true });
    await writeFile(finalFilePath, sourceVideoBytes);

    await db.db2.insertFinalVideoJob({
      id: finalVideoJobId,
      workspaceId,
      shotSetId: null,
      status: "SUCCEEDED",
      sourceShotVideoIds: [],
      sourceVideoScriptArtifactIds: [],
      localPath,
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
        name: "测试导入成片",
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
    assert.equal(created.data.name, "测试导入成片");
    assert.equal(
      created.data.localUrl,
      `/api/dashboard/videos/${created.data.id}/file`,
    );
    assert.equal(created.data.durationSec, 18);
    assert.match(created.data.importedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(created.data.creativeFactors, creativeFactors);
    assert.equal(
      await readFile(
        path.join(dashboardAssetDir, created.data.id, "video.mp4"),
        "utf8",
      ),
      sourceVideoBytes.toString("utf8"),
    );
    const metadata = JSON.parse(
      await readFile(
        path.join(dashboardAssetDir, created.data.id, "metadata.json"),
        "utf8",
      ),
    ) as {
      name: string;
      importedAt: string;
      workspaceId: string;
      finalVideoJobId: string;
      creativeFactors: typeof creativeFactors;
      creativeTags: { creativeFactors: typeof creativeFactors };
    };
    assert.equal(metadata.name, "测试导入成片");
    assert.equal(metadata.importedAt, created.data.importedAt);
    assert.equal(metadata.workspaceId, workspaceId);
    assert.equal(metadata.finalVideoJobId, finalVideoJobId);
    assert.deepEqual(metadata.creativeFactors, creativeFactors);
    assert.deepEqual(metadata.creativeTags.creativeFactors, creativeFactors);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
    });
    assert.equal(listResponse.statusCode, 200, listResponse.body);
    const listed = listResponse.json() as { data: Array<typeof created.data> };
    assert.equal(listed.data[0]?.id, created.data.id);
    assert.deepEqual(listed.data[0]?.creativeFactors, creativeFactors);

    const globalListResponse = await app.inject({
      method: "GET",
      url: "/api/dashboard/videos",
    });
    assert.equal(globalListResponse.statusCode, 200, globalListResponse.body);
    const globalListed = globalListResponse.json() as {
      data: Array<typeof created.data>;
    };
    assert.ok(globalListed.data.some((item) => item.id === created.data.id));

    const fileResponse = await app.inject({
      method: "GET",
      url: created.data.localUrl,
    });
    assert.equal(fileResponse.statusCode, 200, fileResponse.body);
    assert.equal(fileResponse.headers["content-type"], "video/mp4");
    assert.deepEqual(fileResponse.rawPayload, sourceVideoBytes);
  });

  it("rejects importing a final video before the stable file is ready", async () => {
    const { workspaceId } = await createWorkspace(app, cleanupDirs);
    cleanupWorkspaceIds.push(workspaceId);
    const finalVideoJobId = `fv_dashboard_pending_${Date.now()}`;

    await db.db2.insertFinalVideoJob({
      id: finalVideoJobId,
      workspaceId,
      shotSetId: null,
      status: "SUCCEEDED",
      sourceShotVideoIds: [],
      sourceVideoScriptArtifactIds: [],
      localPath: null,
      localUrl: `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`,
      durationSec: null,
      width: null,
      height: null,
      compiledManifest: {},
      compiledManifestHash: null,
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: `${finalVideoJobId}:idem`,
      completedAt: null,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
      payload: {
        finalVideoJobId,
        name: "未完成成片",
      },
    });

    assert.equal(response.statusCode, 409, response.body);
    assert.match(response.body, /FINAL_VIDEO_NOT_READY/);
  });
});
