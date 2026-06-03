import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";

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
});
