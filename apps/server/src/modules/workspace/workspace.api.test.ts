import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildCreativeFactorRequirements, type CreativeFactors } from "@aigc-video/shared";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";
import { __setWorkspaceStorageAdapterFactoryForTests } from "./storage/workspace-storage-resolver.js";

const cleanupDirs: string[] = [];

async function createBoundWorkspace(app: FastifyInstance) {
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `workspace-current-${Date.now()}` },
  });
  assert.equal(createResponse.statusCode, 200, createResponse.body);
  const workspace = createResponse.json().workspace as { id: string };

  const directory = await mkdtemp(path.join(os.tmpdir(), "workspace-current-"));
  cleanupDirs.push(directory);
  const bindResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/storage/bind`,
    payload: { kind: "local", localPath: directory },
  });
  assert.equal(bindResponse.statusCode, 200, bindResponse.body);

  return { workspaceId: workspace.id, directory };
}

async function createInitializedWorkspace(app: FastifyInstance) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "workspace-current-init-"));
  cleanupDirs.push(directory);
  const initResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces/init",
    payload: { directory },
  });
  assert.equal(initResponse.statusCode, 200, initResponse.body);
  return {
    workspaceId: initResponse.json().workspace.id as string,
    directory,
  };
}

function testPromptRequirementsData(input: Partial<CreativeFactors> = {}) {
  return buildCreativeFactorRequirements({
    productCategory: "consumer-electronics",
    dealType: "search-standard",
    audience: "youth",
    strategy: "review-comparison",
    ...input,
  });
}

async function approveMinimumWorkspaceInputs(app: FastifyInstance, workspaceId: string) {
  const requirementsApprove = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/prompt-requirements/approve`,
    payload: {
      data: testPromptRequirementsData(),
    },
  });
  assert.equal(requirementsApprove.statusCode, 200, requirementsApprove.body);

  const materialApprove = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/material-intake/approve`,
    payload: {
      data: {
        scannedAt: "2026-06-02T00:00:00.000Z",
        primaryProductRef: "product.png",
        assets: [
          {
            ref: "product.png",
            kind: "image",
            mime: "image/png",
            bytes: transparentPngBytes.length,
            sha256: sha256(transparentPngBytes),
            role: "product_main",
            description: "商品主图素材 product.png",
            relevance: "high",
            usable: true,
            included: true,
          },
        ],
        rejected: [],
      },
    },
  });
  assert.equal(materialApprove.statusCode, 200, materialApprove.body);

  const briefApprove = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/product-brief/approve`,
    payload: {
      data: {
        product: {
          name: "山茶花修护精华油",
          category: "护肤",
          keyFacts: ["山茶花籽油", "换季修护"],
          assets: [{ ref: "product.png", useAs: "primary" }],
        },
        audience: {
          who: "换季干燥肌用户",
          painOrDesire: "想要快速缓解干燥起皮",
        },
        coreSellingPoint: "山茶花籽油亲肤修护",
        proof: ["主图展示产品包装和油体质感"],
        offer: "下单立减",
        platform: "抖音",
        brandTone: "真实直接",
        bannedExpressions: [],
        landingInfo: null,
        assumptions: [],
      },
    },
  });
  assert.equal(briefApprove.statusCode, 200, briefApprove.body);
}

function assertPromptAssembly(value: unknown, moduleId: string) {
  assert.ok(value && typeof value === "object", "expected promptAssembly object");
  const assembly = value as Record<string, unknown>;
  assert.equal(assembly.moduleId, moduleId);
  assert.equal(assembly.assemblerVersion, "module-prompt-assembler");
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

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function startArkProductBriefServer() {
  const requests: unknown[] = [];
  const server: Server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                product: {
                  name: "城市地标旅行素材",
                  category: "旅游服务",
                  keyFacts: ["洛杉矶城市道路实拍", "Route 66 地标"],
                  assets: [{ ref: "product.png", useAs: "primary" }],
                },
                audience: {
                  who: "计划城市旅行的用户",
                  painOrDesire: "想快速了解城市地标体验",
                },
                coreSellingPoint: "用真实城市街景展示洛杉矶旅行氛围",
                proof: ["主图展示城市道路、车辆、棕榈树和 Route 66 标识"],
                offer: null,
                platform: "抖音",
                brandTone: "真实直接",
                bannedExpressions: [],
                landingInfo: null,
                assumptions: [],
              }),
            },
          },
        ],
      }),
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function withEnv<T>(
  patch: Record<string, string | undefined>,
  run: () => Promise<T>,
) {
  const previous = new Map(
    Object.keys(patch).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
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

  it("deletes a registered local workspace and removes its .daireel directory", async () => {
    const { workspaceId, directory } = await createInitializedWorkspace(app);
    const daireelPath = path.join(directory, ".daireel");
    await stat(path.join(daireelPath, "workspace.json"));

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}`,
    });

    assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);
    assert.deepEqual(deleteResponse.json().data, {
      workspaceId,
      deleted: true,
    });
    await assert.rejects(() => stat(daireelPath), { code: "ENOENT" });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/workspaces",
    });
    assert.equal(listResponse.statusCode, 200, listResponse.body);
    assert.equal(
      listResponse
        .json()
        .workspaces.some((workspace: { id: string }) => workspace.id === workspaceId),
      false,
    );
  });

  it("keeps user files in the workspace directory when deleting workspace state", async () => {
    const { workspaceId, directory } = await createInitializedWorkspace(app);
    const keepPath = path.join(directory, "keep.txt");
    await writeFile(keepPath, "merchant-owned file");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}`,
    });

    assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);
    await stat(keepPath);
    await assert.rejects(() => stat(path.join(directory, ".daireel")), {
      code: "ENOENT",
    });
  });

  it("deletes workspace business rows and uploaded material asset records", async () => {
    const { workspaceId } = await createInitializedWorkspace(app);
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
        data: testPromptRequirementsData(),
      },
    });
    assert.equal(requirementsPropose.statusCode, 200, requirementsPropose.body);
    const requirementsApprove = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/prompt-requirements/approve`,
      payload: { artifactId: requirementsPropose.json().data.id },
    });
    assert.equal(requirementsApprove.statusCode, 200, requirementsApprove.body);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}`,
    });

    assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);
    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`,
    });
    assert.equal(statusResponse.statusCode, 404, statusResponse.body);
    const materialResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/materials/product.png`,
    });
    assert.equal(materialResponse.statusCode, 404, materialResponse.body);
    const assetRows = await db.db2.pool().query(
      `select count(*)::integer as count
       from asset
       where metadata->>'workspaceId' = $1`,
      [workspaceId],
    );
    assert.equal(assetRows.rows[0]?.count, 0);
  });

  it("deletes completed one-click final video job rows before referenced artifacts", async () => {
    const { workspaceId } = await createInitializedWorkspace(app);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const materialIntakeArtifactId = `delete-mi-${suffix}`;
    const productBriefArtifactId = `delete-pb-${suffix}`;
    const storyboardArtifactId = `delete-sb-${suffix}`;
    const shotPromptArtifactId = `delete-sp-${suffix}`;
    const oneClickJobId = `delete-ocv-${suffix}`;
    await db.db2.pool().query(
      `insert into material_intake_artifacts
         (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly, approved_at)
       values ($1, $2, 'approved', true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now())`,
      [materialIntakeArtifactId, workspaceId],
    );
    await db.db2.pool().query(
      `insert into product_brief_artifacts
         (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly, approved_at)
       values ($1, $2, 'approved', true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now())`,
      [productBriefArtifactId, workspaceId],
    );
    await db.db2.pool().query(
      `insert into storyboard_artifacts
         (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly, approved_at)
       values ($1, $2, 'approved', true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now())`,
      [storyboardArtifactId, workspaceId],
    );
    await db.db2.pool().query(
      `insert into shot_prompt_artifacts
         (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly, approved_at)
       values ($1, $2, 'approved', true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now())`,
      [shotPromptArtifactId, workspaceId],
    );
    await db.db2.pool().query(
      `insert into one_click_final_video_jobs
         (id, workspace_id, status, current_stage, stage_state,
          material_intake_artifact_id, product_brief_artifact_id,
          storyboard_artifact_id, shot_prompt_artifact_id, completed_at)
       values ($1, $2, 'SUCCEEDED', 'completed', '{}'::jsonb, $3, $4, $5, $6, now())`,
      [
        oneClickJobId,
        workspaceId,
        materialIntakeArtifactId,
        productBriefArtifactId,
        storyboardArtifactId,
        shotPromptArtifactId,
      ],
    );

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}`,
    });

    assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);
    const rows = await db.db2.pool().query(
      `select count(*)::integer as count
       from one_click_final_video_jobs
       where id = $1`,
      [oneClickJobId],
    );
    assert.equal(rows.rows[0]?.count, 0);
  });

  it("deletes workspace rows when the .daireel directory is already missing", async () => {
    const { workspaceId, directory } = await createInitializedWorkspace(app);
    await rm(path.join(directory, ".daireel"), { recursive: true, force: true });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}`,
    });

    assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);
    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`,
    });
    assert.equal(statusResponse.statusCode, 404, statusResponse.body);
  });

  it("rejects deleting a workspace with active generation work", async () => {
    const { workspaceId, directory } = await createInitializedWorkspace(app);
    const jobId = `delete-busy-${Date.now()}`;
    await db.db2.pool().query(
      `insert into generation_jobs
         (id, workspace_id, job_type, status, queue_name, payload)
       values ($1, $2, 'generate_images', 'PENDING', 'generation', '{}'::jsonb)`,
      [jobId, workspaceId],
    );

    try {
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/workspaces/${workspaceId}`,
      });

      assert.equal(deleteResponse.statusCode, 409, deleteResponse.body);
      assert.equal(deleteResponse.json().code, "WORKSPACE_DELETE_BUSY");
      await stat(path.join(directory, ".daireel", "workspace.json"));
      const statusResponse = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/status`,
      });
      assert.equal(statusResponse.statusCode, 200, statusResponse.body);
    } finally {
      await db.db2.pool().query(`delete from generation_jobs where id = $1`, [jobId]);
    }
  });

  it("rejects deleting a workspace with active one-click final video work", async () => {
    const { workspaceId, directory } = await createInitializedWorkspace(app);
    const oneClickJobId = `delete-busy-ocv-${Date.now()}`;
    await db.db2.pool().query(
      `insert into one_click_final_video_jobs
         (id, workspace_id, status, current_stage, stage_state)
       values ($1, $2, 'WAITING', 'image_generation', '{}'::jsonb)`,
      [oneClickJobId, workspaceId],
    );

    try {
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/workspaces/${workspaceId}`,
      });

      assert.equal(deleteResponse.statusCode, 409, deleteResponse.body);
      assert.equal(deleteResponse.json().code, "WORKSPACE_DELETE_BUSY");
      await stat(path.join(directory, ".daireel", "workspace.json"));
    } finally {
      await db.db2.pool().query(`delete from one_click_final_video_jobs where id = $1`, [
        oneClickJobId,
      ]);
    }
  });

  it("cleans S3 workspace prefixes before deleting workspace rows", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: `s3-delete-${Date.now()}` },
    });
    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const workspaceId = createResponse.json().workspace.id as string;
    const bindResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/storage/bind`,
      payload: {
        kind: "s3",
        bucket: "test-bucket",
        prefix: `workspaces/${workspaceId}`,
        endpoint: "http://localhost:9000",
      },
    });
    assert.equal(bindResponse.statusCode, 200, bindResponse.body);
    const deletedPrefixes: string[] = [];
    __setWorkspaceStorageAdapterFactoryForTests((binding) => ({
      kind: "S3",
      binding,
      putObject: async () => ({
        relativePath: "unused",
        size: null,
        contentType: null,
        lastModified: null,
      }),
      readObject: async () => Buffer.alloc(0),
      streamObject: async () => {
        throw new Error("unused");
      },
      deleteObject: async () => undefined,
      listObjects: async () => [],
      statObject: async () => ({
        relativePath: "unused",
        size: null,
        contentType: null,
        lastModified: null,
      }),
      exists: async () => false,
      downloadToTemp: async () => undefined,
      deletePrefix: async (prefix) => {
        deletedPrefixes.push(prefix);
      },
    }));

    try {
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/workspaces/${workspaceId}`,
      });

      assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);
      assert.deepEqual(deletedPrefixes, [""]);
      const statusResponse = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/status`,
      });
      assert.equal(statusResponse.statusCode, 404, statusResponse.body);
    } finally {
      __setWorkspaceStorageAdapterFactoryForTests(undefined);
    }
  });

  it("deletes the workspace row even when the storage purge fails (best-effort)", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: { name: `s3-purge-fail-${Date.now()}` },
    });
    assert.equal(createResponse.statusCode, 200, createResponse.body);
    const workspaceId = createResponse.json().workspace.id as string;
    const bindResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/storage/bind`,
      payload: {
        kind: "s3",
        bucket: "test-bucket",
        prefix: `workspaces/${workspaceId}`,
        endpoint: "http://localhost:9000",
      },
    });
    assert.equal(bindResponse.statusCode, 200, bindResponse.body);
    let purgeAttempted = false;
    __setWorkspaceStorageAdapterFactoryForTests((binding) => ({
      kind: "S3",
      binding,
      putObject: async () => ({
        relativePath: "unused",
        size: null,
        contentType: null,
        lastModified: null,
      }),
      readObject: async () => Buffer.alloc(0),
      streamObject: async () => {
        throw new Error("unused");
      },
      deleteObject: async () => undefined,
      listObjects: async () => [],
      statObject: async () => ({
        relativePath: "unused",
        size: null,
        contentType: null,
        lastModified: null,
      }),
      exists: async () => false,
      downloadToTemp: async () => undefined,
      deletePrefix: async () => {
        purgeAttempted = true;
        throw new Error("s3 purge boom");
      },
    }));

    try {
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/workspaces/${workspaceId}`,
      });

      assert.equal(deleteResponse.statusCode, 200, deleteResponse.body);
      assert.equal(deleteResponse.json().data.deleted, true);
      assert.equal(purgeAttempted, true);
      const statusResponse = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/status`,
      });
      assert.equal(statusResponse.statusCode, 404, statusResponse.body);
    } finally {
      __setWorkspaceStorageAdapterFactoryForTests(undefined);
    }
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

  it("passes the primary material image to real product-brief provider calls", async () => {
    const arkText = await startArkProductBriefServer();
    try {
      await withEnv(
        {
          MODEL_MODE: "real",
          TEXT_API_KEY: "test-key",
          TEXT_BASE_URL: arkText.url,
          TEXT_ENDPOINT_ID: "ark-product-brief",
          ARK_API_KEY: "test-key",
          ARK_BASE_URL: arkText.url,
          ARK_TEXT_ENDPOINT_ID: "ark-product-brief",
        },
        async () => {
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
              data: testPromptRequirementsData(),
            },
          });
          assert.equal(
            requirementsPropose.statusCode,
            200,
            requirementsPropose.body,
          );
          const requirementsApprove = await app.inject({
            method: "POST",
            url: `/api/workspaces/${workspaceId}/prompt-requirements/approve`,
            payload: { artifactId: requirementsPropose.json().data.id },
          });
          assert.equal(
            requirementsApprove.statusCode,
            200,
            requirementsApprove.body,
          );

          const materialApprove = await app.inject({
            method: "POST",
            url: `/api/workspaces/${workspaceId}/material-intake/approve`,
            payload: {
              data: {
                scannedAt: "2026-06-02T00:00:00.000Z",
                primaryProductRef: "product.png",
                assets: [
                  {
                    ref: "product.png",
                    kind: "image",
                    mime: "image/png",
                    bytes: transparentPngBytes.length,
                    sha256: sha256(transparentPngBytes),
                    role: "product_main",
                    description: "商品主图素材 product.png",
                    relevance: "high",
                    usable: true,
                    included: true,
                  },
                ],
                rejected: [],
              },
            },
          });
          assert.equal(materialApprove.statusCode, 200, materialApprove.body);

          const briefPropose = await app.inject({
            method: "POST",
            url: `/api/workspaces/${workspaceId}/product-brief/propose`,
            payload: {},
          });
          assert.equal(briefPropose.statusCode, 200, briefPropose.body);
        },
      );

      const request = arkText.requests[0] as {
        messages?: Array<{ content?: unknown }>;
      };
      const content = request.messages?.[0]?.content;
      assert.ok(Array.isArray(content), "expected multimodal chat content");
      assert.equal(content[0]?.type, "text");
      assert.equal(content[1]?.type, "image_url");
      assert.match(content[1]?.image_url?.url ?? "", /^data:image\/png;base64,/);
    } finally {
      await arkText.close();
    }
  });

  it("stores module-owned artifacts outside workspace_artifact", async () => {
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
        data: testPromptRequirementsData(),
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

  it("keeps prompt requirements proposed as a single recoverable draft slot", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    const first = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/prompt-requirements/propose`,
      payload: {
        data: testPromptRequirementsData({ strategy: "scenario-demo" }),
      },
    });
    assert.equal(first.statusCode, 200, first.body);

    const second = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/prompt-requirements/propose`,
      payload: {
        data: testPromptRequirementsData({ strategy: "emotional-story" }),
      },
    });
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().data.id, first.json().data.id);

    const proposedRows = await db.db2.pool().query(
      `select count(*)::integer as count
       from prompt_requirements_artifacts
       where workspace_id = $1 and status = 'proposed'`,
      [workspaceId],
    );
    assert.equal(proposedRows.rows[0]?.count, 1);

    const state = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/prompt-requirements`,
    });
    assert.equal(state.statusCode, 200, state.body);
    assert.equal(state.json().data.proposed.id, first.json().data.id);
    assert.equal(
      state.json().data.proposed.data.creativeFactors.strategy,
      "emotional-story",
    );

    const approve = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/prompt-requirements/approve`,
      payload: { artifactId: first.json().data.id },
    });
    assert.equal(approve.statusCode, 200, approve.body);

    const afterApprove = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/prompt-requirements`,
    });
    assert.equal(afterApprove.statusCode, 200, afterApprove.body);
    assert.equal(afterApprove.json().data.proposed, null);
    assert.equal(afterApprove.json().data.current.id, approve.json().data.id);
  });

  it("proposes a product brief rewrite from the current page draft without changing current", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    await approveMinimumWorkspaceInputs(app, workspaceId);

    const beforeStatusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`,
    });
    assert.equal(beforeStatusResponse.statusCode, 200, beforeStatusResponse.body);
    const beforeStatus = beforeStatusResponse.json();
    const currentBrief = beforeStatus.modules["product-brief"].current;
    const draft = {
      ...currentBrief.data,
      product: {
        ...currentBrief.data.product,
        name: "页面草稿商品名",
        keyFacts: ["页面草稿事实"],
      },
      coreSellingPoint: "页面草稿核心卖点",
      proof: ["页面草稿证明素材"],
      assumptions: ["页面草稿假设"],
    };

    const rewrite = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/product-brief/propose`,
      payload: {
        baseArtifactId: currentBrief.id,
        userDirection: "更突出送礼场景，语气更年轻",
        draft,
      },
    });

    assert.equal(rewrite.statusCode, 200, rewrite.body);
    const artifact = rewrite.json().data;
    assert.equal(artifact.status, "proposed");
    assert.equal(artifact.isCurrent, false);
    assert.equal(artifact.data.product.name, "页面草稿商品名");
    assert.equal(artifact.data.coreSellingPoint, "更突出送礼场景，语气更年轻");
    assert.equal(
      artifact.sourceFingerprint.baseProductBriefArtifactId,
      currentBrief.id,
    );
    assert.equal(artifact.sourceFingerprint.rewriteKind, "merchant_direction");
    assert.equal(artifact.promptAssembly.baseProductBriefArtifactId, currentBrief.id);
    assert.equal(artifact.promptAssembly.rewriteKind, "merchant_direction");

    const afterStatusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/status`,
    });
    assert.equal(afterStatusResponse.statusCode, 200, afterStatusResponse.body);
    const afterStatus = afterStatusResponse.json();
    assert.equal(afterStatus.modules["product-brief"].current.id, currentBrief.id);
    assert.equal(afterStatus.modules["product-brief"].proposed.id, artifact.id);
  });

  it("rejects product brief rewrites with invalid drafts", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    await approveMinimumWorkspaceInputs(app, workspaceId);

    const rewrite = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/product-brief/propose`,
      payload: {
        userDirection: "更突出送礼场景",
        draft: { product: { name: "缺少字段" } },
      },
    });

    assert.equal(rewrite.statusCode, 400, rewrite.body);
  });

  it("requires approved requirements and material intake before product brief propose", async () => {
    const { workspaceId } = await createBoundWorkspace(app);

    const rewrite = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/product-brief/propose`,
      payload: {
        userDirection: "更突出送礼场景",
      },
    });

    assert.equal(rewrite.statusCode, 400, rewrite.body);
    assert.equal(rewrite.json().code, "NO_CURRENT_APPROVED_ARTIFACT");
  });

  it("rejects storyboard approval when voiceover exceeds its timing budget", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    await approveMinimumWorkspaceInputs(app, workspaceId);

    const storyboardApprove = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/storyboard/approve`,
      payload: {
        data: {
          narrative: "开场钩子到卖点证明再到行动号召。",
          totalDurationSec: 15,
          shots: [
            {
              index: 0,
              purpose: "hook",
              durationSec: 4,
              scene: "换季干燥痛点开场",
              visualDirection: "真实脸部状态",
              productAssetRef: "product.png",
              voiceover: "换季脸干到起皮紧绷卡粉还不舒服想马上修护了吗",
              transition: "cut",
            },
            {
              index: 1,
              purpose: "proof",
              durationSec: 7,
              scene: "展示山茶花籽油卖点和使用证明",
              visualDirection: "产品和使用场景结合",
              productAssetRef: "product.png",
              voiceover: "山茶花籽油亲肤好吸收",
              transition: "cut",
            },
            {
              index: 2,
              purpose: "cta",
              durationSec: 4,
              scene: "收束到购买利益点",
              visualDirection: "产品和利益点同屏",
              productAssetRef: "product.png",
              voiceover: "现在下单立减",
              transition: "fade",
            },
          ],
          assumptions: [],
        },
      },
    });

    assert.equal(storyboardApprove.statusCode, 400, storyboardApprove.body);
    assert.equal(storyboardApprove.json().code, "INVALID_STORYBOARD_SCRIPT");
    assert.match(storyboardApprove.json().message, /口播过长/);
  });

  it("proposes a new storyboard artifact when rewriting voiceover copy", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    await approveMinimumWorkspaceInputs(app, workspaceId);

    const baseStoryboard = {
      narrative: "开场钩子到卖点证明再到行动号召。",
      totalDurationSec: 15,
      shots: [
        {
          index: 0,
          purpose: "hook",
          durationSec: 4,
          scene: "换季干燥痛点开场",
          visualDirection: "真实脸部状态",
          productAssetRef: "product.png",
          voiceover: "旧开场口播",
          transition: "cut",
        },
        {
          index: 1,
          purpose: "proof",
          durationSec: 7,
          scene: "展示山茶花籽油卖点和使用证明",
          visualDirection: "产品和使用场景结合",
          productAssetRef: "product.png",
          voiceover: "旧卖点口播",
          transition: "cut",
        },
        {
          index: 2,
          purpose: "cta",
          durationSec: 4,
          scene: "收束到购买利益点",
          visualDirection: "产品和利益点同屏",
          productAssetRef: "product.png",
          voiceover: "旧行动口播",
          transition: "fade",
        },
      ],
      assumptions: [],
    };
    const baseApprove = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/storyboard/approve`,
      payload: { data: baseStoryboard },
    });
    assert.equal(baseApprove.statusCode, 200, baseApprove.body);

    const rewrite = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/storyboard/voiceover/propose`,
      payload: {
        baseArtifactId: baseApprove.json().data.id,
        draft: baseStoryboard,
        userDirection: "更像真实商家口播",
      },
    });

    assert.equal(rewrite.statusCode, 200, rewrite.body);
    const artifact = rewrite.json().data;
    assert.equal(artifact.status, "proposed");
    assert.equal(artifact.isCurrent, false);
    assert.equal(
      artifact.sourceFingerprint.baseStoryboardArtifactId,
      baseApprove.json().data.id,
    );
    assert.equal(artifact.sourceFingerprint.rewriteKind, "voiceover");
    assert.equal(artifact.data.totalDurationSec, 15);
    assert.deepEqual(
      artifact.data.shots.map((shot: { index: number }) => shot.index),
      [0, 1, 2],
    );
    assert.notDeepEqual(
      artifact.data.shots.map((shot: { voiceover: string }) => shot.voiceover),
      baseStoryboard.shots.map((shot) => shot.voiceover),
    );

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/storyboard`,
    });
    assert.equal(statusResponse.statusCode, 200, statusResponse.body);
    assert.equal(statusResponse.json().data.current.id, baseApprove.json().data.id);
    assert.equal(statusResponse.json().data.proposed.id, artifact.id);
  });

  it("rejects shotprompt proposal when the current storyboard is a legacy non-P0 script", async () => {
    const { workspaceId } = await createBoundWorkspace(app);
    await approveMinimumWorkspaceInputs(app, workspaceId);
    const legacyStoryboard = {
      narrative: "旧版四镜结构：钩子、卖点、证明、行动号召。",
      totalDurationSec: 14,
      shots: [
        {
          index: 0,
          purpose: "hook",
          durationSec: 3,
          scene: "换季干燥痛点开场",
          visualDirection: "真实脸部状态",
          productAssetRef: "product.png",
          voiceover: "换季脸干",
          transition: "cut",
        },
        {
          index: 1,
          purpose: "benefit",
          durationSec: 4,
          scene: "介绍山茶花籽油卖点",
          visualDirection: "产品和油体质感",
          productAssetRef: "product.png",
          voiceover: "山茶花籽油亲肤",
          transition: "cut",
        },
        {
          index: 2,
          purpose: "proof",
          durationSec: 4,
          scene: "展示使用证明",
          visualDirection: "使用前后状态",
          productAssetRef: "product.png",
          voiceover: "干燥状态被缓解",
          transition: "cut",
        },
        {
          index: 3,
          purpose: "cta",
          durationSec: 3,
          scene: "收束到购买利益点",
          visualDirection: "产品和利益点同屏",
          productAssetRef: "product.png",
          voiceover: "现在下单立减",
          transition: "fade",
        },
      ],
      assumptions: [],
    };
    await db.db2.pool().query(
      `insert into storyboard_artifacts
         (id, workspace_id, status, is_current, data, source_fingerprint, prompt_assembly, approved_at)
       values ($1, $2, 'approved', true, $3::jsonb, '{}'::jsonb, '{}'::jsonb, now())`,
      [`legacy-storyboard-${Date.now()}`, workspaceId, JSON.stringify(legacyStoryboard)],
    );
    await db.updateWorkspace(workspaceId, { status: "storyboard_approved" });

    const shotPromptResponse = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/shotprompt/propose`,
      payload: {},
    });

    assert.equal(shotPromptResponse.statusCode, 400, shotPromptResponse.body);
    assert.equal(shotPromptResponse.json().code, "UPSTREAM_STORYBOARD_NOT_P0");
    assert.match(shotPromptResponse.json().message, /先批准三镜分镜脚本/);
  });
});
