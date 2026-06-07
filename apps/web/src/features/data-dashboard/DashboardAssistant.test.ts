import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardAssistant } from "./DashboardAssistant.js";
import { getDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";

const snapshot = getDashboardAnalyticsSnapshot();

describe("DashboardAssistant", () => {
  it("renders a draggable title handle and cancel zones for controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(DashboardAssistant, {
        presets: snapshot.assistantPresets,
        open: true,
        onOpenChange: () => undefined,
        onAction: () => undefined,
      }),
    );

    assert.match(html, /dash-assistant-drag/);
    assert.doesNotMatch(html, /拖动标题可移动/);
    assert.doesNotMatch(html, /基于诊断结论/);
    assert.match(html, /dash-no-drag/);
    assert.match(html, /问问这条视频该怎么改/);
  });
});
