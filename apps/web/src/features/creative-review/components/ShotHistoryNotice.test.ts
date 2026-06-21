import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { ImageSelectionPanel } from "./ImageSelectionPanel.js";
import { VideoSelectionPanel } from "./VideoSelectionPanel.js";

function baseVm(overrides: Partial<WorkbenchViewModel> = {}) {
  return {
    workspaceStatus: {
      activeShotSet: {
        upstream: { upstreamChanged: true, changedSources: ["shotPrompt"] },
      },
    },
    shots: [
      {
        shotId: "shot_1",
        orderIndex: 0,
        status: "IMAGE_SELECTED",
        selectedImageId: "imc_1",
        selectedVideoId: null,
        activeImageBatchId: null,
        activeImageBatchStatus: null,
        activeVideoBatchId: null,
        activeVideoBatchStatus: null,
      },
    ],
    selectedShotId: "shot_1",
    selectedWorkflowShot: {
      shotId: "shot_1",
      orderIndex: 0,
      status: "IMAGE_SELECTED",
      selectedImageId: "imc_1",
      selectedVideoId: null,
      activeImageBatchId: null,
      activeImageBatchStatus: null,
      activeVideoBatchId: null,
      activeVideoBatchStatus: null,
    },
    imageRounds: [],
    videoRounds: [],
    shotImageAutoSelection: null,
    generation: {
      hasActiveVideoBatchInWorkflow: false,
      hasActiveShotImageAutoSelection: false,
      hasImageBatchInWorkflow: false,
      imageAutoSelectionTargetCount: 1,
    },
    candidateCounts: {
      image: 1,
      imageOptions: [1, 2, 3],
      video: 1,
      videoOptions: [1, 2, 3],
    },
    pending: {},
    busy: false,
    actions: {
      setImageCandidateCount: () => undefined,
      setVideoCandidateCount: () => undefined,
      proposeImage: () => undefined,
      rerollImageCandidates: () => undefined,
      startShotImageAutoSelection: () => undefined,
      proposeAllVideos: () => undefined,
      rerollVideoCandidates: () => undefined,
    },
    ...overrides,
  } as unknown as WorkbenchViewModel;
}

describe("shot history notices", () => {
  it("tells users old storyboard images live in read-only history", () => {
    const html = renderToStaticMarkup(
      React.createElement(ImageSelectionPanel, {
        vm: baseVm(),
        manualShotSelectionId: null,
        onAutoSelectShot: () => undefined,
        onImageSelectionConfirmed: () => undefined,
      }),
    );

    assert.match(
      html,
      /旧版本分镜图可在应用分镜历史中查看\/下载，不会参与新版本生成。/,
    );
  });

  it("tells users old storyboard videos live in read-only history", () => {
    const html = renderToStaticMarkup(
      React.createElement(VideoSelectionPanel, {
        vm: baseVm(),
      }),
    );

    assert.match(
      html,
      /旧版本分镜视频可在应用分镜历史中查看\/下载，不会参与新版本生成。/,
    );
  });
});
