import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowStatus } from "../../lib/api/shots.js";
import {
  getImageAutoSelectionTargets,
  hasActiveImageBatch,
  imageAutoSelectionActionNote,
  isImageAutoSelectionTarget,
} from "./imageBatchTargets.js";

type WorkflowShot = WorkflowStatus["shots"][number];

function shot(overrides: Partial<WorkflowShot>): WorkflowShot {
  return {
    shotId: "shot-1",
    orderIndex: 0,
    status: "IMAGE_PROMPT_READY",
    nextAction: "GENERATE_IMAGE_PROMPT",
    activeImagePromptArtifactId: null,
    selectedImageId: null,
    selectedImageUrl: null,
    activeVideoScriptArtifactId: null,
    selectedVideoId: null,
    activeImageBatchId: null,
    activeImageBatchStatus: null,
    activeVideoBatchId: null,
    activeVideoBatchStatus: null,
    upstream: { upstreamChanged: false, changedSources: [] },
    videoUpstream: { upstreamChanged: false, changedSources: [] },
    ...overrides,
  };
}

describe("image auto-selection targets", () => {
  it("includes shots without selected images when no image batch is active", () => {
    const shots = [0, 1, 2].map((orderIndex) =>
      shot({ shotId: `shot-${orderIndex + 1}`, orderIndex }),
    );

    assert.deepEqual(
      getImageAutoSelectionTargets(shots).map((target) => target.shotId),
      ["shot-1", "shot-2", "shot-3"],
    );
    assert.equal(imageAutoSelectionActionNote(shots), "待生成/选择 3 个分镜");
  });

  it("does not target shots while an image batch is running", () => {
    const runningShot = shot({
      activeImageBatchId: "imb-running",
      activeImageBatchStatus: "RUNNING",
    });

    assert.equal(hasActiveImageBatch(runningShot), true);
    assert.equal(isImageAutoSelectionTarget(runningShot), false);
    assert.equal(imageAutoSelectionActionNote([runningShot]), "分镜图生成中");
  });

  it("does not target shots that already have generated candidates", () => {
    const generatedShot = shot({
      activeImageBatchId: "imb-complete",
      activeImageBatchStatus: "SUCCEEDED",
    });

    assert.equal(isImageAutoSelectionTarget(generatedShot), false);
    assert.equal(imageAutoSelectionActionNote([generatedShot]), "已有分镜图候选");
  });

  it("does not target shots with a selected image", () => {
    const selectedShot = shot({
      selectedImageId: "imc-selected",
      selectedImageUrl: "/image.png",
      activeImageBatchId: "imb-complete",
      activeImageBatchStatus: "SUCCEEDED",
    });

    assert.equal(isImageAutoSelectionTarget(selectedShot), false);
    assert.equal(imageAutoSelectionActionNote([selectedShot]), "分镜图已完成选择");
  });
});
