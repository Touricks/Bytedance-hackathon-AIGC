import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  __setProviderConcurrencyForTests,
  providerConcurrencyStats,
  runWithProviderSlot
} from "./provider-concurrency.js";

afterEach(() => {
  __setProviderConcurrencyForTests("text", undefined);
  __setProviderConcurrencyForTests("image", undefined);
  __setProviderConcurrencyForTests("video", undefined);
});

async function measureMaxInFlight(kind: "text" | "image" | "video", limit: number) {
  __setProviderConcurrencyForTests(kind, limit);
  let active = 0;
  let maxInFlight = 0;
  const task = () =>
    runWithProviderSlot(kind, async () => {
      active += 1;
      maxInFlight = Math.max(maxInFlight, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return true;
    });

  await Promise.all(Array.from({ length: limit + 4 }, task));
  return maxInFlight;
}

describe("provider concurrency semaphore", () => {
  it("caps text provider calls", async () => {
    const maxInFlight = await measureMaxInFlight("text", 3);
    assert.equal(maxInFlight, 3);
    assert.deepEqual(providerConcurrencyStats("text"), {
      active: 0,
      queued: 0,
      limit: 3
    });
  });

  it("caps image provider calls", async () => {
    const maxInFlight = await measureMaxInFlight("image", 2);
    assert.equal(maxInFlight, 2);
    assert.deepEqual(providerConcurrencyStats("image"), {
      active: 0,
      queued: 0,
      limit: 2
    });
  });

  it("caps video provider calls", async () => {
    const maxInFlight = await measureMaxInFlight("video", 4);
    assert.equal(maxInFlight, 4);
    assert.deepEqual(providerConcurrencyStats("video"), {
      active: 0,
      queued: 0,
      limit: 4
    });
  });
});
