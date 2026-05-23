import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateCreativeBlueprintWithArk,
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
      fieldsToChange: ["productImage"]
    }
  ]
};

describe("generateCreativeBlueprintWithArk", () => {
  it("returns a validated creative blueprint from a strict JSON model response", async () => {
    const calls: string[] = [];
    const callTextModel: TextModelCall = async (prompt) => {
      calls.push(prompt);
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
    assert.equal(result.trace.promptVersion, "creative-blueprint.v1");
    assert.equal(result.trace.repairAttempts, 0);
    assert.equal(result.trace.fallbackUsed, false);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!, /merchant-readable creative blueprint/);
  });

  it("repairs invalid model output once before returning a blueprint", async () => {
    const calls: string[] = [];
    const callTextModel: TextModelCall = async (prompt) => {
      calls.push(prompt);
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
    assert.equal(result.trace.parsedOutputStatus, "repaired");
    assert.equal(result.trace.repairAttempts, 1);
    assert.equal(result.trace.fallbackUsed, false);
    assert.equal(calls.length, 2);
    assert.match(calls[1]!, /Repair the following model output/);
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
    assert.equal(result.creativeBlueprint.coreSellingPoint, "USB-C charging");
    assert.equal(result.trace.parsedOutputStatus, "fallback");
    assert.equal(result.trace.repairAttempts, 1);
    assert.equal(result.trace.fallbackUsed, true);
    assert.ok(result.trace.failureReason);
  });

  it("fails loudly in real-provider mode when text model credentials are missing", async () => {
    const originalMode = process.env.MODEL_MODE;
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalModel = process.env.OPENAI_MODEL;
    const originalArkModel = process.env.ARK_TEXT_ENDPOINT_ID;
    process.env.MODEL_MODE = "real";
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
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
        /real-provider mode requires OpenAI-compatible text model config/
      );
    } finally {
      if (originalMode === undefined) {
        delete process.env.MODEL_MODE;
      } else {
        process.env.MODEL_MODE = originalMode;
      }
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      if (originalModel === undefined) {
        delete process.env.OPENAI_MODEL;
      } else {
        process.env.OPENAI_MODEL = originalModel;
      }
      if (originalArkModel === undefined) {
        delete process.env.ARK_TEXT_ENDPOINT_ID;
      } else {
        process.env.ARK_TEXT_ENDPOINT_ID = originalArkModel;
      }
    }
  });
});
