import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultStepForStatus, isStepReachable } from "./stepDerivation.js";

test("defaultStepForStatus", () => {
  assert.equal(defaultStepForStatus("DRAFT"), "image_prompt");
  assert.equal(defaultStepForStatus("IMAGE_PROMPT_READY"), "image_prompt");
  assert.equal(defaultStepForStatus("IMAGE_GENERATING"), "image_candidates");
  assert.equal(
    defaultStepForStatus("IMAGE_CANDIDATES_READY"),
    "image_candidates",
  );
  assert.equal(defaultStepForStatus("IMAGE_SELECTED"), "video_script");
  assert.equal(defaultStepForStatus("VIDEO_SCRIPT_READY"), "video_script");
  assert.equal(defaultStepForStatus("VIDEO_GENERATING"), "video_candidates");
  assert.equal(
    defaultStepForStatus("VIDEO_CANDIDATES_READY"),
    "video_candidates",
  );
  assert.equal(defaultStepForStatus("VIDEO_SELECTED"), "review");
  assert.equal(defaultStepForStatus("FAILED"), "image_prompt");
});

test("isStepReachable", () => {
  assert.equal(isStepReachable("image_prompt", "DRAFT"), true);
  assert.equal(isStepReachable("image_candidates", "DRAFT"), false);
  assert.equal(isStepReachable("video_script", "IMAGE_SELECTED"), true);
  assert.equal(isStepReachable("video_candidates", "IMAGE_SELECTED"), false);
  assert.equal(isStepReachable("review", "VIDEO_SELECTED"), true);
  assert.equal(isStepReachable("review", "VIDEO_CANDIDATES_READY"), false);
});
