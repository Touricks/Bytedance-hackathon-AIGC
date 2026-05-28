import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkspaceUrl, buildWorkspaceUrl } from "./urlState.js";

test("parses workspaceId from /workspaces/:id", () => {
  const parsed = parseWorkspaceUrl("/workspaces/wsp_1", "");
  assert.equal(parsed.workspaceId, "wsp_1");
  assert.equal(parsed.shotId, null);
  assert.equal(parsed.step, null);
});

test("parses shot + step from query", () => {
  const parsed = parseWorkspaceUrl(
    "/workspaces/wsp_1",
    "?shot=shot_2&step=video_script",
  );
  assert.equal(parsed.workspaceId, "wsp_1");
  assert.equal(parsed.shotId, "shot_2");
  assert.equal(parsed.step, "video_script");
});

test("buildWorkspaceUrl is the inverse of parse", () => {
  const url = buildWorkspaceUrl({
    workspaceId: "wsp_1",
    shotId: "shot_2",
    step: "image_candidates",
  });
  assert.equal(url, "/workspaces/wsp_1?shot=shot_2&step=image_candidates");
});

test("buildWorkspaceUrl drops null shot/step", () => {
  assert.equal(
    buildWorkspaceUrl({ workspaceId: "wsp_1", shotId: null, step: null }),
    "/workspaces/wsp_1",
  );
});

test("rejects unknown step values", () => {
  const parsed = parseWorkspaceUrl("/workspaces/wsp_1", "?step=bogus");
  assert.equal(parsed.step, null);
});
