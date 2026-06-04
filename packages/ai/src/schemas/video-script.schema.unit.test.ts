import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VideoShotScriptOutputSchema } from "./video-script.schema.js";

describe("VideoShotScriptOutputSchema", () => {
  const valid = {
    durationSec: 4,
    shotGoal: "Show product",
    startFrameDescription: "Close-up product on marble",
    endFrameDescription: "Wider shot, hand picks it up",
    continuityWithPrevious: null,
    continuityWithNext: null,
    cameraMotion: "push_in",
    subjectMotion: "hand enters frame",
    productVisibility: "hero",
    sceneConsistency: "same lighting throughout",
    voiceover: null,
    onscreenText: null,
    providerPrompt: "A 4-second cinematic shot pushing in on the product on marble; hand enters and lifts it",
    negativePrompt: null,
    riskNotes: [],
  };

  it("accepts a valid payload", () => {
    const out = VideoShotScriptOutputSchema.parse(valid);
    assert.equal(out.durationSec, valid.durationSec);
    assert.equal(out.shotGoal, valid.shotGoal);
    assert.equal(out.startFrameDescription, valid.startFrameDescription);
    assert.equal(out.endFrameDescription, valid.endFrameDescription);
    assert.equal(out.cameraMotion, valid.cameraMotion);
    assert.equal(out.subjectMotion, valid.subjectMotion);
    assert.equal(out.productVisibility, valid.productVisibility);
    assert.equal(out.sceneConsistency, valid.sceneConsistency);
    assert.equal(out.providerPrompt, valid.providerPrompt);
    assert.deepEqual(out.riskNotes, valid.riskNotes);
  });

  it("requires nullable soft fields to be present for strict structured output", () => {
    const missingSoftField: Partial<typeof valid> = { ...valid };
    delete missingSoftField.continuityWithNext;
    assert.throws(() =>
      VideoShotScriptOutputSchema.parse(missingSoftField),
    );
  });

  it("rejects extra fields", () => {
    assert.throws(() =>
      VideoShotScriptOutputSchema.parse({ ...valid, extra: "not allowed" }),
    );
  });
});
