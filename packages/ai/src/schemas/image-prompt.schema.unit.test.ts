import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StoryboardImagePromptOutputSchema } from "./image-prompt.schema.js";

describe("StoryboardImagePromptOutputSchema", () => {
  const valid = {
    promptText: "A cinematic close-up of the product on a marble counter",
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

  it("rejects when promptText too short", () => {
    assert.throws(() =>
      StoryboardImagePromptOutputSchema.parse({ ...valid, promptText: "tiny" }),
    );
  });

  it("defaults referenceImageUsage to []", () => {
    const { promptText, productVisibilityRule } = valid;
    const out = StoryboardImagePromptOutputSchema.parse({ promptText, productVisibilityRule });
    assert.deepEqual(out.referenceImageUsage, []);
    assert.deepEqual(out.qualityChecklist, []);
  });
});
