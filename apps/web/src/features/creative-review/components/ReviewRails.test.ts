import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { RightRail, StepRail } from "./ReviewRails.js";

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

function rightRailVm() {
  return {
    workspaceId: "workspace_123",
    materialLibrary: {
      scannedAt: "2026-06-04T00:00:00.000Z",
      assets: [
        {
          ref: "product.png",
          kind: "image",
          mime: "image/png",
          bytes: 1024,
          sha256: "a".repeat(64),
          role: "product_main",
          description: "主商品素材",
          relevance: "high",
          usable: true,
          included: true,
        },
        {
          ref: "manual.pdf",
          kind: "text",
          mime: "application/pdf",
          bytes: 2048,
          sha256: "b".repeat(64),
          role: "reference",
          description: "说明书",
          relevance: "medium",
          usable: true,
          included: true,
        },
      ],
      rejected: [],
    },
    artifacts: {
      promptRequirements: null,
      material: null,
      brief: null,
      storyboard: null,
      shotPrompt: null,
    },
    pending: {},
    shots: [],
    workspaceStatus: null,
    workflow: null,
    finalVideo: null,
    oneClickFinalVideo: null,
    actions: {
      async refresh() {},
    },
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

  it("renders running steps with a MUI circular progress indicator", () => {
    const vm = {
      ...stepRailVm(),
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: null,
        brief: null,
        storyboard: null,
        shotPrompt: null,
      },
      pending: { materialIntake: true },
    } as unknown as WorkbenchViewModel;

    const html = renderToStaticMarkup(
      React.createElement(StepRail, {
        vm,
        active: "material",
        defaultStep: "material",
        onSelect() {},
        onShotSelect() {},
      }),
    );

    assert.match(html, /review-step__state--processing/);
    assert.match(html, /MuiCircularProgress-root/);
    assert.match(html, /aria-label="生成中"/);
  });

  it("renders material library images as zoomable photos while preserving delete controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(RightRail, {
        vm: rightRailVm(),
        onReturnToRequirements() {},
        onSelectStep() {},
      }),
    );

    assert.match(html, /素材库/);
    assert.match(html, /aria-label="放大查看素材 product.png"/);
    assert.match(html, /删除 product.png/);
    assert.match(html, /manual.pdf/);
    assert.match(html, /删除 manual.pdf/);
  });
});
