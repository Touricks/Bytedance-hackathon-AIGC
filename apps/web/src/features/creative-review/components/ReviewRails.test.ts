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

function rightRailVm(overrides: Record<string, unknown> = {}) {
  const base = {
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
  };
  return { ...base, ...overrides } as unknown as WorkbenchViewModel;
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

  it("shows right-rail progress only for regular background work", () => {
    const idleHtml = renderToStaticMarkup(
      React.createElement(RightRail, {
        vm: rightRailVm(),
        onReturnToRequirements() {},
        onSelectStep() {},
      }),
    );
    assert.doesNotMatch(idleHtml, /review-activity-progress/);

    const materialHtml = renderToStaticMarkup(
      React.createElement(RightRail, {
        vm: rightRailVm({ pending: { materialIntake: true } }),
        onReturnToRequirements() {},
        onSelectStep() {},
      }),
    );
    assert.match(materialHtml, /review-activity-progress/);
    assert.match(materialHtml, /aria-label="素材解读进度"/);
    assert.match(materialHtml, /正在调用模型识别素材内容/);

    const oneClickHtml = renderToStaticMarkup(
      React.createElement(RightRail, {
        vm: rightRailVm({
          pending: { oneClickFinalVideo: true },
          oneClickFinalVideo: {
            id: "ocv_1",
            status: "RUNNING",
            currentStage: "storyboard",
            stageState: {},
            errorMessage: null,
          },
        }),
        onReturnToRequirements() {},
        onSelectStep() {},
      }),
    );
    assert.match(oneClickHtml, /一键成片进行中/);
    assert.doesNotMatch(oneClickHtml, /review-activity-progress/);
  });
});
