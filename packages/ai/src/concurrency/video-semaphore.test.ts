import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  runWithVideoSlot,
  videoConcurrencyStats,
  __setVideoConcurrencyForTests
} from "./video-semaphore.js";

afterEach(() => {
  __setVideoConcurrencyForTests(undefined);
});

describe("video concurrency semaphore", () => {
  it("caps concurrent runs at VIDEO_PROVIDER_CONCURRENCY", async () => {
    __setVideoConcurrencyForTests(2);
    let active = 0;
    let maxInFlight = 0;
    const task = () =>
      runWithVideoSlot(async () => {
        active += 1;
        maxInFlight = Math.max(maxInFlight, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        return true;
      });

    const results = await Promise.all(Array.from({ length: 6 }, task));

    assert.equal(results.length, 6);
    assert.ok(results.every(Boolean), "all tasks resolve (none dropped)");
    assert.ok(maxInFlight <= 2, `maxInFlight ${maxInFlight} exceeded cap 2`);
    assert.deepEqual(videoConcurrencyStats(), { active: 0, queued: 0 });
  });

  it("releases the permit even when a task throws", async () => {
    __setVideoConcurrencyForTests(1);
    let active = 0;
    let maxInFlight = 0;
    const task = (shouldThrow: boolean) =>
      runWithVideoSlot(async () => {
        active += 1;
        maxInFlight = Math.max(maxInFlight, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (shouldThrow) {
          throw new Error("boom");
        }
      }).catch(() => undefined);

    await Promise.all([task(true), task(false), task(true)]);

    assert.ok(maxInFlight <= 1, `maxInFlight ${maxInFlight} exceeded cap 1`);
    assert.deepEqual(videoConcurrencyStats(), { active: 0, queued: 0 });
  });
});
