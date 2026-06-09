import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { __setProviderConcurrencyForTests } from "../concurrency/provider-concurrency.js";
import { generateResponsesTextWithArk } from "./ark-text.provider.js";

afterEach(() => {
  __setProviderConcurrencyForTests("text", undefined);
});

const textInput = (text: string) => [
  { role: "user" as const, content: [{ type: "input_text" as const, text }] },
];

describe("generateResponsesTextWithArk", () => {
  it("sends strict JSON Schema through Responses API text.format", async () => {
    const calls: unknown[] = [];

    const result = await generateResponsesTextWithArk(
      {
        input: textInput("Analyze a reference video."),
        temperature: 0.2,
      },
      {
        provider: "ark",
        apiKey: "test-key",
        model: "doubao-seed-endpoint",
        baseURL: "https://ark.example/api/v3",
      },
      {
        responseFormat: {
          type: "json_schema",
          name: "reference_video_requirements",
          description: "Reference video requirements schema",
          schemaVersion: "reference-video-requirements",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["sentinelField"],
            properties: {
              sentinelField: { type: "string" },
            },
          },
        },
        createClient: () => ({
          responses: {
            create: async (request) => {
              calls.push(request);
              return {
                status: "completed",
                output_text: '{"sentinelField":"ok"}',
                output: [],
              };
            },
          },
        }),
      },
    );

    assert.deepEqual(result.output, '{"sentinelField":"ok"}');
    assert.deepEqual(calls, [
      {
        model: "doubao-seed-endpoint",
        input: textInput("Analyze a reference video."),
        temperature: 0.2,
        text: {
          format: {
            type: "json_schema",
            name: "reference_video_requirements",
            description: "Reference video requirements schema",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["sentinelField"],
              properties: {
                sentinelField: { type: "string" },
              },
            },
          },
        },
      },
    ]);
  });

  it("reads the message JSON from a reasoning-model envelope, ignoring reasoning text", async () => {
    const result = await generateResponsesTextWithArk(
      {
        input: textInput("Generate a storyboard."),
      },
      {
        provider: "ark",
        apiKey: "test-key",
        model: "doubao-seed-endpoint",
        baseURL: "https://ark.example/api/v3",
      },
      {
        createClient: () => ({
          responses: {
            create: async () => ({
              status: "completed",
              output_text: null,
              output: [
                {
                  type: "reasoning",
                  content: [
                    { type: "output_text", text: "让我先思考分镜结构，这不是 JSON。" },
                  ],
                },
                {
                  type: "message",
                  role: "assistant",
                  content: [{ type: "output_text", text: '{"ok":true}' }],
                },
              ],
            }),
          },
        }),
      },
    );

    assert.equal(result.output, '{"ok":true}');
  });

  it("emits provider-boundary trace events around the model call", async () => {
    const events: unknown[] = [];

    await generateResponsesTextWithArk(
      {
        input: textInput("Create a creative blueprint."),
        temperature: 0.2,
      },
      {
        provider: "ark",
        apiKey: "test-key",
        model: "doubao-seed-endpoint",
        baseURL: "https://ark.example/api/v3",
      },
      {
        traceLogger: {
          append: async (event) => {
            events.push(event);
          },
        },
        trace: {
          pipeline: "creative_blueprint",
          meta: {
            imageReferenceMode: "none",
          },
        },
        clock: () => 1000,
        createClient: () => ({
          responses: {
            create: async () => ({
              status: "completed",
              output_text: "blueprint json",
              output: [],
            }),
          },
        }),
      },
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
          imageReferenceMode: "none",
        },
      },
      {
        kind: "provider.response_received",
        pipeline: "creative_blueprint",
        status: "ok",
        provider: "ark",
        model: "doubao-seed-endpoint",
        latencyMs: 0,
        meta: {
          imageReferenceMode: "none",
          output: "blueprint json",
        },
      },
    ]);
  });

  it("traces only a compact response-format summary, never the schema body", async () => {
    const events: unknown[] = [];

    await generateResponsesTextWithArk(
      {
        input: textInput("Create a storyboard."),
        temperature: 0.2,
      },
      {
        provider: "ark",
        apiKey: "test-key",
        model: "doubao-seed-endpoint",
        baseURL: "https://ark.example/api/v3",
      },
      {
        responseFormat: {
          type: "json_schema",
          name: "storyboard",
          description: "Storyboard output schema",
          schemaVersion: "ugc-storyboard",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["sentinelField"],
            properties: {
              sentinelField: { type: "string" },
            },
          },
        },
        traceLogger: {
          append: async (event) => {
            events.push(event);
          },
        },
        trace: {
          pipeline: "storyboard",
          contractVersion: "ugc-storyboard",
        },
        createClient: () => ({
          responses: {
            create: async () => ({
              status: "completed",
              output_text: '{"ok":true}',
              output: [],
            }),
          },
        }),
      },
    );

    assert.deepEqual(
      (events[0] as { meta: { responseFormat: unknown } }).meta.responseFormat,
      {
        type: "json_schema",
        name: "storyboard",
        strict: true,
        schemaVersion: "ugc-storyboard",
      },
    );
    assert.equal(JSON.stringify(events).includes("sentinelField"), false);
  });

  it("emits sanitized provider failure diagnostics", async () => {
    const events: unknown[] = [];

    await assert.rejects(
      () =>
        generateResponsesTextWithArk(
          {
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: "Create a creative blueprint." },
                  {
                    type: "input_image",
                    image_url: "data:image/png;base64,c2Vuc2l0aXZl",
                    detail: "high",
                  },
                ],
              },
            ],
          },
          {
            provider: "ark",
            apiKey: "test-key",
            model: "doubao-seed-endpoint",
            baseURL: "https://ark.example/api/v3",
          },
          {
            traceLogger: {
              append: async (event) => {
                events.push(event);
              },
            },
            trace: {
              pipeline: "creative_blueprint",
            },
            createClient: () => ({
              responses: {
                create: async () => {
                  throw Object.assign(
                    new Error(
                      "Bad image data:image/png;base64,c2Vuc2l0aXZl with Bearer secret-token",
                    ),
                    { status: 400 },
                  );
                },
              },
            }),
          },
        ),
      /Bad image/,
    );

    assert.equal((events as Array<{ kind: string }>)[1]?.kind, "provider.failed");
    assert.deepEqual((events as Array<{ meta: { error: string } }>)[1]?.meta, {
      error: "Bad image data:image/<redacted>;base64,<redacted> with Bearer <redacted>",
    });
  });

  it("rejects incomplete Responses API results before parsing output text", async () => {
    await assert.rejects(
      () =>
        generateResponsesTextWithArk(
          {
            input: "Analyze a reference video.",
          },
          {
            provider: "ark",
            apiKey: "test-key",
            model: "doubao-seed-endpoint",
            baseURL: "https://ark.example/api/v3",
          },
          {
            createClient: () => ({
              responses: {
                create: async () => ({
                  status: "failed",
                  output_text: null,
                  output: [],
                  error: {
                    code: "invalid_request",
                    message: "schema rejected",
                  },
                }),
              },
            }),
          },
        ),
      /Responses API returned status failed: schema rejected/,
    );
  });

  it("caps concurrent text provider calls", async () => {
    __setProviderConcurrencyForTests("text", 2);
    let active = 0;
    let maxInFlight = 0;

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        generateResponsesTextWithArk(
          {
            input: textInput(`Create a creative blueprint ${index}.`),
          },
          {
            provider: "ark",
            apiKey: "test-key",
            model: "doubao-seed-endpoint",
            baseURL: "https://ark.example/api/v3",
          },
          {
            createClient: () => ({
              responses: {
                create: async () => {
                  active += 1;
                  maxInFlight = Math.max(maxInFlight, active);
                  await new Promise((resolve) => setTimeout(resolve, 10));
                  active -= 1;
                  return {
                    status: "completed",
                    output_text: "blueprint json",
                    output: [],
                  };
                },
              },
            }),
          },
        ),
      ),
    );

    assert.equal(maxInFlight, 2);
  });
});
