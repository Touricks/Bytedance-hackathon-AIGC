import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { StepRail } from "./ReviewRails.js";

function stepRailVm() {
  return {
    workspaceId: "workspace_123",
    artifacts: {
      promptRequirements: null,
      material: null,
      brief: null,
      storyboard: null,
      shotPrompt: null,
    },
    pending: {},
    shots: [],
    selectedShotId: null,
    workspaceStatus: null,
    workflow: null,
    finalVideo: null,
    oneClickFinalVideo: null,
  } as unknown as WorkbenchViewModel;
}

describe("ReviewRails", () => {
  it("keeps the creative review brand text without the sidebar brand icon", () => {
    const html = renderToStaticMarkup(
      React.createElement(StepRail, {
        vm: stepRailVm(),
        active: "requirements",
        defaultStep: "requirements",
        onSelect() {},
        onShotSelect() {},
      }),
    );

    assert.match(html, /创作审核台/);
    assert.doesNotMatch(html, /lucide-layers/);
  });
});
