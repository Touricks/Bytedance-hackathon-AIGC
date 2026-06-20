import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowStatus } from "../../lib/api/shots.js";
import {
  getVideoBatchGenerationTargets,
  isVideoBatchGenerationTarget,
  videoBatchActionNote,
} from "./videoBatchTargets.js";

type WorkflowShot = WorkflowStatus["shots"][number];

function shot(overrides: Partial<WorkflowShot>): WorkflowShot {
  return {
    shotId: "shot-1",
    orderIndex: 0,
    status: "IMAGE_SELECTED",
    nextAction: "GENERATE_VIDEO_SCRIPT",
    activeImagePromptArtifactId: "imp-1",
    selectedImageId: "imc-1",
    selectedImageUrl: "/image.png",
    activeVideoScriptArtifactId: null,
    selectedVideoId: null,
    activeImageBatchId: "imb-1",
    activeVideoBatchId: null,
    activeVideoBatchStatus: null,
    upstream: { upstreamChanged: false, changedSources: [] },
    videoUpstream: { upstreamChanged: false, changedSources: [] },
    ...overrides,
  };
}

describe("video batch generation targets", () => {
  it("includes stale selected videos after images are reselected", () => {
    const shots = [0, 1, 2].map((orderIndex) =>
      shot({
        shotId: `shot-${orderIndex + 1}`,
        orderIndex,
        selectedImageId: `imc-new-${orderIndex + 1}`,
        selectedVideoId: `vcd-old-${orderIndex + 1}`,
        activeVideoBatchId: `vbb-old-${orderIndex + 1}`,
        activeVideoBatchStatus: "SUCCEEDED",
        videoUpstream: {
          upstreamChanged: true,
          changedSources: ["firstFrameCandidateId"],
        },
        upstream: {
          upstreamChanged: true,
          changedSources: ["firstFrameCandidateId"],
        },
      }),
    );

    const targets = getVideoBatchGenerationTargets(shots);

    assert.deepEqual(
      targets.map((target) => target.shotId),
      ["shot-1", "shot-2", "shot-3"],
    );
    assert.equal(videoBatchActionNote(shots), "待生成/更新 3 个分镜");
  });

  it("does not duplicate generation while the active video batch is running", () => {
    const staleRunningShot = shot({
      selectedVideoId: "vcd-old",
      activeVideoBatchId: "vbb-running",
      activeVideoBatchStatus: "RUNNING",
      videoUpstream: {
        upstreamChanged: true,
        changedSources: ["firstFrameCandidateId"],
      },
    });

    assert.equal(isVideoBatchGenerationTarget(staleRunningShot), false);
    assert.equal(videoBatchActionNote([staleRunningShot]), "分镜视频生成中");
  });

  it("includes first-time video generation targets", () => {
    const firstTimeShot = shot({
      selectedVideoId: null,
      activeVideoBatchId: null,
      activeVideoBatchStatus: null,
      videoUpstream: { upstreamChanged: false, changedSources: [] },
    });

    assert.equal(isVideoBatchGenerationTarget(firstTimeShot), true);
    assert.equal(videoBatchActionNote([firstTimeShot]), "待生成 1 个分镜");
  });

  it("does not treat image-only upstream drift as a stale video target", () => {
    const imageOnlyStaleShot = shot({
      selectedVideoId: "vcd-current",
      activeVideoBatchId: "vbb-current",
      activeVideoBatchStatus: "SUCCEEDED",
      upstream: { upstreamChanged: true, changedSources: ["sceneAnchorImageUrl"] },
      videoUpstream: { upstreamChanged: false, changedSources: [] },
    });

    assert.equal(isVideoBatchGenerationTarget(imageOnlyStaleShot), false);
    assert.equal(videoBatchActionNote([imageOnlyStaleShot]), "已有视频候选或已完成选择");
  });

  it("does not include terminal video batches in bulk targets but points to reroll", () => {
    const partialShot = shot({
      selectedVideoId: null,
      activeVideoBatchId: "vbb-partial",
      activeVideoBatchStatus: "PARTIAL",
    });

    assert.equal(isVideoBatchGenerationTarget(partialShot), false);
    assert.equal(
      videoBatchActionNote([partialShot]),
      "已有视频候选待选择，可重新生成当前分镜",
    );
  });
});
