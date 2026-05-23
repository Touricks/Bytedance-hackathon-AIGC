import assert from "node:assert/strict";
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
});
