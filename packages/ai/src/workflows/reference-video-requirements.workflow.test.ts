import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeReferenceVideoRequirements } from "./reference-video-requirements.workflow.js";

describe("analyzeReferenceVideoRequirements", () => {
  it("uses Responses API JSON schema format when analyzing a reference video", async () => {
    const calls: unknown[] = [];

    const result = await analyzeReferenceVideoRequirements(
      {
        filename: "restaurant-reference.mp4",
        contentType: "video/mp4",
        sizeBytes: 32,
        videoUrl: "data:video/mp4;base64,cmVmZXJlbmNl"
      },
      {
        env: {
          MODEL_MODE: "real",
          TEXT_API_KEY: "test-key",
          TEXT_BASE_URL: "http://127.0.0.1:9/api/v3",
          TEXT_ENDPOINT_ID: "doubao-seed-endpoint"
        },
        createClient: () => ({
          responses: {
            create: async (request) => {
              calls.push(request);
              return {
                status: "completed",
                output_text: JSON.stringify({
                  analysis: {
                    summary: "参考视频体现线下餐饮体验的场景证明结构。",
                    confidence: "high",
                    detectedBeats: ["到店", "出品", "服务", "预约"],
                    risks: []
                  },
                  creativeFactorsRecommendation: {
                    recommendedFactors: {
                      productType: "offline-experience-service",
                      audience: "youth",
                      strategy: "review-comparison"
                    },
                    confidence: "high",
                    reasons: ["视频重点在真实到店体验和可验证判断。"]
                  }
                }),
                output: []
              };
            }
          }
        })
      }
    );

    assert.deepEqual(result.creativeFactorsRecommendation.recommendedFactors, {
      productType: "offline-experience-service",
      audience: "youth",
      strategy: "review-comparison",
      visualStyle: "authentic"
    });
    assert.deepEqual(
      (calls[0] as { text: { format: { type: string; name: string } } }).text.format,
      {
        type: "json_schema",
        name: "reference_video_requirements_v1",
        description: "从参考视频分析结构并推荐全局创作因子。",
        strict: true,
        schema: (calls[0] as { text: { format: { schema: unknown } } }).text.format.schema
      }
    );
    assert.equal("draft" in result, false);
  });
});
