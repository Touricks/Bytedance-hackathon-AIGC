import assert from "node:assert/strict";
import { before, after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildCreativeFactorRequirements } from "@aigc-video/shared";
import { buildServer } from "../../app.js";
import { db } from "../../db/client.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";

function multipartFilePayload(input: {
  fieldName: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}) {
  return multipartFilesPayload([input]);
}

function multipartFilesPayload(
  files: Array<{
    fieldName: string;
    filename: string;
    contentType: string;
    bytes: Buffer;
  }>
) {
  const boundary = `----reference-video-test-${Date.now()}`;
  const segments: Buffer[] = [];
  for (const file of files) {
    segments.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`
      ),
      file.bytes,
      Buffer.from("\r\n")
    );
  }
  segments.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`
    },
    payload: Buffer.concat(segments)
  };
}

async function createWorkspace(app: FastifyInstance) {
  const response = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `reference-video-${Date.now()}` }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().workspace as { id: string };
}

async function artifactCount(workspaceId: string) {
  const result = await db.db2.pool().query(
    `select count(*)::integer as count
     from prompt_requirements_artifacts
     where workspace_id = $1`,
    [workspaceId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function assetCount(workspaceId: string) {
  const result = await db.db2.pool().query(
    `select count(*)::integer as count
     from asset
     where metadata->>'workspaceId' = $1`,
    [workspaceId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function approveRequirements(app: FastifyInstance, workspaceId: string) {
  const propose = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/prompt-requirements/propose`,
    payload: {
      data: buildCreativeFactorRequirements()
    }
  });
  assert.equal(propose.statusCode, 200, propose.body);
  const approve = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/prompt-requirements/approve`,
    payload: { artifactId: propose.json().data.id }
  });
  assert.equal(approve.statusCode, 200, approve.body);
}

describe("reference video requirements import API", () => {
  let app: FastifyInstance;
  const originalFetch = globalThis.fetch;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await app.close();
  });

  it("creates a proposed creative requirements artifact from an uploaded reference video without creating material assets", async () => {
    const workspace = await createWorkspace(app);
    const multipart = multipartFilePayload({
      fieldName: "file",
      filename: "reference.mp4",
      contentType: "video/mp4",
      bytes: Buffer.from("fake mp4 bytes")
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/reference-video/import`,
      headers: multipart.headers,
      payload: multipart.payload
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.data.source.type, "file");
    assert.equal(body.data.source.filename, "reference.mp4");
    assert.equal(body.data.source.contentType, "video/mp4");
    assert.equal(typeof body.data.analysis.summary, "string");
    assert.ok(body.data.analysis.summary.length > 0);
    assert.equal(body.data.analysis.confidence, "medium");
    assert.equal("draft" in body.data, false);
    assert.equal(body.data.artifact.moduleId, "prompt-requirements");
    assert.equal(body.data.artifact.status, "proposed");
    assert.equal(body.data.artifact.isCurrent, false);
    assert.deepEqual(body.data.artifact.data.creativeFactors, {
      productCategory: "consumer-electronics",
      dealType: "search-standard",
      audience: "general",
      strategy: "review-comparison"
    });
    assert.equal(
      body.data.artifact.data.factorGuidance.productCategory.requiredVisualElements[0],
      "设备本体"
    );
    assert.match(body.data.artifact.data.compiledRequirementsHash, /^fnv1a:/);
    assert.deepEqual(
      body.data.creativeFactorsRecommendation.recommendedFactors,
      {
        productCategory: body.data.artifact.data.creativeFactors.productCategory,
        dealType: body.data.artifact.data.creativeFactors.dealType,
        audience: body.data.artifact.data.creativeFactors.audience,
        strategy: body.data.artifact.data.creativeFactors.strategy,
      }
    );
    assert.equal(await artifactCount(workspace.id), 1);
    assert.equal(await assetCount(workspace.id), 0);

    const state = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspace.id}/prompt-requirements`
    });
    assert.equal(state.statusCode, 200, state.body);
    assert.equal(state.json().data.proposed.id, body.data.artifact.id);
  });

  it("recommends creative factors from uploaded images and text files without storing materials", async () => {
    const workspace = await createWorkspace(app);
    const multipart = multipartFilesPayload([
      {
        fieldName: "file",
        filename: "product.png",
        contentType: "image/png",
        bytes: transparentPngBytes
      },
      {
        fieldName: "file",
        filename: "卖点.md",
        contentType: "text/markdown",
        bytes: Buffer.from("核心卖点：长续航与快充，主打通勤人群。")
      }
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/reference-video/import`,
      headers: multipart.headers,
      payload: multipart.payload
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.data.source.type, "files");
    assert.equal(body.data.source.count, 2);
    assert.ok(body.data.source.filenames.includes("product.png"));
    assert.ok(body.data.source.filenames.includes("卖点.md"));
    assert.equal("draft" in body.data, false);
    assert.equal(body.data.artifact.moduleId, "prompt-requirements");
    assert.equal(body.data.artifact.status, "proposed");
    assert.equal(body.data.artifact.isCurrent, false);
    assert.ok(
      Array.isArray(
        body.data.creativeFactorsRecommendation.recommendedFactors
          ? [body.data.creativeFactorsRecommendation.recommendedFactors]
          : null
      )
    );
    assert.equal(await artifactCount(workspace.id), 1);
    assert.equal(await assetCount(workspace.id), 0);
  });

  it("rejects an unsupported reference file type", async () => {
    const workspace = await createWorkspace(app);
    const multipart = multipartFilesPayload([
      {
        fieldName: "file",
        filename: "spec.pdf",
        contentType: "application/pdf",
        bytes: Buffer.from("%PDF-1.4 fake")
      }
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/reference-video/import`,
      headers: multipart.headers,
      payload: multipart.payload
    });

    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, "UNSUPPORTED_REFERENCE_FILE_TYPE");
    assert.equal(await artifactCount(workspace.id), 0);
  });

  it("rejects reference video import after prompt requirements are approved", async () => {
    const workspace = await createWorkspace(app);
    await approveRequirements(app, workspace.id);
    const multipart = multipartFilePayload({
      fieldName: "file",
      filename: "reference.mp4",
      contentType: "video/mp4",
      bytes: Buffer.from("fake mp4 bytes")
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/reference-video/import`,
      headers: multipart.headers,
      payload: multipart.payload
    });

    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, "REQUIREMENTS_ALREADY_APPROVED");
  });

  it("downloads a directly accessible video URL and creates a proposed requirements artifact", async () => {
    const workspace = await createWorkspace(app);
    globalThis.fetch = (async () =>
      new Response(Buffer.from("remote mp4 bytes"), {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "16"
        }
      })) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/reference-video/import`,
      payload: {
        source: {
          type: "url",
          url: "https://cdn.example.com/reference.mp4"
        }
      }
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.data.source.type, "url");
    assert.equal(body.data.source.url, "https://cdn.example.com/reference.mp4");
    assert.equal(body.data.source.downloaded, true);
    assert.equal(body.data.source.contentType, "video/mp4");
    assert.equal(body.data.source.sizeBytes, 16);
    assert.equal("draft" in body.data, false);
    assert.ok(Array.isArray(body.data.artifact.data.script.tone));
    assert.equal(body.data.artifact.moduleId, "prompt-requirements");
    assert.equal(body.data.artifact.status, "proposed");
    assert.equal(await artifactCount(workspace.id), 1);
    assert.equal(await assetCount(workspace.id), 0);
  });

  it("rejects a URL that resolves to an HTML page instead of a direct video download", async () => {
    const workspace = await createWorkspace(app);
    globalThis.fetch = (async () =>
      new Response("<html>platform page</html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
          "content-length": "26"
        }
      })) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/reference-video/import`,
      payload: {
        source: {
          type: "url",
          url: "https://example.com/watch/123"
        }
      }
    });

    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, "REFERENCE_VIDEO_NOT_DIRECT_DOWNLOAD");
  });

  it("rejects private or localhost reference video URLs before fetching", async () => {
    const workspace = await createWorkspace(app);
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(Buffer.from("remote mp4 bytes"), {
        status: 200,
        headers: { "content-type": "video/mp4" }
      });
    }) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/reference-video/import`,
      payload: {
        source: {
          type: "url",
          url: "http://127.0.0.1/private.mp4"
        }
      }
    });

    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, "INVALID_REFERENCE_VIDEO_URL");
    assert.equal(fetchCalled, false);
  });
});
