import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReferenceVideoRequirementsResponseFormat } from "./response-formats.js";

describe("buildReferenceVideoRequirementsResponseFormat", () => {
  it("constrains reference video analysis to creative factor enums", () => {
    const format = buildReferenceVideoRequirementsResponseFormat(
      "reference-video-requirements.v1"
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
    assert.ok(factorProperties.productType);
    assert.ok(factorProperties.audience);
    assert.ok(factorProperties.strategy);

    assert.deepEqual(format, {
      type: "json_schema",
      name: "reference_video_requirements_v1",
      description: "从参考视频分析结构并推荐全局创作因子。",
      schemaVersion: "reference-video-requirements.v1",
      strict: true,
      schema: {
        ...format.schema,
        additionalProperties: false
      }
    });
    assert.equal(schema.properties.draft, undefined);
    assert.equal(schema.required.includes("draft"), false);
    assert.deepEqual(factorProperties.productType.enum, [
      "consumable-good",
      "durable-good",
      "digital-service",
      "offline-experience-service"
    ]);
    assert.deepEqual(factorProperties.audience.enum, [
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
      "curiosity-hook"
    ]);
  });
});
