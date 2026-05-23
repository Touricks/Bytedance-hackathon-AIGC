import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { transparentPngBytes } from "../../test/image-fixtures.js";

interface JobDetail {
  job: {
    id: string;
    status: string;
    stage: string;
    errorMessage?: string;
  };
  finalAsset?: {
    type: string;
  };
}

async function uploadProductImage(
  app: FastifyInstance,
  input: {
    filename?: string;
    contentType?: string;
    bytes?: Buffer;
  } = {}
) {
  const bytes = input.bytes ?? transparentPngBytes;
  const response = await app.inject({
    method: "POST",
    url: "/api/materials/product-image",
    payload: {
      filename: input.filename ?? "product.png",
      contentType: input.contentType ?? "image/png",
      dataBase64: bytes.toString("base64")
    }
  });

  assert.equal(response.statusCode, 200);
  return response.json();
}

async function createBlueprint(app: FastifyInstance, imageUrl?: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/creative-blueprints",
    payload: {
      title: "Portable Mini Blender",
      sellingPoints: "USB-C charging",
      audience: "busy office workers",
      stylePreference: "clean premium ecommerce",
      imageUrl: imageUrl ?? "/mocks/products/demo-product.svg"
    }
  });

  assert.equal(response.statusCode, 200);
  return response.json();
}

async function startHoldingArkVideoServer() {
  let releaseResponse: () => void = () => {};
  const responseReleased = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let markRequestStarted: () => void = () => {};
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });

  const bodies: unknown[] = [];
  const server: Server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
    }
    bodies.push(body ? JSON.parse(body) : {});
    markRequestStarted();
    await responseReleased;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ videoUrl: "/mocks/videos/fallback-flower.mp4" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert(address && typeof address === "object");

  return {
    url: `http://127.0.0.1:${address.port}`,
    bodies,
    requestStarted,
    releaseResponse,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function waitForJob(
  app: FastifyInstance,
  jobId: string,
  predicate: (detail: JobDetail) => boolean
) {
  let detail: JobDetail | undefined;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/jobs/${jobId}`
    });
    detail = detailResponse.json() as JobDetail;
    if (predicate(detail)) {
      return detail;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.fail(`Timed out waiting for job ${jobId}`);
}

function setArkVideoEnv(url: string) {
  const previousArkBaseUrl = process.env.ARK_BASE_URL;
  const previousArkKey = process.env.ARK_API_KEY;
  const previousArkVideoEndpoint = process.env.ARK_VIDEO_ENDPOINT_ID;
  process.env.ARK_BASE_URL = url;
  process.env.ARK_API_KEY = "test-key";
  process.env.ARK_VIDEO_ENDPOINT_ID = "ark-video-endpoint";

  return () => {
    if (previousArkBaseUrl === undefined) {
      delete process.env.ARK_BASE_URL;
    } else {
      process.env.ARK_BASE_URL = previousArkBaseUrl;
    }
    if (previousArkKey === undefined) {
      delete process.env.ARK_API_KEY;
    } else {
      process.env.ARK_API_KEY = previousArkKey;
    }
    if (previousArkVideoEndpoint === undefined) {
      delete process.env.ARK_VIDEO_ENDPOINT_ID;
    } else {
      process.env.ARK_VIDEO_ENDPOINT_ID = previousArkVideoEndpoint;
    }
  };
}

describe("creation API", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
  });

  it("creates a video generation job from a persisted scriptId", async () => {
    const blueprint = await createBlueprint(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/creation/jobs",
      payload: { scriptId: blueprint.scriptId }
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.job.scriptId, blueprint.scriptId);
    assert.equal(body.job.productId, blueprint.product.id);
    assert.equal(body.job.status, "queued");
    assert.equal(body.job.stage, "queued");
    assert.equal(body.script.narrative, blueprint.script.narrative);
    assert.equal(body.shots.length, 3);
  });

  it("hydrates completed job detail with script, shots, and final video asset", async () => {
    const blueprint = await createBlueprint(app);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/creation/jobs",
      payload: { scriptId: blueprint.scriptId }
    });
    const created = createResponse.json();

    let detail = created;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const detailResponse = await app.inject({
        method: "GET",
        url: `/api/jobs/${created.job.id}`
      });
      detail = detailResponse.json();
      if (detail.job.status === "completed") {
        break;
      }
    }

    assert.equal(detail.job.status, "completed");
    assert.equal(detail.job.stage, "completed");
    assert.equal(detail.script.id, blueprint.scriptId);
    assert.equal(detail.shots.length, 3);
    assert.equal(detail.finalAsset.type, "final_video");
  });

  it("reports a running status while media generation is in progress", async () => {
    const arkVideo = await startHoldingArkVideoServer();
    const restoreEnv = setArkVideoEnv(arkVideo.url);

    try {
      const imageAsset = await uploadProductImage(app);
      const blueprint = await createBlueprint(app, imageAsset.url);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/creation/jobs",
        payload: { scriptId: blueprint.scriptId }
      });
      const created = createResponse.json();

      await arkVideo.requestStarted;

      let detail = created;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const detailResponse = await app.inject({
          method: "GET",
          url: `/api/jobs/${created.job.id}`
        });
        detail = detailResponse.json();
        if (detail.job.stage === "media_generating") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      assert.equal(detail.job.stage, "media_generating");
      assert.equal(detail.job.status, "running");
    } finally {
      arkVideo.releaseResponse();
      await arkVideo.close();
      restoreEnv();
    }
  });

  it("sends uploaded raster product images to Ark video as base64 data URLs", async () => {
    const arkVideo = await startHoldingArkVideoServer();
    const restoreEnv = setArkVideoEnv(arkVideo.url);

    try {
      const imageAsset = await uploadProductImage(app, {
        bytes: transparentPngBytes
      });
      const blueprint = await createBlueprint(app, imageAsset.url);
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/creation/jobs",
        payload: { scriptId: blueprint.scriptId }
      });
      const created = createResponse.json();

      await arkVideo.requestStarted;
      const imageUrl = getArkImageUrl(arkVideo.bodies[0]);
      assert.match(imageUrl ?? "", /^data:image\/png;base64,/);
      assert.doesNotMatch(imageUrl ?? "", /\/uploads\/product-images\//);

      arkVideo.releaseResponse();
      const detail = await waitForJob(
        app,
        created.job.id,
        (jobDetail) => jobDetail.job.status === "completed"
      );

      assert(detail.finalAsset);
      assert.equal(detail.finalAsset.type, "final_video");
    } finally {
      arkVideo.releaseResponse();
      await arkVideo.close();
      restoreEnv();
    }
  });

  it("rejects unsupported SVG uploads before they become 上传素材", async () => {
    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/materials/product-image",
      payload: {
        filename: "product.svg",
        contentType: "image/svg+xml",
        dataBase64: Buffer.from("<svg></svg>").toString("base64")
      }
    });

    assert.equal(uploadResponse.statusCode, 400);
    assert.match(uploadResponse.body, /Unsupported product image content type/);
  });
});

function getArkImageUrl(body: unknown) {
  const content = (body as { content: Array<{ image_url?: { url: string } }> })
    .content;
  return content.find((item) => item.image_url)?.image_url?.url;
}
