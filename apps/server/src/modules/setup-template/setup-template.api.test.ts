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
    assert.equal(body.data.templates.length, 5);
    assert.deepEqual(
      body.data.templates.map((template: { id: string }) => template.id),
      [
        "consumer-electronics-search-youth-review",
        "beauty-seeding-youth-scenario",
        "food-impulse-general-curiosity",
        "mom-baby-repeat-toddler-pain",
        "jewelry-premium-general-emotional",
      ],
    );

    const [template] = body.data.templates;
    assert.equal(template.name, "3C数码·搜索标品");
    assert.equal(typeof template.summary, "string");
    assert.equal(template.creativeFactors.productCategory, "consumer-electronics");
    assert.equal(template.creativeFactors.dealType, "search-standard");
    assert.equal(template.creativeFactors.audience, "youth");
    assert.equal(template.creativeFactors.strategy, "review-comparison");
    assert.equal("productType" in template, false);
    assert.equal("fields" in template, false);
    assert.equal("values" in template, false);
  });
});
