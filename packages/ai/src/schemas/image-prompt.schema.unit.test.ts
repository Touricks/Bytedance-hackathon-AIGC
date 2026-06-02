import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StoryboardImagePromptOutputSchema } from "./image-prompt.schema.js";

describe("StoryboardImagePromptOutputSchema", () => {
  const valid = {
    promptText: "A cinematic close-up of the product on a marble counter",
    negativePrompt: null,
    visualStyle: null,
    composition: null,
    lighting: null,
    productVisibilityRule: "hero",
    referenceImageUsage: [],
    qualityChecklist: [],
  };

  it("accepts a valid payload", () => {
    const out = StoryboardImagePromptOutputSchema.parse(valid);
    assert.equal(out.promptText, valid.promptText);
    assert.equal(out.productVisibilityRule, valid.productVisibilityRule);
    assert.deepEqual(out.referenceImageUsage, valid.referenceImageUsage);
    assert.deepEqual(out.qualityChecklist, valid.qualityChecklist);
  });

  it("requires nullable soft fields instead of defaulting optional fields", () => {
    const { negativePrompt: _negativePrompt, ...withoutNegativePrompt } = valid;
    assert.throws(() => StoryboardImagePromptOutputSchema.parse(withoutNegativePrompt));

    const { referenceImageUsage: _referenceImageUsage, ...withoutReferenceUsage } = valid;
    assert.throws(() => StoryboardImagePromptOutputSchema.parse(withoutReferenceUsage));
  });

  it("allows soft fields to be JSON null", () => {
    const out = StoryboardImagePromptOutputSchema.parse({
      ...valid,
      negativePrompt: null,
      visualStyle: null,
      composition: null,
      lighting: null,
    });
    assert.equal(out.negativePrompt, null);
    assert.equal(out.visualStyle, null);
    assert.equal(out.composition, null);
    assert.equal(out.lighting, null);
  });
});
