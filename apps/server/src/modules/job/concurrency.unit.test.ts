import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWorkerConcurrency } from "./concurrency.js";

describe("generation worker concurrency", () => {
  it("is governed by the explicit worker concurrency", () => {
    assert.equal(resolveWorkerConcurrency({ generationWorkerConcurrency: 17 }), 17);
    assert.equal(resolveWorkerConcurrency({ generationWorkerConcurrency: 3 }), 3);
  });

  it("floors at 1 when worker concurrency is zero, negative, or NaN", () => {
    assert.equal(resolveWorkerConcurrency({ generationWorkerConcurrency: 0 }), 1);
    assert.equal(resolveWorkerConcurrency({ generationWorkerConcurrency: -4 }), 1);
    assert.equal(
      resolveWorkerConcurrency({ generationWorkerConcurrency: Number.NaN }),
      1
    );
  });
});
