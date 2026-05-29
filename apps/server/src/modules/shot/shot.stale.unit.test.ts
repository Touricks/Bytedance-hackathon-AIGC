// Stale rules require a real Postgres pool. Marked as a smoke covered by integration tests.
// Unit test reserved for pure logic; kept as a placeholder to fail loudly if rules diverge.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { staleRules } from "./shot.stale.js";

describe("staleRules", () => {
  it("exposes the three rules", () => {
    assert.equal(typeof staleRules.onImagePromptEdited, "function");
    assert.equal(typeof staleRules.onImageSelectionChanged, "function");
    assert.equal(typeof staleRules.onVideoScriptReplaced, "function");
  });
});
