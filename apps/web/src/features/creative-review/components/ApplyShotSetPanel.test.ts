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
    const html = renderPanel();

    assert.match(html, /当前分镜链路实例已创建/);
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
});
