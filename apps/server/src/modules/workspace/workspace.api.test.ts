import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";

const cleanupDirs: string[] = [];

async function createBoundWorkspace(app: FastifyInstance) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `workspace-v2-${Date.now()}` },
  });
  assert.equal(createResponse.statusCode, 200, createResponse.body);
  const workspace = createResponse.json().workspace as { id: string };

  const directory = await mkdtemp(path.join(os.tmpdir(), "workspace-v2-"));
  cleanupDirs.push(directory);
  const bindResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/storage/bind`,
    payload: { kind: "local", localPath: directory },
  });
  assert.equal(bindResponse.statusCode, 200, bindResponse.body);

  return { workspaceId: workspace.id, directory };
}

function assertPromptAssembly(value: unknown, moduleId: string) {
  assert.ok(value && typeof value === "object", "expected promptAssembly object");
  const assembly = value as Record<string, unknown>;
  assert.equal(assembly.moduleId, moduleId);
  assert.equal(assembly.assemblerVersion, "v2");
  assert.match(String(assembly.subjectHash), /^[a-f0-9]{64}$/);
  assert.match(String(assembly.contractHash), /^[a-f0-9]{64}$/);
}

function multipartFilePayload(input: {
  fieldName: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}) {
  const boundary = `----workspace-test-${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${input.fieldName}"; filename="${input.filename}"\r\n` +
      `Content-Type: ${input.contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat([head, input.bytes, tail]),
  };
}

describe("workspace API", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
    await Promise.all(
      cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("creates a logical workspace, binds local storage, and uploads managed material", async () => {
    const { workspaceId, directory } = await createBoundWorkspace(app);

    const directoryResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/directory`,
    });
    assert.equal(directoryResponse.statusCode, 200, directoryResponse.body);
    assert.equal(directoryResponse.json().data.directory, directory);

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/materials`,
      payload: {
        filename: "product.png",
        dataBase64: Buffer.from(transparentPngBytes).toString("base64"),
      },
    });
    assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);
    assert.equal(uploadResponse.json().workspace.id, workspaceId);
    assert.match(
      uploadResponse.json().material.url,
      new RegExp(`/api/workspaces/${workspaceId}/materials/product\\.png$`),
    );
  });

  it("rejects workspace image materials over the model input limit", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    const multipart = multipartFilePayload({
      fieldName: "file",
      filename: "too-large.png",
      contentType: "image/png",
      bytes: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/materials`,
      headers: multipart.headers,
      payload: multipart.payload,
    });

    assert.equal(uploadResponse.statusCode, 400, uploadResponse.body);
    assert.equal(uploadResponse.json().code, "IMAGE_TOO_LARGE_FOR_MODEL");
  });

  it("keeps non-image workspace materials on the 50MB limit", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    const multipart = multipartFilePayload({
      fieldName: "file",
      filename: "large-notes.txt",
      contentType: "text/plain",
      bytes: Buffer.alloc(10 * 1024 * 1024 + 1, "a"),
    });
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/materials`,
      headers: multipart.headers,
      payload: multipart.payload,
    });

    assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);
    assert.equal(uploadResponse.json().material.ref, "large-notes.txt");
  });

  it("deletes workspace material files and asset records", async () => {
    const { workspaceId, directory } = await createBoundWorkspace(app);
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/materials`,
      payload: {
        filename: "delete-me.png",
        dataBase64: Buffer.from(transparentPngBytes).toString("base64"),
      },
    });
    assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);
    const materialPath = path.join(
      directory,
      ".daireel",
      "materials",
      "delete-me.png",
    );
    await stat(materialPath);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/materials/delete-me.png`,
    });

    assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);
    assert.deepEqual(deleteResponse.json().data, {
      workspaceId,
      ref: "delete-me.png",
      deleted: true,
    });
    await assert.rejects(() => stat(materialPath), { code: "ENOENT" });

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`,
    });
    assert.equal(statusResponse.statusCode, 200, statusResponse.body);
    assert.equal(statusResponse.json().materialLibrary.assets.length, 0);

    const assetRows = await db.db2.pool().query(
      `select count(*)::integer as count
       from asset
       where metadata->>'workspaceId' = $1 and metadata->>'ref' = 'delete-me.png'`,
      [workspaceId],
    );
    assert.equal(assetRows.rows[0]?.count, 0);
  });

  it("rejects path traversal material deletes", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/materials/..%2Fsecret.png`,
    });

    assert.equal(deleteResponse.statusCode, 400, deleteResponse.body);
    assert.equal(deleteResponse.json().code, "INVALID_MATERIAL_REF");
  });

  it("stores current V2 module artifacts outside workspace_artifact", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/materials`,
      payload: {
        filename: "product.png",
        dataBase64: Buffer.from(transparentPngBytes).toString("base64"),
      },
    });
    assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);

    const requirementsPropose = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/prompt-requirements/propose`,
      payload: {
        data: {
          image: { style: "clean ecommerce product photo" },
          script: { tone: "direct" },
          storyboard: { structure: "hook-benefit-proof-cta" },
          shotImage: { continuity: "preserve product identity" },
          shotVideo: { motion: "stable product-first movement" },
        },
      },
    });
    assert.equal(requirementsPropose.statusCode, 200, requirementsPropose.body);
    const requirementsApprove = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/prompt-requirements/approve`,
      payload: { artifactId: requirementsPropose.json().data.id },
    });
    assert.equal(requirementsApprove.statusCode, 200, requirementsApprove.body);
    assertPromptAssembly(
      requirementsApprove.json().data.promptAssembly,
      "prompt-requirements",
    );

    const materialPropose = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/material-intake/propose`,
      payload: {},
    });
    assert.equal(materialPropose.statusCode, 200, materialPropose.body);
    const materialApprove = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/material-intake/approve`,
      payload: { artifactId: materialPropose.json().data.id },
    });
    assert.equal(materialApprove.statusCode, 200, materialApprove.body);
    assertPromptAssembly(
      materialApprove.json().data.promptAssembly,
      "material-intake",
    );

    const legacy = await db.db2.pool().query(
      `select count(*)::integer as count
       from workspace_artifact
       where workspace_id = $1
         and artifact_type in ('assets', 'brief', 'storyboard', 'shotprompt')`,
      [workspaceId],
    );
    assert.equal(legacy.rows[0]?.count, 0);

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`,
    });
    assert.equal(statusResponse.statusCode, 200, statusResponse.body);
    const status = statusResponse.json();
    assert.equal(status.workspace.id, workspaceId);
    assert.equal(
      status.modules["prompt-requirements"].current.id,
      requirementsApprove.json().data.id,
    );
    assert.equal(
      status.modules["material-intake"].current.id,
      materialApprove.json().data.id,
    );
    assert.equal(
      status.artifacts.material.id,
      materialApprove.json().data.id,
    );
    assert.equal(status.activeShotSet, null);
  });
});
