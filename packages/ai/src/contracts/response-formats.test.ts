import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReferenceVideoRequirementsResponseFormat } from "./response-formats.js";

describe("buildReferenceVideoRequirementsResponseFormat", () => {
  it("constrains reference video analysis to creative factor enums", () => {
    const format = buildReferenceVideoRequirementsResponseFormat(
      "reference-video-requirements"
    );

    const schema = format.schema as {
      required: string[];
      properties: {
        draft?: unknown;
        creativeFactorsRecommendation: {
          properties: {
            recommendedFactors: {
              properties: Record<string, { enum: string[] }>;
            };
          };
        };
      };
    };
    const factorProperties =
      schema.properties.creativeFactorsRecommendation.properties.recommendedFactors
        .properties;
    assert.ok(factorProperties.productCategory);
    assert.ok(factorProperties.dealType);
    assert.ok(factorProperties.audience);
    assert.ok(factorProperties.strategy);
    assert.equal("productType" in factorProperties, false);

    assert.deepEqual(format, {
      type: "json_schema",
      name: "reference_video_requirements",
      description: "从参考视频分析结构并推荐全局创作因子。",
      schemaVersion: "reference-video-requirements",
      strict: true,
      schema: {
        ...format.schema,
        additionalProperties: false
      }
    });
    assert.equal(schema.properties.draft, undefined);
    assert.equal(schema.required.includes("draft"), false);
    assert.deepEqual(factorProperties.productCategory.enum, [
      "beauty-personal-care",
      "fashion-accessories",
      "food-beverage",
      "home-living",
      "consumer-electronics",
      "mom-baby-pet",
      "sports-outdoors",
      "jewelry-collectibles",
      "books-education",
      "automotive"
    ]);
    assert.deepEqual(factorProperties.dealType.enum, [
      "search-standard",
      "seeding-nonstandard",
      "impulse-hit",
      "repeat-consumable",
      "premium-brand"
    ]);
    assert.deepEqual(factorProperties.audience.enum, [
      "general",
      "toddler",
      "child",
      "youth",
      "senior"
    ]);
    assert.deepEqual(factorProperties.strategy.enum, [
      "pain-solution",
      "scenario-demo",
      "review-comparison",
      "tutorial-value",
      "authority-proof",
      "emotional-story",
      "curiosity-hook",
      "visual-story"
    ]);
  });
});
