import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { ApplyShotSetPanel } from "./ApplyShotSetPanel.js";

function renderPanel(overrides: Partial<WorkbenchViewModel> = {}) {
  const vm = {
    artifacts: {
      shotPrompt: { isCurrent: true },
      storyboard: null,
    },
    workspaceStatus: {
      activeShotSet: {
        id: "shot_set_active",
        createdAt: "2026-06-20T00:00:00.000Z",
        shotCount: 3,
        upstream: { upstreamChanged: false, changedSources: [] },
      },
    },
    pending: { applyShotSet: false },
    shotRows: [],
    shotSetHistory: [],
    busy: false,
    hasActiveGeneration: false,
    actions: {
      applyShotSet: () => undefined,
    },
    ...overrides,
  } as unknown as WorkbenchViewModel;

  return renderToStaticMarkup(
    React.createElement(ApplyShotSetPanel, {
      vm,
      onActionComplete: () => undefined,
    }),
  );
}

describe("ApplyShotSetPanel", () => {
  it("removes the force-recreate helper copy for an unchanged active shot set", () => {
    const html = renderPanel({
      shotRows: [
        {
          id: "shot_0",
          orderIndex: 0,
          title: "主体为20-30岁身体前倾",
          defaultDurationSec: 4,
        },
      ],
    } as unknown as Partial<WorkbenchViewModel>);

    assert.match(html, /当前可用分镜链路实例/);
    assert.match(html, /当前可用分镜链路实例已创建/);
    assert.match(html, /可继续制作/);
    assert.doesNotMatch(html, /#0/);
    assert.doesNotMatch(html, /shot-set-shot-card/);
    assert.doesNotMatch(
      html,
      /如需强制重新创建，可手动触发；通常可以继续进入分镜图选择。/,
    );
  });

  it("explains why recreate is disabled while generation is active", () => {
    const html = renderPanel({ hasActiveGeneration: true });

    assert.match(html, /当前分镜生成任务正在执行，请完成后再试。/);
    assert.match(html, /重新创建实例/);
  });

  it("labels an upstream-changed active shot set as needing update", () => {
    const html = renderPanel({
      workspaceStatus: {
        activeShotSet: {
          id: "shot_set_stale",
          createdAt: "2026-06-20T00:00:00.000Z",
          shotCount: 3,
          upstream: { upstreamChanged: true, changedSources: ["shotPrompt"] },
        },
      },
      shotSetHistory: [
        {
          id: "shot_set_stale",
          workspaceId: "ws_1",
          shotPromptArtifactId: "sp_old",
          status: "active",
          sourceFingerprint: {},
          upstream: { upstreamChanged: true, changedSources: ["shotPrompt"] },
          shotCount: 3,
          selectedImageCount: 3,
          selectedVideoCount: 3,
          createdAt: "2026-06-20T00:00:00.000Z",
          archivedAt: null,
          shots: [],
        },
      ],
    } as unknown as Partial<WorkbenchViewModel>);

    assert.match(html, /待更新的分镜链路实例/);
    assert.match(html, /分镜链路实例需要更新/);
    assert.match(html, /上游已变化/);
    assert.match(html, /待归档实例/);
    assert.doesNotMatch(html, /当前生效/);
    assert.doesNotMatch(html, /当前实例/);
  });

  it("renders archived shot set products as read-only downloadable history", () => {
    const html = renderPanel({
      shotSetHistory: [
        {
          id: "shot_set_archive",
          workspaceId: "ws_1",
          shotPromptArtifactId: "sp_old",
          status: "archived",
          sourceFingerprint: {},
          upstream: { upstreamChanged: true, changedSources: ["shotPrompt"] },
          shotCount: 1,
          selectedImageCount: 1,
          selectedVideoCount: 1,
          createdAt: "2026-06-20T00:00:00.000Z",
          archivedAt: "2026-06-21T00:00:00.000Z",
          shots: [
            {
              id: "shot_old",
              workspaceId: "ws_1",
              shotSetId: "shot_set_archive",
              orderIndex: 0,
              title: "历史分镜",
              objective: "旧版本目标",
              defaultDurationSec: 5,
              status: "VIDEO_SELECTED",
              requirements: {
                shotImage: {},
                shotVideo: {},
                sourceShotPromptArtifactId: "sp_old",
              },
              selectedImage: {
                candidateId: "imc_old",
                batchId: "imb_old",
                url: "/api/workspaces/ws_1/materials/history.png",
                width: 720,
                height: 1280,
                status: "SUCCEEDED",
              },
              selectedVideo: {
                candidateId: "vcd_old",
                batchId: "vbb_old",
                url: "/api/workspaces/ws_1/videos/history.mp4",
                thumbnailUrl: null,
                durationSec: 5,
                width: 720,
                height: 1280,
                status: "SUCCEEDED",
              },
              createdAt: "2026-06-20T00:00:00.000Z",
              updatedAt: "2026-06-20T00:00:00.000Z",
            },
          ],
        },
      ],
    } as Partial<WorkbenchViewModel>);

    assert.match(html, /历史分镜实例/);
    assert.match(html, /旧版本产物仅用于查看和下载，不会参与新版本生成。/);
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /只读归档/);
    assert.match(html, /第 1 镜/);
    assert.doesNotMatch(html, /#0/);
    assert.match(html, /下载图片/);
    assert.match(html, /下载视频/);
  });
});
