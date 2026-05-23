import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";

async function createBlueprint(app: FastifyInstance) {
  const response = await app.inject({
    method: "POST",
    url: "/api/creative-blueprints",
    payload: {
      title: "Portable Mini Blender",
      sellingPoints: "USB-C charging",
      audience: "busy office workers",
      stylePreference: "clean premium ecommerce",
      imageUrl: "/mocks/products/demo-product.svg"
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

  const server: Server = createServer(async (_request, response) => {
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
    requestStarted,
    releaseResponse,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
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
    const previousArkBaseUrl = process.env.ARK_BASE_URL;
    const previousArkKey = process.env.ARK_API_KEY;
    const previousArkVideoEndpoint = process.env.ARK_VIDEO_ENDPOINT_ID;
    process.env.ARK_BASE_URL = arkVideo.url;
    process.env.ARK_API_KEY = "test-key";
    process.env.ARK_VIDEO_ENDPOINT_ID = "ark-video-endpoint";

    try {
      const blueprint = await createBlueprint(app);
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
    }
  });
});
