import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldReenqueueInflightJob } from "./job.recovery.js";

describe("generation job recovery decisions", () => {
  it("keeps Redis jobs that can still finish in place", () => {
    for (const queueJobState of [
      "active",
      "delayed",
      "paused",
      "prioritized",
      "waiting",
      "waiting-children",
    ]) {
      assert.equal(
        shouldReenqueueInflightJob({
          useRedisQueue: true,
          queueJobId: "58",
          queueJobState,
        }),
        false,
        queueJobState,
      );
    }
  });

  it("re-enqueues DB-inflight jobs when the Redis job is gone or terminal", () => {
    for (const queueJobState of [null, "failed", "completed", "unknown"]) {
      assert.equal(
        shouldReenqueueInflightJob({
          useRedisQueue: true,
          queueJobId: "58",
          queueJobState,
        }),
        true,
        String(queueJobState),
      );
    }
  });

  it("re-enqueues when no Redis job id was recorded", () => {
    assert.equal(
      shouldReenqueueInflightJob({
        useRedisQueue: true,
        queueJobId: null,
        queueJobState: null,
      }),
      true,
    );
  });

  it("always replays in-flight jobs in in-process queue mode", () => {
    assert.equal(
      shouldReenqueueInflightJob({
        useRedisQueue: false,
        queueJobId: "58",
        queueJobState: "active",
      }),
      true,
    );
  });
});
