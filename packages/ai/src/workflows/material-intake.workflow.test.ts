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

describe("material-intake workflow", () => {
  it("keeps the Ark request text-only by default when image inputs are available", async () => {
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
          chat: {
            completions: {
              create: async (request) => {
                calls.push(request);
                return {
                  choices: [
                    {
                      message: {
                        content: JSON.stringify({
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
                      }
                    }
                  ]
                };
              }
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
      messages: Array<{ content: unknown }>;
      response_format?: unknown;
    };
    assert.equal(typeof request.messages[0]?.content, "string");
    assert.doesNotMatch(
      request.messages[0]?.content as string,
      /data:image\/jpeg;base64/
    );
    assert.ok(request.response_format);
    assert.equal(result.trace.imageReferenceMode, "none");
    assert.equal(result.material.assets[0]?.description, "街景中的主商品素材");

    const prepared = events.find(
      (event) => event.kind === "material_intake.request_prepared"
    );
    assert.equal(prepared?.meta?.imageReferenceMode, "none");
    assert.deepEqual(prepared?.meta?.images, []);
  });
});
