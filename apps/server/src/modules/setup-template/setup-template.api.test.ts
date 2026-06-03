import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../app.js";

describe("setup template API", () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
  });

  after(async () => {
    await app.close();
  });

  it("returns validated creative requirement templates", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/setup-templates/creative-requirements",
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.data.templates.length, 3);
    assert.deepEqual(
      body.data.templates.map((template: { id: string }) => template.id),
      ["real-product-demo", "ugc-seeding", "premium-showcase"],
    );

    const [template] = body.data.templates;
    assert.equal(template.name, "真实商品讲解");
    assert.equal(typeof template.summary, "string");
    assert.deepEqual(Object.keys(template.values).sort(), [
      "imageAvoid",
      "imageComposition",
      "imageStyle",
      "scriptTone",
      "shotImageGlobal",
      "shotVideoGlobal",
      "storyboardRhythm",
    ]);
  });
});
