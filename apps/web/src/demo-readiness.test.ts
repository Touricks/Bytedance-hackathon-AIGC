import { test } from "node:test";
import assert from "node:assert/strict";

test("App module exports App", async () => {
  const mod = await import("./routes/App.js");
  assert.equal(typeof mod.App, "function");
});
