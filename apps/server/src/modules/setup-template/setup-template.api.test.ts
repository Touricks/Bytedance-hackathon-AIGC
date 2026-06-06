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
    assert.equal(body.data.templates.length, 9);
    assert.deepEqual(
      body.data.templates.map((template: { id: string }) => template.id),
      [
        "consumable-youth-seeding",
        "durable-youth-showcase",
        "virtual-youth-conversion",
        "consumable-senior-health",
        "durable-child-parent",
        "consumable-toddler-mombaby",
        "offline-child-travel",
        "offline-youth-restaurant",
        "offline-youth-photography",
      ],
    );

    const [template] = body.data.templates;
    assert.equal(template.name, "快消种草·青年");
    assert.equal(typeof template.summary, "string");
    assert.equal(template.productType, "consumable-good");
    assert.deepEqual(template.audiences, ["youth"]);
    assert.equal(template.strategy, "pain-solution");
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
