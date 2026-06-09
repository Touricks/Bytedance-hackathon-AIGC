import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductBriefArtifact } from "@aigc-video/shared";
import type { TraceEventInput } from "../trace/trace-log.js";
import { generateProductBriefWithArk } from "./product-brief.workflow.js";

const material = {
  scannedAt: "2026-06-02T00:00:00.000Z",
  primaryProductRef: "DSC04135.JPG",
  assets: [
    {
      ref: "DSC04135.JPG",
      kind: "image" as const,
      mime: "image/jpeg",
      bytes: 7_566_479,
      sha256: "a".repeat(64),
      role: "product_main" as const,
      description: "街景中的商品展示图",
      relevance: "high" as const,
      usable: true,
      included: true
    }
  ],
  rejected: []
};

const draft: ProductBriefArtifact = {
  product: {
    name: "旧金山金门大桥风景装饰画",
    category: "家居装饰",
    keyFacts: ["高清微喷", "风景画面"],
    assets: [{ ref: "DSC04135.JPG", useAs: "primary" }]
  },
  audience: {
    who: "喜欢旅行和家装风格的消费者",
    painOrDesire: "希望家里有纪念意义的风景元素"
  },
  coreSellingPoint: "旧核心卖点",
  proof: ["原片展示真实街景"],
  offer: null,
  platform: "抖音",
  brandTone: "清新自然",
  bannedExpressions: ["最高级"],
  landingInfo: null,
  assumptions: ["未提供品牌信息"]
};

describe("product-brief workflow", () => {
  it("keeps the Ark request text-only by default when a product image is available", async () => {
    const calls: unknown[] = [];
    const events: TraceEventInput[] = [];

    const result = await generateProductBriefWithArk(
      {
        userDirection: "真实电商商品摄影",
        title: "城市街景产品",
        sellingPoints: "材质真实，适合旅行风格内容",
        material
      },
      {
        env: {
          MODEL_MODE: "real",
          ARK_API_KEY: "test-key",
          ARK_TEXT_ENDPOINT_ID: "ark-product-brief",
          ARK_BASE_URL: "https://ark.example/api/v3"
        },
        imageInput: {
          url: "data:image/jpeg;base64,dGVzdA==",
          mode: "data_url",
          detail: "high"
        },
        createClient: () => ({
          responses: {
            create: async (request) => {
              calls.push(request);
              return {
                status: "completed",
                output_text: JSON.stringify({
                  product: {
                    name: "城市街景产品",
                    category: "旅行风格商品",
                    keyFacts: ["材质真实", "适合旅行风格内容"],
                    assets: [{ ref: "DSC04135.JPG", useAs: "primary" }]
                  },
                  audience: {
                    who: "喜欢城市旅行内容的电商用户",
                    painOrDesire: "希望商品内容真实可信"
                  },
                  coreSellingPoint: "真实街景氛围强化商品质感",
                  proof: ["已上传主商品素材图。"],
                  offer: null,
                  platform: "抖音",
                  brandTone: "真实直接",
                  bannedExpressions: [],
                  landingInfo: null,
                  assumptions: []
                })
              };
            }
          }
        }),
        traceLogger: {
          append: async (event) => {
            events.push(event);
          }
        }
      }
    );

    const request = calls[0] as {
      input: Array<{ content: Array<{ type: string }> }>;
      text?: unknown;
    };
    const parts = request.input[0]?.content ?? [];
    assert.equal(parts[0]?.type, "input_text");
    assert.equal(parts.some((part) => part.type === "input_image"), false);
    assert.ok(request.text);
    assert.equal(result.trace.imageReferenceMode, "none");
    assert.equal(result.productBrief.product.name, "城市街景产品");

    const prepared = events.find((event) => event.kind === "brief.request_prepared");
    assert.equal(prepared?.meta?.imageReferenceMode, "none");
    assert.equal(prepared?.meta?.image, undefined);
  });

  it("includes merchant draft and direction in product-brief rewrite prompts", async () => {
    const calls: unknown[] = [];

    await generateProductBriefWithArk(
      {
        userDirection: "更突出送礼场景，语气更年轻",
        material,
        draft
      },
      {
        env: {
          MODEL_MODE: "real",
          ARK_API_KEY: "test-key",
          ARK_TEXT_ENDPOINT_ID: "ark-product-brief",
          ARK_BASE_URL: "https://ark.example/api/v3"
        },
        createClient: () => ({
          responses: {
            create: async (request) => {
              calls.push(request);
              return {
                status: "completed",
                output_text: JSON.stringify({
                  ...draft,
                  coreSellingPoint: "更适合送礼的年轻化家居装饰卖点"
                })
              };
            }
          }
        })
      }
    );

    const request = calls[0] as {
      input: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const content = String(request.input[0]?.content[0]?.text);
    assert.match(content, /本次任务模式：调整商品卖点/);
    assert.match(content, /用户方向是本轮最高优先级/);
    assert.match(content, /不得原样返回当前草稿中的旧商品主体/);
    assert.match(content, /product\.name、product\.category、audience、coreSellingPoint、proof 和 assumptions/);
    assert.match(content, /当前商品卖点草稿/);
    assert.match(content, /旧核心卖点/);
    assert.match(content, /更突出送礼场景，语气更年轻/);
    assert.match(content, /街景中的商品展示图/);
  });
});
