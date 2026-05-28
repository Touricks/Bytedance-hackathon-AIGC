import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createFileTraceLogger } from "../trace/trace-log.js";
import {
  generateCreativeBlueprintWithArk,
  type CreateTextModelCall,
  type CreativeBlueprintModelRequest,
  type TextModelCall
} from "./creative-blueprint.workflow.js";

const validBlueprint = {
  narrative: "A focused 12-second product story for a mini blender.",
  visualStyle: "clean premium ecommerce",
  targetAudience: "busy office workers",
  coreSellingPoint: "USB-C charging",
  shots: [
    {
      index: 1,
      durationSec: 3,
      purpose: "hook",
      visualPrompt: "Clean hero shot of the blender on a bright counter",
      cameraMotion: "slow push in",
      voiceover: "Meet the portable blender.",
      subtitle: "Blend anywhere"
    },
    {
      index: 2,
      durationSec: 5,
      purpose: "benefit",
      visualPrompt: "Close detail showing USB-C charging and easy cleaning",
      cameraMotion: "smooth pan",
      voiceover: "Charge fast and clean in seconds.",
      subtitle: "USB-C, easy cleaning"
    },
    {
      index: 3,
      durationSec: 4,
      purpose: "cta",
      visualPrompt: "Return to a polished hero shot with fresh smoothie",
      cameraMotion: "gentle pull back",
      voiceover: "Make healthy habits simple.",
      subtitle: "Start today"
    }
  ],
  renderBrief: {
    productConsistencyRules: ["Keep product shape and color consistent"],
    avoid: ["Do not invent readable brand text"],
    videoPromptSummary: "Clean 12-second blender product showcase"
  },
  improvementHints: [
    {
      ifVideoLooksBad: "商品不像原图",
      suggestedUserAction: "上传更清晰的正面商品图。",
      fieldsToChange: ["productImage", "coreSellingPoint"]
    }
  ]
};

describe("generateCreativeBlueprintWithArk", () => {
  it("returns a validated creative blueprint from a strict JSON model response", async () => {
    const calls: CreativeBlueprintModelRequest[] = [];
    const callTextModel: TextModelCall = async (request) => {
      calls.push(request);
      return JSON.stringify(validBlueprint);
    };

    const result = await generateCreativeBlueprintWithArk(
      {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/mocks/products/demo-product.svg"
      },
      { callTextModel, model: "ark-test-model" }
    );

    assert.equal(result.provider, "ark");
    assert.equal(result.creativeBlueprint.coreSellingPoint, "USB-C charging");
    assert.equal(result.creativeBlueprint.shots.length, 3);
    assert.equal(result.trace.model, "ark-test-model");
    assert.equal(result.trace.textProvider, "ark");
    assert.equal(result.trace.imageReferenceMode, "none");
    assert.equal(result.trace.promptVersion, "creative-blueprint.v1");
    assert.equal(result.trace.repairAttempts, 0);
    assert.equal(result.trace.fallbackUsed, false);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.prompt, /商家可读的创作蓝图/);
    assert.match(calls[0]!.prompt, /coreSellingPoint/);
    assert.doesNotMatch(calls[0]!.prompt, /fieldsToChange.*sellingPoints/);
    assert.doesNotMatch(calls[0]!.prompt, /\bRole:/);
    assert.equal(calls[0]!.content, calls[0]!.prompt);
  });

  it("sends uploaded product images as structured image content to Ark", async () => {
    const calls: CreativeBlueprintModelRequest[] = [];
    const callTextModel: TextModelCall = async (request) => {
      calls.push(request);
      return JSON.stringify(validBlueprint);
    };

    const result = await generateCreativeBlueprintWithArk(
      {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/uploads/product-images/demo.png"
      },
      {
        callTextModel,
        model: "ark-test-model",
        imageInput: {
          url: "data:image/png;base64,cHJvZHVjdA==",
          mode: "data_url",
          detail: "high"
        }
      }
    );

    assert.equal(result.provider, "ark");
    assert.equal(result.trace.imageReferenceMode, "data_url");
    assert.equal(calls.length, 1);
    assert.ok(Array.isArray(calls[0]!.content));
    assert.deepEqual(calls[0]!.content[1], {
      type: "image_url",
      image_url: {
        url: "data:image/png;base64,cHJvZHVjdA==",
        detail: "high"
      }
    });
  });

  it("writes redacted provider trace events with full prompt and text output", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "blueprint-trace-"));
    const traceLogger = createFileTraceLogger({
      traceId: "script_with_image",
      traceRoot
    });
    const callTextModel: TextModelCall = async () => JSON.stringify(validBlueprint);

    await generateCreativeBlueprintWithArk(
      {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/uploads/product-images/demo.png"
      },
      {
        callTextModel,
        model: "ark-test-model",
        traceLogger,
        imageInput: {
          url: "data:image/png;base64,cHJvZHVjdA==",
          mode: "data_url",
          detail: "high"
        }
      }
    );

    const events = (await readFile(traceLogger.filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.deepEqual(
      events.map((event) => event.kind),
      [
        "blueprint.request_prepared",
        "provider.request_started",
        "provider.response_received",
        "blueprint.parsed"
      ]
    );
    assert.match(events[0].meta.prompt, /商家可读的创作蓝图/);
    assert.equal(events[0].meta.imageReferenceMode, "data_url");
    assert.equal(events[0].meta.image.mimeType, "image/png");
    assert.equal(events[0].meta.image.byteSize, Buffer.from("product").byteLength);
    assert.equal(typeof events[0].meta.image.sha256, "string");
    assert.match(events[2].meta.output, /USB-C charging/);

    const traceText = await readFile(traceLogger.filePath, "utf8");
    assert.doesNotMatch(traceText, /cHJvZHVjdA==/);
    assert.match(traceText, /data:image\/<redacted>;base64,<redacted>/);
  });

  it("repairs invalid model output once before returning a blueprint", async () => {
    const calls: CreativeBlueprintModelRequest[] = [];
    const callTextModel: TextModelCall = async (request) => {
      calls.push(request);
      return calls.length === 1 ? "not json" : JSON.stringify(validBlueprint);
    };

    const result = await generateCreativeBlueprintWithArk(
      {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/mocks/products/demo-product.svg"
      },
      { callTextModel, model: "ark-test-model" }
    );

    assert.equal(result.provider, "ark");
    assert.equal(result.trace.textProvider, "ark");
    assert.equal(result.trace.parsedOutputStatus, "repaired");
    assert.equal(result.trace.repairAttempts, 1);
    assert.equal(result.trace.fallbackUsed, false);
    assert.equal(calls.length, 2);
    assert.match(calls[1]!.prompt, /修复为符合创作蓝图 schema 的严格 JSON/);
    assert.match(calls[1]!.prompt, /coreSellingPoint/);
    assert.match(calls[1]!.prompt, /不要使用 sellingPoints/);
  });

  it("falls back to a deterministic creative blueprint when repair fails", async () => {
    const callTextModel: TextModelCall = async () => "not json";

    const result = await generateCreativeBlueprintWithArk(
      {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/mocks/products/demo-product.svg"
      },
      { callTextModel, model: "ark-test-model" }
    );

    assert.equal(result.provider, "fallback");
    assert.equal(result.trace.textProvider, "deterministic");
    assert.equal(result.trace.imageReferenceMode, "none");
    assert.equal(result.creativeBlueprint.coreSellingPoint, "USB-C charging");
    assert.equal(result.trace.parsedOutputStatus, "fallback");
    assert.equal(result.trace.repairAttempts, 1);
    assert.equal(result.trace.fallbackUsed, true);
    assert.ok(result.trace.failureReason);
  });

  it("fails loudly in real-provider mode when model output cannot be repaired", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "blueprint-real-repair-"));
    const traceLogger = createFileTraceLogger({
      traceId: "real_provider_repair_failure",
      traceRoot
    });
    const createTextModelCall: CreateTextModelCall = () => async () => "not json";

    await assert.rejects(
      () =>
        generateCreativeBlueprintWithArk(
          {
            title: "Portable Mini Blender",
            sellingPoints: "USB-C charging",
            audience: "busy office workers",
            stylePreference: "clean premium ecommerce",
            imageUrl: "/mocks/products/demo-product.svg"
          },
          {
            createTextModelCall,
            traceLogger,
            env: {
              MODEL_MODE: "real",
              ARK_API_KEY: "real-ark-key",
              ARK_TEXT_ENDPOINT_ID: "ark-text-endpoint"
            }
          }
        ),
      /Creative blueprint repair failed in real-provider mode/
    );

    const events = (await readFile(traceLogger.filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      events.map((event) => event.kind),
      [
        "blueprint.request_prepared",
        "provider.request_started",
        "provider.response_received",
        "blueprint.parse_failed",
        "blueprint.repair_failed"
      ]
    );
    assert.equal(events.at(-1)?.provider, "ark");
    assert.equal(events.at(-1)?.meta.deterministicFallbackAllowed, false);
  });

  it("uses deterministic fallback in mock mode when no text provider is configured", async () => {
    const result = await generateCreativeBlueprintWithArk(
      {
        title: "Portable Mini Blender",
        sellingPoints: "USB-C charging",
        audience: "busy office workers",
        stylePreference: "clean premium ecommerce",
        imageUrl: "/mocks/products/demo-product.svg"
      },
      {
        env: {
          MODEL_MODE: "mock"
        }
      }
    );

    assert.equal(result.provider, "fallback");
    assert.equal(result.trace.textProvider, "deterministic");
    assert.equal(result.trace.model, "unconfigured");
    assert.equal(result.trace.fallbackUsed, true);
    assert.equal(result.trace.failureReason, "Ark text provider is not configured");
  });

  it("fails loudly in real-provider mode when text model credentials are missing", async () => {
    const originalMode = process.env.MODEL_MODE;
    const originalArkApiKey = process.env.ARK_API_KEY;
    const originalArkModel = process.env.ARK_TEXT_ENDPOINT_ID;
    process.env.MODEL_MODE = "real";
    delete process.env.ARK_API_KEY;
    delete process.env.ARK_TEXT_ENDPOINT_ID;

    try {
      await assert.rejects(
        () =>
          generateCreativeBlueprintWithArk({
            title: "Portable Mini Blender",
            sellingPoints: "USB-C charging",
            audience: "busy office workers",
            stylePreference: "clean premium ecommerce",
            imageUrl: "/mocks/products/demo-product.svg"
          }),
        /real-provider mode requires Ark text config/
      );
    } finally {
      if (originalMode === undefined) {
        delete process.env.MODEL_MODE;
      } else {
        process.env.MODEL_MODE = originalMode;
      }
      if (originalArkApiKey === undefined) {
        delete process.env.ARK_API_KEY;
      } else {
        process.env.ARK_API_KEY = originalArkApiKey;
      }
      if (originalArkModel === undefined) {
        delete process.env.ARK_TEXT_ENDPOINT_ID;
      } else {
        process.env.ARK_TEXT_ENDPOINT_ID = originalArkModel;
      }
    }
  });

  it("fails loudly in real-provider mode when Ark text config is missing", async () => {
    const providerCalls: string[] = [];
    const createTextModelCall: CreateTextModelCall = (config) => {
      providerCalls.push(config.provider);
      return async () => JSON.stringify(validBlueprint);
    };

    await assert.rejects(
      () =>
        generateCreativeBlueprintWithArk(
          {
            title: "Portable Mini Blender",
            sellingPoints: "USB-C charging",
            audience: "busy office workers",
            stylePreference: "clean premium ecommerce",
            imageUrl: "/mocks/products/demo-product.svg"
          },
          {
            createTextModelCall,
            env: {
              MODEL_MODE: "real"
            }
          }
        ),
      /real-provider mode requires Ark text config/
    );
    assert.deepEqual(providerCalls, []);
  });

  it("fails loudly in real-provider mode when Ark auth fails", async () => {
    const traceRoot = await mkdtemp(path.join(os.tmpdir(), "blueprint-real-"));
    const traceLogger = createFileTraceLogger({
      traceId: "real_provider_failure",
      traceRoot
    });
    const providerCalls: string[] = [];
    const createTextModelCall: CreateTextModelCall = (config) => {
      providerCalls.push(config.provider);
      return async () => {
        throw Object.assign(new Error("Unauthorized Ark key"), {
          status: 401
        });
      };
    };

    await assert.rejects(
      () =>
        generateCreativeBlueprintWithArk(
          {
            title: "Portable Mini Blender",
            sellingPoints: "USB-C charging",
            audience: "busy office workers",
            stylePreference: "clean premium ecommerce",
            imageUrl: "/mocks/products/demo-product.svg"
          },
          {
            createTextModelCall,
            traceLogger,
            env: {
              MODEL_MODE: "real",
              ARK_API_KEY: "bad-ark-key",
              ARK_TEXT_ENDPOINT_ID: "ark-text-endpoint"
            }
          }
        ),
      /Unauthorized Ark key/
    );

    assert.deepEqual(providerCalls, ["ark"]);
    const events = (await readFile(traceLogger.filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(events.at(-1)?.kind, "provider.failed");
    assert.equal(events.at(-1)?.provider, "ark");
    assert.equal(events.at(-1)?.model, "ark-text-endpoint");
  });
});
