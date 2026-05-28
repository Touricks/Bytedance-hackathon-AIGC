import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  nextStatusAfter,
  getNextAction,
  type ShotStatus,
} from "./shot.state.js";

describe("getNextAction", () => {
  const map: Array<[ShotStatus, string]> = [
    ["DRAFT", "GENERATE_IMAGE_PROMPT"],
    ["IMAGE_PROMPT_PROPOSING", "NONE"],
    ["IMAGE_PROMPT_READY", "GENERATE_IMAGES"],
    ["IMAGE_PROMPT_EDITED", "GENERATE_IMAGES"],
    ["IMAGE_GENERATING", "POLL_IMAGE_BATCH"],
    ["IMAGE_CANDIDATES_READY", "SELECT_IMAGE"],
    ["IMAGE_SELECTED", "GENERATE_VIDEO_SCRIPT"],
    ["VIDEO_SCRIPT_PROPOSING", "NONE"],
    ["VIDEO_SCRIPT_READY", "EDIT_VIDEO_SCRIPT"],
    ["VIDEO_SCRIPT_EDITED", "GENERATE_VIDEOS"],
    ["VIDEO_GENERATING", "POLL_VIDEO_BATCH"],
    ["VIDEO_CANDIDATES_READY", "SELECT_VIDEO"],
    ["VIDEO_SELECTED", "READY_FOR_FINAL_COMPOSE"],
    ["FAILED", "RETRY"],
  ];
  for (const [status, expected] of map) {
    it(`maps ${status} to ${expected}`, () => {
      assert.equal(getNextAction(status), expected);
    });
  }
});

describe("canTransition", () => {
  it("blocks skipping image selection", () => {
    assert.equal(canTransition("IMAGE_CANDIDATES_READY", "VIDEO_SCRIPT_READY"), false);
  });
  it("allows selected image to propose video script", () => {
    assert.equal(canTransition("IMAGE_SELECTED", "VIDEO_SCRIPT_PROPOSING"), true);
  });
});

describe("nextStatusAfter", () => {
  it("ENQUEUE_IMAGE_BATCH from READY", () => {
    assert.equal(nextStatusAfter("ENQUEUE_IMAGE_BATCH", "IMAGE_PROMPT_READY"), "IMAGE_GENERATING");
  });
  it("IMAGE_BATCH_DONE_OK from GENERATING", () => {
    assert.equal(nextStatusAfter("IMAGE_BATCH_DONE_OK", "IMAGE_GENERATING"), "IMAGE_CANDIDATES_READY");
  });
  it("VIDEO_BATCH_FAILED from anywhere -> FAILED", () => {
    assert.equal(nextStatusAfter("VIDEO_BATCH_FAILED", "VIDEO_GENERATING"), "FAILED");
  });
});
