import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { FinalPanel, importFinalVideoToDashboard } from "./FinalPanel.js";

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
  it("renders one-click final video progress with a determinate progressbar", () => {
    const html = renderToStaticMarkup(
      React.createElement(FinalPanel, {
        vm: finalVm({
          workflow: {
            canComposeFinalVideo: true,
            shots: [
              { id: "shot_1" },
              { id: "shot_2" },
              { id: "shot_3" },
              { id: "shot_4" }
            ]
          },
          oneClickFinalVideo: {
            id: "ocv_123",
            status: "RUNNING",
            currentStage: "image_selection",
            stageState: { image: { currentIndex: 1 } },
            errorMessage: null
          }
        })
      })
    );

    assert.match(html, /生成并选择分镜图/);
    assert.match(html, /role="progressbar"/);
    assert.match(html, /aria-label="一键成片进度"/);
    assert.match(html, /aria-valuenow="53"/);
    assert.match(html, /53%/);
  });

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

  it("imports the final video and opens the global dashboard video list", async () => {
    const calls: unknown[] = [];

    await importFinalVideoToDashboard(
      {
        workspaceId: "workspace_123",
        finalVideoJobId: "fv_1",
        name: "618 亲子旅行成片",
      },
      {
        importDashboardVideoArtifact: async (workspaceId, body) => {
          calls.push({ type: "import", workspaceId, body });
          return { data: {} as never };
        },
        listDashboardVideoArtifacts: async (workspaceId) => {
          calls.push({ type: "list", workspaceId });
          return { data: [] };
        },
        navigateToDataDashboard: (workspaceId, view) => {
          calls.push({ type: "navigate", workspaceId, view });
        },
      },
    );

    assert.deepEqual(calls, [
      {
        type: "list",
        workspaceId: "workspace_123",
      },
      {
        type: "import",
        workspaceId: "workspace_123",
        body: { finalVideoJobId: "fv_1", name: "618 亲子旅行成片" },
      },
      { type: "navigate", workspaceId: "workspace_123", view: "diagnosis" },
    ]);
  });

  it("cancels importing and opens the existing dashboard video for duplicate job ids", async () => {
    const calls: unknown[] = [];

    const result = await importFinalVideoToDashboard(
      {
        workspaceId: "workspace_123",
        finalVideoJobId: "fv_1",
        name: "重复成片",
      },
      {
        listDashboardVideoArtifacts: async (workspaceId) => {
          calls.push({ type: "list", workspaceId });
          return {
            data: [
              {
                id: "dash_video_1",
                workspaceId,
                finalVideoJobId: "fv_1",
                name: "已导入成片",
                localUrl: "/api/dashboard/videos/dash_video_1/file",
                durationSec: 18,
                width: 1080,
                height: 1920,
                creativeFactors: {
                  productCategory: "beauty-personal-care",
                  dealType: "repeat-consumable",
                  audience: "youth",
                  strategy: "scenario-demo",
                },
                importedAt: "2026-06-06T08:00:00.000Z",
                createdAt: "2026-06-06T08:00:00.000Z",
                updatedAt: "2026-06-06T08:00:00.000Z",
              },
            ],
          };
        },
        importDashboardVideoArtifact: async () => {
          calls.push({ type: "import" });
          return { data: {} as never };
        },
        navigateToDataDashboard: (workspaceId, view, finalVideoJobId) => {
          calls.push({ type: "navigate", workspaceId, view, finalVideoJobId });
        },
      },
    );

    assert.equal(result.status, "already-exists");
    assert.deepEqual(calls, [
      {
        type: "list",
        workspaceId: "workspace_123",
      },
      {
        type: "navigate",
        workspaceId: "workspace_123",
        view: "diagnosis",
        finalVideoJobId: "fv_1",
      },
    ]);
  });
});
