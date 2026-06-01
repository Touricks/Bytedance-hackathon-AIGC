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

describe("buildWorkflowShotRow", () => {
  it("exposes the selected image url so the shot list can render its thumbnail", () => {
    const row = buildWorkflowShotRow(baseShot, {
      activeImageBatchId: "imb_1",
      activeVideoBatchId: null,
      selectedImageCandidate: {
        imageUrl: "/api/workspaces/ws_1/videos/shot_1/imc_1.png",
      },
    });

    assert.equal(row.selectedImageUrl, "/api/workspaces/ws_1/videos/shot_1/imc_1.png");
    assert.equal(row.selectedImageId, "imc_1");
    assert.equal(row.activeImageBatchId, "imb_1");
    assert.equal(row.shotId, "shot_1");
  });

  it("returns a null selected image url when nothing is selected", () => {
    const row = buildWorkflowShotRow(
      { ...baseShot, status: "DRAFT", selectedImageId: null },
      {
        activeImageBatchId: null,
        activeVideoBatchId: null,
        selectedImageCandidate: null,
      },
    );

    assert.equal(row.selectedImageUrl, null);
    assert.equal(row.selectedImageId, null);
  });

  it("returns a null selected image url when the selected candidate has no url yet", () => {
    const row = buildWorkflowShotRow(baseShot, {
      activeImageBatchId: "imb_1",
      activeVideoBatchId: null,
      selectedImageCandidate: { imageUrl: null },
    });

    assert.equal(row.selectedImageUrl, null);
  });
});
