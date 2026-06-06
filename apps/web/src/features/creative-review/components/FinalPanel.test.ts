import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { FinalPanel } from "./FinalPanel.js";

function finalVm(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "workspace_123",
    busy: false,
    workflow: { canComposeFinalVideo: true },
    pending: {},
    actions: {
      composeFinal() {},
      importFinalVideoToDashboard() {
        return Promise.resolve();
      },
    },
    oneClickFinalVideo: null,
    finalVideo: null,
    ...overrides,
  } as unknown as WorkbenchViewModel;
}

describe("FinalPanel", () => {
  it("renders a naming workflow for importing a completed final video into the dashboard", () => {
    const html = renderToStaticMarkup(
      React.createElement(FinalPanel, {
        vm: finalVm({
          finalVideo: {
            id: "fv_1",
            workspaceId: "workspace_123",
            status: "SUCCEEDED",
            localUrl: "/api/workspaces/workspace_123/final-videos/fv_1/file",
            durationSec: 18,
            compiledManifestHash: "hash",
            errorMessage: null,
            createdAt: "2026-06-06T08:00:00.000Z",
          },
        }),
      }),
    );

    assert.match(html, /下载 MP4/);
    assert.match(html, /成片名称/);
    assert.match(html, /导入数据面板/);
    assert.match(html, /final-video-fv_1/);
  });
});
