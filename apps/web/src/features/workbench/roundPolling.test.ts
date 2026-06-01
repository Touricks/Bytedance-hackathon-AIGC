import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roundPollingInterval } from "./roundPolling.js";

describe("roundPollingInterval", () => {
  it("keeps polling while an active batch has not appeared in rounds yet", () => {
    assert.equal(
      roundPollingInterval({
        activeBatchId: "imb-1",
        rounds: [],
        intervalMs: 3_000,
      }),
      3_000,
    );
  });

  it("keeps polling active pending/running batches independent of workflow status", () => {
    assert.equal(
      roundPollingInterval({
        activeBatchId: "imb-1",
        rounds: [{ batch: { id: "imb-1", status: "PENDING" } }],
        intervalMs: 3_000,
      }),
      3_000,
    );
    assert.equal(
      roundPollingInterval({
        activeBatchId: "vbb-1",
        rounds: [{ batch: { id: "vbb-1", status: "RUNNING" } }],
        intervalMs: 5_000,
      }),
      5_000,
    );
  });

  it("stops polling only after the active batch reaches a terminal state", () => {
    assert.equal(
      roundPollingInterval({
        activeBatchId: "imb-1",
        rounds: [{ batch: { id: "imb-1", status: "SUCCEEDED" } }],
        intervalMs: 3_000,
      }),
      false,
    );
  });

  it("does not poll when the selected shot has no active batch", () => {
    assert.equal(
      roundPollingInterval({
        activeBatchId: null,
        rounds: [{ batch: { id: "imb-1", status: "RUNNING" } }],
        intervalMs: 3_000,
      }),
      false,
    );
  });
});

