import { test } from "node:test";
import assert from "node:assert/strict";
import { createFocusStore } from "./focusStore.js";

test("setFocus updates fields independently", () => {
  const store = createFocusStore();
  store.getState().setFocus({ shotId: "shot_1" });
  assert.equal(store.getState().shotId, "shot_1");
  assert.equal(store.getState().step, null);
  store.getState().setFocus({ step: "image_prompt" });
  assert.equal(store.getState().step, "image_prompt");
  assert.equal(store.getState().shotId, "shot_1");
});

test("reset clears focus", () => {
  const store = createFocusStore();
  store.getState().setFocus({ shotId: "shot_1", step: "image_prompt" });
  store.getState().reset();
  assert.equal(store.getState().shotId, null);
  assert.equal(store.getState().step, null);
});
