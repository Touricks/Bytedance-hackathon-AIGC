import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shotImageAutoSelectionTestHooks } from "./shot-image-auto-selection.service.js";

describe("shot image auto-selection rules", () => {
  it("selects the first succeeded image candidate with a stable URL", () => {
    const candidate = shotImageAutoSelectionTestHooks.firstSucceededImageCandidate([
      {
        id: "img_persisting",
        status: "PERSISTING",
        imageUrl: "/images/persisting.png",
        providerResponse: { candidateIndex: 0 },
        createdAt: "2026-06-04T00:00:00.000Z",
      },
      {
        id: "img_second",
        status: "SUCCEEDED",
        imageUrl: "/images/second.png",
        providerResponse: { candidateIndex: 2 },
        createdAt: "2026-06-04T00:00:02.000Z",
      },
      {
        id: "img_first",
        status: "SUCCEEDED",
        imageUrl: "/images/first.png",
        providerResponse: { candidateIndex: 1 },
        createdAt: "2026-06-04T00:00:01.000Z",
      },
    ] as never);

    assert.equal(candidate?.id, "img_first");
  });

  it("continues waiting for non-terminal generation batches", () => {
    assert.equal(shotImageAutoSelectionTestHooks.shouldKeepWaitingForBatch("PENDING"), true);
    assert.equal(shotImageAutoSelectionTestHooks.shouldKeepWaitingForBatch("RUNNING"), true);
    assert.equal(shotImageAutoSelectionTestHooks.shouldKeepWaitingForBatch("SUCCEEDED"), false);
    assert.equal(shotImageAutoSelectionTestHooks.shouldKeepWaitingForBatch("FAILED"), false);
  });
});
