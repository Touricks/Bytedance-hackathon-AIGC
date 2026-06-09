import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TraceEventInput } from "../trace/trace-log.js";
import { generateMaterialIntakeWithArk } from "./material-intake.workflow.js";

const scanned = {
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
      description: "上传的商品素材图",
      relevance: "high" as const,
      usable: true,
      included: true
    }
  ],
  rejected: []
};

const scannedWithTwoImages = {
  ...scanned,
  primaryProductRef: "hero.jpg",
  assets: [
    {
      ref: "hero.jpg",
      kind: "image" as const,
      mime: "image/jpeg",
      bytes: 10,
      sha256: "b".repeat(64),
      role: "product_main" as const,
      description: "默认主商品图",
      relevance: "high" as const,
      usable: true,
      included: true
    },
    {
      ref: "detail.jpg",
      kind: "image" as const,
      mime: "image/jpeg",
      bytes: 11,
      sha256: "c".repeat(64),
      role: "reference" as const,
      description: "默认参考图",
      relevance: "medium" as const,
      usable: true,
      included: true
    }
  ]
};

describe("material-intake workflow", () => {
  it("omits image/video parts by default when includeImageInputs is not set", async () => {
    const calls: unknown[] = [];
    const events: TraceEventInput[] = [];

    const result = await generateMaterialIntakeWithArk(
      {
        initialPrompt: "真实电商商品摄影，保留商品材质和品牌识别",
        scanned
      },
      {
        env: {
          MODEL_MODE: "real",
          ARK_API_KEY: "test-key",
          ARK_TEXT_ENDPOINT_ID: "ark-material-intake",
          ARK_BASE_URL: "https://ark.example/api/v3"
        },
        imageInputs: [
          {
            ref: "DSC04135.JPG",
            url: "data:image/jpeg;base64,dGVzdA==",
            mode: "data_url",
            detail: "high"
          }
        ],
        createClient: () => ({
          responses: {
            create: async (request) => {
              calls.push(request);
              return {
                status: "completed",
                output_text: JSON.stringify({
                  primaryProductRef: "DSC04135.JPG",
                  tags: [
                    {
                      ref: "DSC04135.JPG",
                      role: "product_main",
                      description: "街景中的主商品素材",
                      relevance: "high",
                      included: true
                    }
                  ]
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
    assert.equal(parts.some((part) => part.type === "input_video"), false);
    assert.ok(request.text);
    assert.equal(result.trace.imageReferenceMode, "none");
    assert.equal(result.material.assets[0]?.description, "街景中的主商品素材");

    const prepared = events.find(
      (event) => event.kind === "material_intake.request_prepared"
    );
    assert.equal(prepared?.meta?.imageReferenceMode, "none");
    assert.deepEqual(prepared?.meta?.images, []);
    assert.deepEqual(prepared?.meta?.videos, []);
  });

  it("sends input_image and input_video parts when includeImageInputs is set", async () => {
    const calls: unknown[] = [];
    const events: TraceEventInput[] = [];

    await generateMaterialIntakeWithArk(
      { initialPrompt: "识别商品与演示视频", scanned },
      {
        env: {
          MODEL_MODE: "real",
          ARK_API_KEY: "test-key",
          ARK_TEXT_ENDPOINT_ID: "ark-material-intake",
          ARK_BASE_URL: "https://ark.example/api/v3"
        },
        includeImageInputs: true,
        imageInputs: [
          {
            ref: "DSC04135.JPG",
            url: "data:image/jpeg;base64,dGVzdA==",
            mode: "data_url",
            detail: "high"
          }
        ],
        videoInputs: [
          {
            ref: "demo.mp4",
            url: "data:video/mp4;base64,dmlk",
            mode: "data_url",
            fps: 0.5
          }
        ],
        createClient: () => ({
          responses: {
            create: async (request) => {
              calls.push(request);
              return {
                status: "completed",
                output_text: JSON.stringify({
                  primaryProductRef: "DSC04135.JPG",
                  tags: [
                    {
                      ref: "DSC04135.JPG",
                      role: "product_main",
                      description: "主商品",
                      relevance: "high",
                      included: true
                    }
                  ]
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
      input: Array<{ content: Array<{ type: string; fps?: number }> }>;
    };
    const parts = request.input[0]?.content ?? [];
    assert.ok(parts.some((part) => part.type === "input_image"));
    const video = parts.find((part) => part.type === "input_video");
    assert.ok(video);
    assert.equal(video?.fps, 0.5);

    const prepared = events.find(
      (event) => event.kind === "material_intake.request_prepared"
    );
    assert.equal(prepared?.meta?.videoReferenceMode, "data_url");
    assert.equal(
      (prepared?.meta?.videos as Array<{ ref: string }>)?.[0]?.ref,
      "demo.mp4"
    );
  });

  it("normalizes duplicate model product_main tags to the single primary material", async () => {
    const result = await generateMaterialIntakeWithArk(
      {
        initialPrompt: "识别主商品与细节素材",
        scanned: scannedWithTwoImages
      },
      {
        env: {
          MODEL_MODE: "real",
          ARK_API_KEY: "test-key",
          ARK_TEXT_ENDPOINT_ID: "ark-material-intake",
          ARK_BASE_URL: "https://ark.example/api/v3"
        },
        createClient: () => ({
          responses: {
            create: async () => ({
              status: "completed",
              output_text: JSON.stringify({
                primaryProductRef: "hero.jpg",
                tags: [
                  {
                    ref: "hero.jpg",
                    role: "product_main",
                    description: "主商品整体展示",
                    relevance: "high",
                    included: true
                  },
                  {
                    ref: "detail.jpg",
                    role: "product_main",
                    description: "商品细节也被模型误标为主商品",
                    relevance: "high",
                    included: true
                  }
                ]
              })
            })
          }
        })
      }
    );

    const productMainRefs = result.material.assets
      .filter((asset) => asset.role === "product_main")
      .map((asset) => asset.ref);

    assert.deepEqual(productMainRefs, ["hero.jpg"]);
    assert.equal(
      result.material.assets.find((asset) => asset.ref === "detail.jpg")?.role,
      "product_detail"
    );
  });
});
