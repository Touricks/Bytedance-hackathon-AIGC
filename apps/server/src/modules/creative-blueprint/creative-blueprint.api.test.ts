import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";

describe("creative blueprint API", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
  });

  it("persists a creative blueprint synchronously and returns a stable scriptId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/creative-blueprints",
      payload: {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging, easy cleaning, powerful smoothie blending",
        audience: "busy office workers and fitness beginners",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/mocks/products/demo-product.svg"
      }
    });

    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(typeof body.scriptId, "string");
    assert.equal(body.product.title, "Portable Mini Blender");
    assert.equal(body.imageAsset.type, "product_image");
    assert.equal(body.creativeBlueprint.targetAudience, "busy office workers and fitness beginners");
    assert.ok(body.creativeBlueprint.narrative.includes("Portable Mini Blender"));
    assert.equal(body.shots.length, 3);
    assert.equal(body.shots[0].scriptId, body.scriptId);
    assert.equal(body.job, undefined);
  });

  it("hydrates a persisted creative blueprint by scriptId", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/creative-blueprints",
      payload: {
        title: "Travel Skincare Kit",
        sellingPoints: "leakproof bottles, compact pouch, TSA friendly",
        audience: "frequent travelers",
        stylePreference: "bright clean travel lifestyle",
        imageUrl: "/mocks/products/demo-product.svg"
      }
    });

    const created = createResponse.json();
    const getResponse = await app.inject({
      method: "GET",
      url: `/api/creative-blueprints/${created.scriptId}`
    });

    assert.equal(getResponse.statusCode, 200);

    const body = getResponse.json();
    assert.equal(body.scriptId, created.scriptId);
    assert.equal(body.product.title, "Travel Skincare Kit");
    assert.equal(body.imageAsset.url, "/mocks/products/demo-product.svg");
    assert.equal(body.creativeBlueprint.coreSellingPoint, "leakproof bottles, compact pouch, TSA friendly");
    assert.equal(body.shots.length, 3);
  });

  it("overwrites an unfrozen draft when regenerating with draftScriptId", async () => {
    const firstResponse = await app.inject({
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
    const first = firstResponse.json();

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/creative-blueprints",
      payload: {
        draftScriptId: first.scriptId,
        title: "Portable Mini Blender Pro",
        sellingPoints: "quiet motor and dishwasher-safe cup",
        audience: "fitness beginners",
        stylePreference: "bright studio demo",
        imageUrl: "/mocks/products/demo-product.svg"
      }
    });

    assert.equal(secondResponse.statusCode, 200);

    const second = secondResponse.json();
    assert.equal(second.scriptId, first.scriptId);
    assert.equal(second.script.version, 1);
    assert.equal(second.product.title, "Portable Mini Blender Pro");
    assert.ok(second.creativeBlueprint.narrative.includes("Portable Mini Blender Pro"));
    assert.equal(second.shots[1].subtitle, "quiet motor and dishwasher-safe cup");
  });
});
