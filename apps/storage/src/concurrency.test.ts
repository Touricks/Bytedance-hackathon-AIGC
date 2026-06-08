import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapWithConcurrency } from "./concurrency.js";

describe("mapWithConcurrency", () => {
  it("returns results in input order", async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 2);
    assert.deepEqual(results, [2, 4, 6, 8]);
  });

  it("passes the index to the worker", async () => {
    const seen: Array<[number, number]> = [];
    await mapWithConcurrency(["a", "b", "c"], 2, async (value, index) => {
      seen.push([index, value.charCodeAt(0)]);
    });
    assert.deepEqual(
      seen.map(([index]) => index).sort((a, b) => a - b),
      [0, 1, 2],
    );
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
    });
    assert.ok(peak <= 3, `peak concurrency ${peak} exceeded limit 3`);
    assert.equal(peak, 3, "expected the pool to saturate the limit");
  });

  it("propagates a worker rejection", async () => {
    await assert.rejects(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
      /boom/,
    );
  });

  it("handles an empty list without invoking the worker", async () => {
    let calls = 0;
    const results = await mapWithConcurrency<number, number>([], 4, async (n) => {
      calls += 1;
      return n;
    });
    assert.deepEqual(results, []);
    assert.equal(calls, 0);
  });
});
