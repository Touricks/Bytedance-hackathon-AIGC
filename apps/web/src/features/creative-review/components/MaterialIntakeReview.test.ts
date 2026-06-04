import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { MaterialIntakeReview } from "./MaterialIntakeReview.js";

const sampleMaterial: MaterialIntakeArtifact = {
  scannedAt: "2026-06-04T00:00:00.000Z",
  primaryProductRef: "product.png",
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
  ],
  rejected: [],
};

function materialVm(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "workspace_123",
    artifacts: {
      material: {
        id: "mat_123",
        isCurrent: false,
        data: sampleMaterial,
      },
    },
    busy: false,
    pending: {},
    actions: {
      runMaterialIntake() {},
      approveMaterialIntakeAndProposeBrief() {},
      startOneClickFinalVideo() {},
    },
    oneClickFinalVideo: null,
    ...overrides,
  } as unknown as WorkbenchViewModel;
}

describe("MaterialIntakeReview", () => {
  it("renders the manual approval action and the independent one-click action side by side", () => {
    const html = renderToStaticMarkup(
      React.createElement(MaterialIntakeReview, {
        vm: materialVm(),
        onActionComplete() {},
      }),
    );

    assert.match(html, /批准素材解读并生成商品卖点/);
    assert.match(html, /全自动一键成片/);
  });

  it("renders recoverable one-click progress on the material intake page", () => {
    const html = renderToStaticMarkup(
      React.createElement(MaterialIntakeReview, {
        vm: materialVm({
          oneClickFinalVideo: {
            id: "ocv_123",
            status: "WAITING",
            currentStage: "video_selection",
            errorMessage: null,
          },
        }),
        onActionComplete() {},
      }),
    );

    assert.match(html, /正在一键成片/);
    assert.match(html, /生成并选择分镜视频/);
    assert.match(html, /可随时回到对应步骤手动继续/);
  });
});
