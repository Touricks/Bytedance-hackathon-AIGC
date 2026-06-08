import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { MainPanel } from "./MainPanel.js";

function mainPanelVm(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "workspace_123",
    artifacts: {
      brief: null,
    },
    workflow: {
      shots: [{ id: "shot_1" }, { id: "shot_2" }],
    },
    pending: {
      oneClickFinalVideo: true,
    },
    oneClickFinalVideo: {
      id: "ocv_123",
      status: "RUNNING",
      currentStage: "video_selection",
      stageState: {
        video: {
          selectedCandidateIdsByShotId: {
            shot_1: "candidate_1",
          },
        },
      },
      errorMessage: null,
    },
    busy: true,
    actions: {
      proposeBrief() {
        return Promise.resolve();
      },
    },
    ...overrides,
  } as unknown as WorkbenchViewModel;
}

describe("MainPanel", () => {
  it("renders unified one-click progress while downstream modules are still empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(MainPanel, {
        vm: mainPanelVm(),
        active: "brief",
        onActionComplete() {},
        manualShotSelectionId: null,
        onAutoSelectShot() {},
        onImageSelectionConfirmed() {},
      }),
    );

    assert.match(html, /一键成片进行中/);
    assert.match(html, /生成并选择分镜视频/);
    assert.match(html, /role="progressbar"/);
    assert.match(html, /aria-label="一键成片进度"/);
    assert.doesNotMatch(html, /当前审核内容还没有生成/);
  });
});
