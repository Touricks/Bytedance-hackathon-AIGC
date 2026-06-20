import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkflowShotRow } from "./shot.view.js";

const baseShot = {
  id: "shot_1",
  orderIndex: 0,
  status: "IMAGE_SELECTED",
  activeImagePromptArtifactId: "imp_1",
  selectedImageId: "imc_1",
  activeVideoScriptArtifactId: null,
  selectedVideoId: null,
};

const noUpstream = {
  upstreamChanged: false,
  changedSources: [],
};

describe("buildWorkflowShotRow", () => {
  it("exposes the selected image url so the shot list can render its thumbnail", () => {
    const row = buildWorkflowShotRow(baseShot, {
      activeImageBatchId: "imb_1",
      activeImageBatchStatus: "RUNNING",
      activeVideoBatchId: null,
      activeVideoBatchStatus: null,
      selectedImageCandidate: {
        imageUrl: "/api/workspaces/ws_1/videos/shot_1/imc_1.png",
      },
      upstream: noUpstream,
      videoUpstream: noUpstream,
    });

    assert.equal(row.selectedImageUrl, "/api/workspaces/ws_1/videos/shot_1/imc_1.png");
    assert.equal(row.selectedImageId, "imc_1");
    assert.equal(row.activeImageBatchId, "imb_1");
    assert.equal(row.activeImageBatchStatus, "RUNNING");
    assert.equal(row.shotId, "shot_1");
    assert.deepEqual(row.upstream, noUpstream);
  });

  it("returns a null selected image url when nothing is selected", () => {
    const row = buildWorkflowShotRow(
      { ...baseShot, status: "DRAFT", selectedImageId: null },
      {
        activeImageBatchId: null,
        activeImageBatchStatus: null,
        activeVideoBatchId: null,
        activeVideoBatchStatus: null,
        selectedImageCandidate: null,
        upstream: noUpstream,
        videoUpstream: noUpstream,
      },
    );

    assert.equal(row.selectedImageUrl, null);
    assert.equal(row.selectedImageId, null);
  });

  it("returns a null selected image url when the selected candidate has no url yet", () => {
    const row = buildWorkflowShotRow(baseShot, {
      activeImageBatchId: "imb_1",
      activeImageBatchStatus: "SUCCEEDED",
      activeVideoBatchId: null,
      activeVideoBatchStatus: null,
      selectedImageCandidate: { imageUrl: null },
      upstream: noUpstream,
      videoUpstream: noUpstream,
    });

    assert.equal(row.selectedImageUrl, null);
  });

  it("exposes video-specific upstream drift and active video batch status", () => {
    const videoUpstream = {
      upstreamChanged: true,
      changedSources: ["firstFrameCandidateId"],
    };
    const row = buildWorkflowShotRow(baseShot, {
      activeImageBatchId: "imb_1",
      activeImageBatchStatus: "SUCCEEDED",
      activeVideoBatchId: "vbb_1",
      activeVideoBatchStatus: "SUCCEEDED",
      selectedImageCandidate: { imageUrl: "/image.png" },
      upstream: videoUpstream,
      videoUpstream,
    });

    assert.equal(row.activeVideoBatchId, "vbb_1");
    assert.equal(row.activeVideoBatchStatus, "SUCCEEDED");
    assert.deepEqual(row.videoUpstream, videoUpstream);
  });
});
