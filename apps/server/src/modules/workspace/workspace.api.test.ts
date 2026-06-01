import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
