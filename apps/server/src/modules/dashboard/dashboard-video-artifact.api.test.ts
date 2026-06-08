import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { config } from "../../common/config.js";
import { db } from "../../db/client.js";
import { __setWorkspaceStorageAdapterFactoryForTests } from "../workspace/storage/workspace-storage-resolver.js";
import { __setDashboardS3OpsForTests } from "./dashboard-asset-storage.js";

const DROPPED_DASHBOARD_FIELDS = [
  "creativeTags",
  "creativeTagsSchemaVersion",
  "factorPromptVersion",
  "promptRequirementsArtifactId",
  "shotPromptArtifactId",
  "metadata",
] as const;

const DROPPED_DASHBOARD_COLUMNS = [
  "creative_tags",
  "creative_tags_schema_version",
  "factor_prompt_version",
  "prompt_requirements_artifact_id",
  "shot_prompt_artifact_id",
  "metadata",
] as const;

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
    dashboardAssetDir = await mkdtemp(
      path.join(os.tmpdir(), "daireel-dashboard-assets-"),
    );
    cleanupDirs.push(dashboardAssetDir);
    config.dashboardAssetDir = dashboardAssetDir;
    app = await buildServer();
  });

  after(async () => {
    if (cleanupWorkspaceIds.length > 0) {
      await db.db2.pool().query("begin");
      try {
        await db.db2
          .pool()
          .query(
            "delete from dashboard_video_artifacts where workspace_id = any($1::text[])",
            [cleanupWorkspaceIds],
          );
        await db.db2
          .pool()
          .query(
            "delete from final_video_jobs where workspace_id = any($1::text[])",
            [cleanupWorkspaceIds],
          );
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
    __setWorkspaceStorageAdapterFactoryForTests(undefined);
    __setDashboardS3OpsForTests(undefined);
  });

  it("imports a completed final video with the full four creative factors", async () => {
    const { directory, workspaceId } = await createWorkspace(app, cleanupDirs);
    cleanupWorkspaceIds.push(workspaceId);
    const finalVideoJobId = `fv_dashboard_${Date.now()}`;
    const localUrl = `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`;
    const localPath = `final/${finalVideoJobId}/final.mp4`;
    const sourceVideoBytes = Buffer.from("fake mp4 bytes");
    const creativeFactors = {
      productCategory: "mom-baby-pet",
      dealType: "seeding-nonstandard",
      audience: "child",
      strategy: "scenario-demo",
    } as const;
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
        schemaVersion: "final-video-manifest",
        creativeAttribution: {
          schemaVersion: "creative-attribution",
          promptRequirementsArtifactId: "req_dashboard",
          shotPromptArtifactId: "shotprompt_dashboard",
          creativeFactors,
          factorPromptVersion: "factor-prompt.2026-06-08",
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
      } & Record<string, unknown>;
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
    // B1: the full four factors round-trip, including productCategory.
    assert.deepEqual(created.data.creativeFactors, creativeFactors);
    assert.equal(created.data.creativeFactors.productCategory, "mom-baby-pet");
    // B2: the legacy attribution/tag fields are gone from the DTO.
    for (const field of DROPPED_DASHBOARD_FIELDS) {
      assert.equal(field in created.data, false, `expected ${field} to be dropped`);
    }

    // B4: re-import is idempotent and still returns the full four factors.
    const duplicateResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
      payload: {
        finalVideoJobId,
        name: "重复导入应被忽略",
      },
    });
    assert.equal(duplicateResponse.statusCode, 200, duplicateResponse.body);
    const duplicate = duplicateResponse.json() as typeof created;
    assert.equal(duplicate.data.id, created.data.id);
    assert.equal(duplicate.data.name, "测试导入成片");
    assert.deepEqual(duplicate.data.creativeFactors, creativeFactors);

    // B2: the DB row stores the full factors and no longer carries the dropped columns.
    const artifactRows = await db.db2
      .pool()
      .query(
        `select * from dashboard_video_artifacts where final_video_job_id = $1`,
        [finalVideoJobId],
      );
    assert.equal(artifactRows.rowCount, 1);
    const artifactRow = artifactRows.rows[0];
    assert.deepEqual(artifactRow.creative_factors, creativeFactors);
    for (const column of DROPPED_DASHBOARD_COLUMNS) {
      assert.equal(column in artifactRow, false, `expected ${column} column dropped`);
    }

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
    } & Record<string, unknown>;
    assert.equal(metadata.name, "测试导入成片");
    assert.equal(metadata.importedAt, created.data.importedAt);
    assert.equal(metadata.workspaceId, workspaceId);
    assert.equal(metadata.finalVideoJobId, finalVideoJobId);
    // B1/B2: sidecar carries the full factors and none of the dropped fields.
    assert.deepEqual(metadata.creativeFactors, creativeFactors);
    for (const field of DROPPED_DASHBOARD_FIELDS) {
      assert.equal(field in metadata, false, `expected ${field} dropped from sidecar`);
    }

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

  it("rejects importing a completed final video that has no resolved creative factors", async () => {
    const { workspaceId } = await createWorkspace(app, cleanupDirs);
    cleanupWorkspaceIds.push(workspaceId);
    const finalVideoJobId = `fv_dashboard_nofactors_${Date.now()}`;

    await db.db2.insertFinalVideoJob({
      id: finalVideoJobId,
      workspaceId,
      shotSetId: null,
      status: "SUCCEEDED",
      sourceShotVideoIds: [],
      sourceVideoScriptArtifactIds: [],
      localPath: `final/${finalVideoJobId}/final.mp4`,
      localUrl: `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`,
      durationSec: 12,
      width: 720,
      height: 1280,
      // Completed file, but the manifest never resolved creative factors.
      compiledManifest: { schemaVersion: "final-video-manifest" },
      compiledManifestHash: "sha256:no-factors",
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: `${finalVideoJobId}:idem`,
      completedAt: "2026-06-09T08:00:00.000Z",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
      payload: {
        finalVideoJobId,
        name: "缺少四因子成片",
      },
    });

    assert.equal(response.statusCode, 409, response.body);
    assert.match(response.body, /FINAL_VIDEO_MISSING_CREATIVE_FACTORS/);

    const rows = await db.db2
      .pool()
      .query(
        `select id from dashboard_video_artifacts where final_video_job_id = $1`,
        [finalVideoJobId],
      );
    assert.equal(rows.rowCount, 0);
  });

  it("keeps the imported dashboard video after its workspace is deleted", async () => {
    const { directory, workspaceId } = await createWorkspace(app, cleanupDirs);
    cleanupWorkspaceIds.push(workspaceId);
    const finalVideoJobId = `fv_dashboard_survive_${Date.now()}`;
    const localUrl = `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`;
    const localPath = `final/${finalVideoJobId}/final.mp4`;
    const sourceVideoBytes = Buffer.from("survive mp4 bytes");
    const creativeFactors = {
      productCategory: "consumer-electronics",
      dealType: "search-standard",
      audience: "youth",
      strategy: "review-comparison",
    } as const;
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
      durationSec: 14,
      width: 1080,
      height: 1920,
      compiledManifest: {
        schemaVersion: "final-video-manifest",
        creativeAttribution: {
          schemaVersion: "creative-attribution",
          promptRequirementsArtifactId: "req_survive",
          shotPromptArtifactId: "shotprompt_survive",
          creativeFactors,
          factorPromptVersion: "factor-prompt.2026-06-08",
        },
      },
      compiledManifestHash: "sha256:survive-manifest",
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: `${finalVideoJobId}:idem`,
      completedAt: "2026-06-06T08:00:00.000Z",
    });

    const createResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
      payload: { finalVideoJobId, name: "工作台删除后仍保留" },
    });
    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const created = createResponse.json() as {
      data: { id: string; localUrl: string };
    };

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}`,
    });
    assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);

    // The dashboard artifact survives: row, trace key, and factors are intact.
    const globalListResponse = await app.inject({
      method: "GET",
      url: "/api/dashboard/videos",
    });
    assert.equal(globalListResponse.statusCode, 200, globalListResponse.body);
    const globalListed = globalListResponse.json() as {
      data: Array<{
        id: string;
        finalVideoJobId: string | null;
        creativeFactors: typeof creativeFactors;
      }>;
    };
    const survivor = globalListed.data.find((item) => item.id === created.data.id);
    assert.ok(survivor, "dashboard artifact must survive workspace deletion");
    assert.equal(survivor?.finalVideoJobId, finalVideoJobId);
    assert.deepEqual(survivor?.creativeFactors, creativeFactors);

    // The copied bytes still stream from dashboard-owned storage.
    const fileResponse = await app.inject({
      method: "GET",
      url: created.data.localUrl,
    });
    assert.equal(fileResponse.statusCode, 200, fileResponse.body);
    assert.deepEqual(fileResponse.rawPayload, sourceVideoBytes);
  });

  it("enforces a unique dashboard row per final video job id", async () => {
    const { workspaceId } = await createWorkspace(app, cleanupDirs);
    cleanupWorkspaceIds.push(workspaceId);
    const finalVideoJobId = `fv_dashboard_unique_${Date.now()}`;
    const creativeFactors = JSON.stringify({
      productCategory: "home-living",
      dealType: "search-standard",
      audience: "general",
      strategy: "tutorial-value",
    });
    const insert = (artifactId: string) =>
      db.db2.pool().query(
        `insert into dashboard_video_artifacts
          (id, workspace_id, final_video_job_id, name, local_url, creative_factors, imported_at)
         values ($1,$2,$3,$4,$5,$6, now())`,
        [
          artifactId,
          workspaceId,
          finalVideoJobId,
          "唯一约束测试",
          `/api/dashboard/videos/${artifactId}/file`,
          creativeFactors,
        ],
      );

    await insert(`dash_unique_a_${Date.now()}`);
    await assert.rejects(
      insert(`dash_unique_b_${Date.now()}`),
      /duplicate key|unique/i,
      "a second dashboard row for the same final video job id must be rejected",
    );
  });

  it("stores imported dashboard videos in the dedicated dashboard S3 bucket and survives workspace deletion", async () => {
    const createWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: `s3-dashboard-${Date.now()}` },
    });
    assert.equal(createWorkspaceResponse.statusCode, 200, createWorkspaceResponse.body);
    const workspaceId = createWorkspaceResponse.json().workspace.id as string;
    cleanupWorkspaceIds.push(workspaceId);
    // Dashboard copies go to a DEDICATED bucket, distinct from the workspace's source bucket.
    config.dashboardS3Bucket = "dashboard-bucket";
    const bindResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/storage/bind`,
      payload: {
        kind: "s3",
        bucket: "workspace-source-bucket",
        prefix: `workspaces/${workspaceId}`,
        endpoint: "http://localhost:9000",
      },
    });
    assert.equal(bindResponse.statusCode, 200, bindResponse.body);

    const finalVideoJobId = `fv_dashboard_s3_${Date.now()}`;
    const localPath = `final/${finalVideoJobId}/final.mp4`;
    const sourceVideoBytes = Buffer.from("fake s3 mp4 bytes");
    const s3Objects = new Map<string, { body: Buffer; contentType?: string }>();
    const putKeys: string[] = [];
    __setWorkspaceStorageAdapterFactoryForTests((binding) => ({
      kind: "S3",
      binding,
      putObject: async () => ({
        relativePath: "unused",
        size: null,
        contentType: null,
        lastModified: null,
      }),
      readObject: async (relativePath) => {
        assert.equal(relativePath, localPath);
        return sourceVideoBytes;
      },
      streamObject: async () => Readable.from([sourceVideoBytes]),
      deleteObject: async () => undefined,
      listObjects: async () => [],
      statObject: async () => ({
        relativePath: localPath,
        size: sourceVideoBytes.length,
        contentType: "video/mp4",
        lastModified: null,
      }),
      exists: async () => true,
      downloadToTemp: async () => undefined,
      deletePrefix: async () => undefined,
    }));
    __setDashboardS3OpsForTests({
      putObject: async ({ bucket, key, body, contentType }) => {
        assert.equal(bucket, "dashboard-bucket");
        putKeys.push(key);
        s3Objects.set(key, {
          body: Buffer.isBuffer(body) ? body : Buffer.from(body),
          contentType,
        });
      },
      getObjectStream: async ({ bucket, key }) => {
        assert.equal(bucket, "dashboard-bucket");
        const object = s3Objects.get(key);
        assert.ok(object, `missing object ${key}`);
        return Readable.from([object.body]);
      },
    });

    await db.db2.insertFinalVideoJob({
      id: finalVideoJobId,
      workspaceId,
      shotSetId: null,
      status: "SUCCEEDED",
      sourceShotVideoIds: [],
      sourceVideoScriptArtifactIds: [],
      localPath,
      localUrl: `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`,
      durationSec: 12,
      width: 720,
      height: 1280,
      compiledManifest: {
        schemaVersion: "final-video-manifest",
        creativeAttribution: {
          schemaVersion: "creative-attribution",
          promptRequirementsArtifactId: "req_s3",
          shotPromptArtifactId: "shotprompt_s3",
          creativeFactors: {
            productCategory: "consumer-electronics",
            dealType: "search-standard",
            audience: "youth",
            strategy: "review-comparison",
          },
          factorPromptVersion: "factor-prompt.2026-06-08",
        },
      },
      compiledManifestHash: "sha256:s3-dashboard",
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: `${finalVideoJobId}:idem`,
      completedAt: "2026-06-09T08:00:00.000Z",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
      payload: { finalVideoJobId, name: "S3 导入成片" },
    });
    assert.equal(response.statusCode, 200, response.body);
    const created = response.json() as {
      data: { id: string; localUrl: string; name: string };
    };
    // Object keys are the dashboard's OWN id, not the workspace/job id.
    const videoObjectKey = `dashboard/${created.data.id}/video.mp4`;
    const metadataObjectKey = `dashboard/${created.data.id}/metadata.json`;
    assert.deepEqual(putKeys, [videoObjectKey, metadataObjectKey]);
    assert.deepEqual(s3Objects.get(videoObjectKey)?.body, sourceVideoBytes);
    assert.equal(s3Objects.get(videoObjectKey)?.contentType, "video/mp4");
    assert.equal(s3Objects.get(metadataObjectKey)?.contentType, "application/json");

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
      };
    };
    assert.equal(metadata.schemaVersion, "dashboard-video-metadata");
    assert.equal(metadata.finalVideoJobId, finalVideoJobId);
    assert.deepEqual(metadata.storage, {
      kind: "S3",
      bucket: "dashboard-bucket",
      videoObjectKey,
      metadataObjectKey,
      localAssetDir: null,
    });

    const row = await db.db2.pool().query(
      `select storage_kind, storage_bucket, video_object_key, metadata_object_key
       from dashboard_video_artifacts where id = $1`,
      [created.data.id],
    );
    assert.deepEqual(row.rows[0], {
      storage_kind: "S3",
      storage_bucket: "dashboard-bucket",
      video_object_key: videoObjectKey,
      metadata_object_key: metadataObjectKey,
    });

    const fileResponse = await app.inject({
      method: "GET",
      url: created.data.localUrl,
    });
    assert.equal(fileResponse.statusCode, 200, fileResponse.body);
    assert.deepEqual(fileResponse.rawPayload, sourceVideoBytes);

    const putCountAfterFirstImport = putKeys.length;
    const duplicateResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/dashboard/videos`,
      payload: { finalVideoJobId, name: "重复 S3 导入" },
    });
    assert.equal(duplicateResponse.statusCode, 200, duplicateResponse.body);
    assert.equal(putKeys.length, putCountAfterFirstImport);
    assert.equal(duplicateResponse.json().data.id, created.data.id);

    // S4: after the workspace is deleted, the S3-backed dashboard video still streams
    // from the dedicated dashboard bucket (no dependency on the workspace binding).
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}`,
    });
    assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);

    const afterDeleteFile = await app.inject({
      method: "GET",
      url: created.data.localUrl,
    });
    assert.equal(afterDeleteFile.statusCode, 200, afterDeleteFile.body);
    assert.deepEqual(afterDeleteFile.rawPayload, sourceVideoBytes);

    config.dashboardS3Bucket = undefined;
    __setWorkspaceStorageAdapterFactoryForTests(undefined);
    __setDashboardS3OpsForTests(undefined);
  });
});
