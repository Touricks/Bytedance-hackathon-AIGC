import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";
import { transparentPngBase64 } from "../../test/image-fixtures.js";

describe("material API", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
  });

  it("rejects fake uploaded product image bytes before they become 上传素材", async () => {
    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/materials/product-image",
      payload: {
        filename: "fake-product.png",
        contentType: "image/png",
        dataBase64: Buffer.from("fake image bytes").toString("base64")
      }
    });

    try {
      assert.equal(uploadResponse.statusCode, 400);
      assert.match(uploadResponse.body, /valid image/i);
    } finally {
      const body = uploadResponse.json<{
        metadata?: { storagePath?: string };
      }>();
      if (body.metadata?.storagePath) {
        await rm(body.metadata.storagePath, { force: true });
      }
    }
  });

  it("accepts uploaded product image bytes and returns an asset URL usable by creative blueprint generation", async () => {
    const uploadResponse = await app.inject({
      method: "POST",
      url: "/api/materials/product-image",
      payload: {
        filename: "mini-blender.png",
        contentType: "image/png",
        dataBase64: transparentPngBase64
      }
    });

    assert.equal(uploadResponse.statusCode, 200);

    const asset = uploadResponse.json();
    assert.equal(asset.type, "product_image");
    assert.equal(asset.source, "upload");
    assert.match(asset.url, /^\/uploads\/product-images\//);
    assert.equal(asset.metadata.originalFilename, "mini-blender.png");
    assert.equal(asset.metadata.contentType, "image/png");

    const blueprintResponse = await app.inject({
      method: "POST",
      url: "/api/creative-blueprints",
      payload: {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging and easy cleaning",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
        imageUrl: asset.url
      }
    });

    assert.equal(blueprintResponse.statusCode, 200);
    const blueprint = blueprintResponse.json();
    assert.equal(blueprint.imageAsset.url, asset.url);
    assert.equal(blueprint.imageAsset.source, "upload");
  });
});
