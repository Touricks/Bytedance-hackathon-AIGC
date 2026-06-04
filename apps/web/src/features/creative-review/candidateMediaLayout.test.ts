import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANDIDATE_MEDIA_FRAME_WIDTH,
  DEFAULT_CANDIDATE_MEDIA_ASPECT_RATIO,
  candidateMediaAspectRatio,
  cssAspectRatio,
} from "./candidateMediaLayout.js";

describe("candidate media layout", () => {
  it("turns supported batch aspect ratios into CSS aspect-ratio values", () => {
    assert.equal(cssAspectRatio("9:16"), "9 / 16");
    assert.equal(cssAspectRatio("16:9"), "16 / 9");
    assert.equal(cssAspectRatio("1:1"), "1 / 1");
  });

  it("falls back to a stable portrait frame for missing or invalid ratios", () => {
    assert.equal(candidateMediaAspectRatio(null), DEFAULT_CANDIDATE_MEDIA_ASPECT_RATIO);
    assert.equal(candidateMediaAspectRatio(undefined), DEFAULT_CANDIDATE_MEDIA_ASPECT_RATIO);
    assert.equal(candidateMediaAspectRatio("bad-value"), DEFAULT_CANDIDATE_MEDIA_ASPECT_RATIO);
    assert.equal(candidateMediaAspectRatio("0:16"), DEFAULT_CANDIDATE_MEDIA_ASPECT_RATIO);
  });

  it("keeps candidate cards driven by a fixed media frame width", () => {
    assert.equal(CANDIDATE_MEDIA_FRAME_WIDTH, "clamp(132px, 10vw, 176px)");
  });
});
