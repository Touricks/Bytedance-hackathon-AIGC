import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";

async function createWorkspace(app: FastifyInstance, cleanupDirs: string[]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "daireel-final-video-"));
  cleanupDirs.push(directory);
  const response = await app.inject({
    method: "POST",
    url: "/api/workspaces/init",
    payload: { directory },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<{ workspace: { id: string } }>().workspace.id;
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function materialDraft(description = "商品主图素材 product.png") {
  return {
    scannedAt: "2026-06-04T00:00:00.000Z",
    primaryProductRef: "product.png",
    assets: [
      {
        ref: "product.png",
        kind: "image",
        mime: "image/png",
        bytes: transparentPngBytes.length,
        sha256: sha256(transparentPngBytes),
        role: "product_main",
        description,
        relevance: "high",
        usable: true,
        included: true,
      },
    ],
    rejected: [],
  };
}

async function approvePromptRequirements(app: FastifyInstance, workspaceId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/prompt-requirements/approve`,
    payload: {
      data: {
        image: { style: "真实商品素材" },
        script: { tone: "direct" },
        storyboard: { structure: "开场钩子-卖点证明-行动号召" },
        shotImage: { global: "保持商品身份一致" },
        shotVideo: { global: "镜头运动稳定" },
      },
    },
  });
  assert.equal(response.statusCode, 200, response.body);
}

describe("generation controller final video downloads", () => {
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

  it("serves final video files inline by default and as attachments for download links", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);
    const directory = await mkdtemp(path.join(os.tmpdir(), "daireel-final-file-"));
    cleanupDirs.push(directory);
    const localPath = path.join(directory, "final.mp4");
    await writeFile(localPath, Buffer.from("fake mp4 bytes"));
    const finalVideoJobId = `fv_download_${Date.now()}`;

    await db.db2.insertFinalVideoJob({
      id: finalVideoJobId,
      workspaceId,
      shotSetId: null,
      status: "SUCCEEDED",
      sourceShotVideoIds: [],
      sourceVideoScriptArtifactIds: [],
      localPath,
      localUrl: `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`,
      durationSec: 1,
      width: 1080,
      height: 1920,
      compiledManifest: {},
      compiledManifestHash: "manifest-hash",
      ffmpegLog: null,
      errorMessage: null,
      idempotencyKey: `${finalVideoJobId}:idem`,
      completedAt: new Date().toISOString(),
    });

    const inlineResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file`,
    });
    assert.equal(inlineResponse.statusCode, 200, inlineResponse.body);
    assert.match(inlineResponse.headers["content-type"] as string, /video\/mp4/);
    assert.equal(inlineResponse.headers["content-disposition"], undefined);

    const downloadResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/final-videos/${finalVideoJobId}/file?download=1`,
    });
    assert.equal(downloadResponse.statusCode, 200, downloadResponse.body);
    assert.match(downloadResponse.headers["content-type"] as string, /video\/mp4/);
    assert.equal(
      downloadResponse.headers["content-disposition"],
      `attachment; filename="final-video-${finalVideoJobId}.mp4"`,
    );
  });

  it("requires an idempotency key for one-click final video jobs", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);
    await approvePromptRequirements(app, workspaceId);

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/one-click-final-videos`,
      payload: {
        materialIntake: { data: materialDraft() },
        outputAspectRatio: "9:16",
      },
    });

    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, "IDEMPOTENCY_KEY_REQUIRED");
  });

  it("dedupes repeated one-click final video idempotency keys", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);
    await approvePromptRequirements(app, workspaceId);
    const idempotencyKey = `${workspaceId}:one-click:test`;

    const first = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/one-click-final-videos`,
      headers: { "Idempotency-Key": idempotencyKey },
      payload: {
        materialIntake: { data: materialDraft("首次一键成片素材解读") },
        outputAspectRatio: "9:16",
      },
    });
    assert.equal(first.statusCode, 200, first.body);

    const second = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/one-click-final-videos`,
      headers: { "Idempotency-Key": idempotencyKey },
      payload: {
        materialIntake: { data: materialDraft("重复请求不应创建新任务") },
        outputAspectRatio: "9:16",
      },
    });
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().data.id, first.json().data.id);
    assert.equal(second.json().deduped, true);
  });

  it("rejects a second active one-click final video job for the same workspace", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);
    await approvePromptRequirements(app, workspaceId);

    const first = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/one-click-final-videos`,
      headers: { "Idempotency-Key": `${workspaceId}:one-click:first` },
      payload: {
        materialIntake: { data: materialDraft("首个运行中的一键任务") },
        outputAspectRatio: "9:16",
      },
    });
    assert.equal(first.statusCode, 200, first.body);

    const second = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/one-click-final-videos`,
      headers: { "Idempotency-Key": `${workspaceId}:one-click:second` },
      payload: {
        materialIntake: { data: materialDraft("第二个任务应被拒绝") },
        outputAspectRatio: "9:16",
      },
    });

    assert.equal(second.statusCode, 409, second.body);
    assert.equal(second.json().code, "ONE_CLICK_FINAL_VIDEO_RUNNING");
  });

  it("approves the submitted material intake draft as current before starting one-click", async () => {
    const workspaceId = await createWorkspace(app, cleanupDirs);
    await approvePromptRequirements(app, workspaceId);
    const draft = materialDraft("一键成片使用页面上的素材解读草稿");

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/one-click-final-videos`,
      headers: { "Idempotency-Key": `${workspaceId}:one-click:material-current` },
      payload: {
        materialIntake: { data: draft },
        outputAspectRatio: "16:9",
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, "PENDING");
    assert.equal(response.json().data.outputAspectRatio, "16:9");

    const status = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`,
    });
    assert.equal(status.statusCode, 200, status.body);
    assert.equal(
      status.json().artifacts.material.data.assets[0].description,
      draft.assets[0]!.description,
    );
    assert.equal(status.json().artifacts.material.isCurrent, true);
    assert.equal(status.json().activeOneClickFinalVideo.id, response.json().data.id);
  });
});
