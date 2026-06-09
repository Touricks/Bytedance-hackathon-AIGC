import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCreativeRequirementTemplatesForStartup } from "./setup-template.service.js";

describe("setupTemplateService", () => {
  it("validates setup templates at startup", () => {
    const templates = validateCreativeRequirementTemplatesForStartup();

    assert.equal(templates.length, 5);
    assert.equal(templates[0]?.id, "consumer-electronics-search-youth-review");
    assert.equal(templates[0]?.creativeFactors.productCategory, "consumer-electronics");
    assert.equal(templates[0]?.creativeFactors.dealType, "search-standard");
    assert.equal(templates[0]?.creativeFactors.audience, "youth");
    assert.equal(templates[0]?.creativeFactors.strategy, "review-comparison");
  });

  it("fails fast when setup template content is invalid", () => {
    assert.throws(
      () =>
        validateCreativeRequirementTemplatesForStartup([
          {
            id: "broken",
            name: "Broken",
            summary: "Missing values",
            version: "factor-preset.test",
          },
        ]),
      /Required/,
    );
  });
});
