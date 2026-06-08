import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { oneClickFinalVideoTestHooks } from "./one-click-final-video.service.js";

describe("one-click final video auto-selection rules", () => {
  it("generates one candidate per auto-selected batch because only the first success is consumed", () => {
    assert.equal(oneClickFinalVideoTestHooks.oneClickAutoSelectionCandidateCount, 1);
  });

  it("selects the first succeeded image candidate with a stable URL", () => {
    const candidate = oneClickFinalVideoTestHooks.firstSucceededImageCandidate([
      {
        id: "img_persisting",
        status: "RUNNING",
        imageUrl: "/images/pending.png",
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

  it("does not select video candidates while they are persisting", () => {
    const candidate = oneClickFinalVideoTestHooks.firstSucceededVideoCandidate([
      {
        id: "vid_persisting",
        status: "PERSISTING",
        videoUrl: "/videos/persisting.mp4",
        providerResponse: { candidateIndex: 0 },
        createdAt: "2026-06-04T00:00:00.000Z",
      },
      {
        id: "vid_no_url",
        status: "SUCCEEDED",
        videoUrl: null,
        providerResponse: { candidateIndex: 1 },
        createdAt: "2026-06-04T00:00:01.000Z",
      },
      {
        id: "vid_ready",
        status: "SUCCEEDED",
        videoUrl: "/videos/ready.mp4",
        providerResponse: { candidateIndex: 2 },
        createdAt: "2026-06-04T00:00:02.000Z",
      },
    ] as never);

    assert.equal(candidate?.id, "vid_ready");
  });

  it("continues waiting for non-terminal generation batches", () => {
    assert.equal(oneClickFinalVideoTestHooks.shouldKeepWaitingForBatch("PENDING"), true);
    assert.equal(oneClickFinalVideoTestHooks.shouldKeepWaitingForBatch("RUNNING"), true);
    assert.equal(oneClickFinalVideoTestHooks.shouldKeepWaitingForBatch("SUCCEEDED"), false);
    assert.equal(oneClickFinalVideoTestHooks.shouldKeepWaitingForBatch("FAILED"), false);
  });
});
