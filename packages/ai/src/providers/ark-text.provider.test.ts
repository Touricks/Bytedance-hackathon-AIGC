import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateTextWithArk } from "./ark-text.provider.js";

describe("generateTextWithArk", () => {
  it("sends text-only content through an OpenAI-compatible Ark client", async () => {
    const calls: unknown[] = [];

    await generateTextWithArk(
      {
        prompt: "Create a creative blueprint.",
        content: "Create a creative blueprint."
      },
      {
        provider: "ark",
        apiKey: "test-key",
        model: "doubao-seed-endpoint",
        baseURL: "https://ark.example/api/v3"
      },
      {
        temperature: 0.2,
        topP: 0.8,
        createClient: () => ({
          chat: {
            completions: {
              create: async (request) => {
                calls.push(request);
                return {
                  choices: [{ message: { content: "blueprint json" } }]
                };
              }
            }
          }
        })
      }
    );

    assert.deepEqual(calls, [
      {
        model: "doubao-seed-endpoint",
        messages: [
          {
            role: "user",
            content: "Create a creative blueprint."
          }
        ],
        temperature: 0.2,
        top_p: 0.8
      }
    ]);
  });

  it("sends text plus product image content through an OpenAI-compatible Ark client", async () => {
    const calls: unknown[] = [];

    const result = await generateTextWithArk(
      {
        prompt: "Create a creative blueprint.",
        content: [
          { type: "text", text: "Create a creative blueprint." },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,cHJvZHVjdA==",
              detail: "high"
            }
          }
        ]
      },
      {
        provider: "ark",
        apiKey: "test-key",
        model: "doubao-seed-endpoint",
        baseURL: "https://ark.example/api/v3"
      },
      {
        createClient: (config) => {
          assert.equal(config.provider, "ark");
          assert.equal(config.apiKey, "test-key");
          assert.equal(config.model, "doubao-seed-endpoint");
          assert.equal(config.baseURL, "https://ark.example/api/v3");
          return {
            chat: {
              completions: {
                create: async (request) => {
                  calls.push(request);
                  return {
                    choices: [
                      {
                        message: {
                          content: "blueprint json"
                        }
                      }
                    ]
                  };
                }
              }
            }
          };
        }
      }
    );

    assert.deepEqual(result, {
      provider: "ark",
      model: "doubao-seed-endpoint",
      output: "blueprint json"
    });
    assert.deepEqual(calls, [
      {
        model: "doubao-seed-endpoint",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Create a creative blueprint." },
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64,cHJvZHVjdA==",
                  detail: "high"
                }
              }
            ]
          }
        ],
        temperature: 0.7,
        top_p: 0.9
      }
    ]);
  });

  it("emits provider-boundary trace events around the model call", async () => {
    const events: unknown[] = [];

    await generateTextWithArk(
      {
        prompt: "Create a creative blueprint.",
        content: "Create a creative blueprint."
      },
      {
        provider: "ark",
        apiKey: "test-key",
        model: "doubao-seed-endpoint",
        baseURL: "https://ark.example/api/v3"
      },
      {
        traceLogger: {
          append: async (event) => {
            events.push(event);
          }
        },
        trace: {
          pipeline: "creative_blueprint",
          meta: {
            imageReferenceMode: "none"
          }
        },
        clock: () => 1000,
        createClient: () => ({
          chat: {
            completions: {
              create: async () => ({
                choices: [{ message: { content: "blueprint json" } }]
              })
            }
          }
        })
      }
    );

    assert.deepEqual(events, [
      {
        kind: "provider.request_started",
        pipeline: "creative_blueprint",
        status: "ok",
        provider: "ark",
        model: "doubao-seed-endpoint",
        meta: {
          endpointFamily: "ark_openai_compatible",
          baseURL: "https://ark.example/api/v3",
          imageReferenceMode: "none"
        }
      },
      {
        kind: "provider.response_received",
        pipeline: "creative_blueprint",
        status: "ok",
        provider: "ark",
        model: "doubao-seed-endpoint",
        latencyMs: 0,
        meta: {
          output: "blueprint json"
        }
      }
    ]);
  });

  it("emits sanitized provider failure diagnostics", async () => {
    const events: unknown[] = [];

    await assert.rejects(
      () =>
        generateTextWithArk(
          {
            prompt: "Create a creative blueprint.",
            content: [
              { type: "text", text: "Create a creative blueprint." },
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64,c2Vuc2l0aXZl",
                  detail: "high"
                }
              }
            ]
          },
          {
            provider: "ark",
            apiKey: "test-key",
            model: "doubao-seed-endpoint",
            baseURL: "https://ark.example/api/v3"
          },
          {
            traceLogger: {
              append: async (event) => {
                events.push(event);
              }
            },
            trace: {
              pipeline: "creative_blueprint"
            },
            createClient: () => ({
              chat: {
                completions: {
                  create: async () => {
                    throw Object.assign(
                      new Error(
                        "Bad image data:image/png;base64,c2Vuc2l0aXZl with Bearer secret-token"
                      ),
                      { status: 400 }
                    );
                  }
                }
              }
            })
          }
        ),
      /Bad image/
    );

    assert.equal((events as Array<{ kind: string }>)[1]?.kind, "provider.failed");
    assert.deepEqual((events as Array<{ meta: { error: string } }>)[1]?.meta, {
      error: "Bad image data:image/<redacted>;base64,<redacted> with Bearer <redacted>"
    });
  });
});
