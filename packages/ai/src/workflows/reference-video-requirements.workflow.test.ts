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
                      productCategory: "food-beverage",
                      dealType: "seeding-nonstandard",
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
      productCategory: "food-beverage",
      dealType: "seeding-nonstandard",
      audience: "youth",
      strategy: "review-comparison"
    });
    assert.deepEqual(
      (calls[0] as { text: { format: { type: string; name: string } } }).text.format,
      {
        type: "json_schema",
        name: "reference_video_requirements",
        description: "从参考视频分析结构并推荐全局创作因子。",
        strict: true,
        schema: (calls[0] as { text: { format: { schema: unknown } } }).text.format.schema
      }
    );
    assert.equal("draft" in result, false);
  });

  it("recommends creative factors from material images when no video is provided", async () => {
    const calls: unknown[] = [];

    const result = await analyzeReferenceVideoRequirements(
      {
        contentType: "image/png",
        sizeBytes: 100,
        imageInputs: [
          { url: "data:image/png;base64,aW1hZ2U=", detail: "high" },
          { url: "data:image/png;base64,aW1hZ2Uy" }
        ]
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
                    summary: "商品素材呈现搜索型标品的清晰展示结构。",
                    confidence: "medium",
                    detectedBeats: [],
                    risks: []
                  },
                  creativeFactorsRecommendation: {
                    recommendedFactors: {
                      productCategory: "consumer-electronics",
                      dealType: "search-standard",
                      audience: "youth",
                      strategy: "review-comparison"
                    },
                    confidence: "medium",
                    reasons: ["素材图清晰展示数码商品外观。"]
                  }
                }),
                output: []
              };
            }
          }
        })
      }
    );

    const content =
      (calls[0] as { input: Array<{ content: Array<{ type: string }> }> })
        .input[0]?.content ?? [];
    const types = content.map((block) => block.type);
    assert.ok(types.includes("input_image"), "expected an input_image block");
    assert.equal(
      types.includes("input_video"),
      false,
      "must not send input_video when no video is provided"
    );
    assert.equal(
      content.filter((block) => block.type === "input_image").length,
      2
    );
    assert.equal(
      result.creativeFactorsRecommendation.recommendedFactors.productCategory,
      "consumer-electronics"
    );
  });

  it("folds reference text files into the prompt and keeps images alongside", async () => {
    const calls: unknown[] = [];

    await analyzeReferenceVideoRequirements(
      {
        imageInputs: [{ url: "data:image/png;base64,aW1hZ2U=" }],
        textInputs: [
          { filename: "卖点.md", text: "核心卖点：长续航与快充，主打通勤人群。" }
        ]
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
                  analysis: { summary: "综合素材与文本推断。", confidence: "medium" },
                  creativeFactorsRecommendation: {
                    recommendedFactors: {
                      productCategory: "consumer-electronics",
                      dealType: "search-standard",
                      audience: "general",
                      strategy: "pain-solution"
                    },
                    confidence: "medium"
                  }
                }),
                output: []
              };
            }
          }
        })
      }
    );

    const content =
      (
        calls[0] as {
          input: Array<{ content: Array<{ type: string; text?: string }> }>;
        }
      ).input[0]?.content ?? [];
    const textBlock = content.find((block) => block.type === "input_text");
    assert.match(textBlock?.text ?? "", /卖点\.md/);
    assert.match(textBlock?.text ?? "", /长续航与快充/);
    assert.ok(content.some((block) => block.type === "input_image"));
  });
});
