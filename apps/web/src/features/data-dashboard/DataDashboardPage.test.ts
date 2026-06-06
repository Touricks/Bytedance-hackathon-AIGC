import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataDashboardPage } from "./DataDashboardPage.js";

describe("DataDashboardPage", () => {
  it("renders the dashboard shell as a single-user workspace page", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, { workspaceId: "workspace_123" }),
    );

    assert.match(html, /分析诊断看板/);
    assert.match(html, /视频列表/);
    assert.match(html, /UGC_洁面_限时优惠_30s_v3/);
    assert.match(html, /当前用户/);
    assert.match(html, /数据更新于 5 分钟前/);
    assert.match(html, /TikTok Shop · 美国/);
    assert.doesNotMatch(html, /管理员|Marketing Team|mock metrics|full mock/i);
  });

  it("renders KPI, funnel, and channel comparison sections", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, { workspaceId: "workspace_123" }),
    );

    assert.match(html, /点击率 CTR/);
    assert.match(html, /3秒留存/);
    assert.match(html, /转化漏斗/);
    assert.match(html, /曝光/);
    assert.match(html, /多渠道对比/);
    assert.match(html, /@CleanWithMia/);
  });

  it("renders the strategy matrix with factor artifact explanations", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, { workspaceId: "workspace_123" }),
    );

    assert.match(html, /推销手法 × 渠道矩阵/);
    assert.match(html, /场景演示/);
    assert.match(html, /痛点解决/);
    assert.match(html, /当前视频/);
    assert.match(html, /推荐替换/);
    assert.match(html, /场景进入 -&gt; 过程演示 -&gt; 关键卖点 -&gt; 结果证明 -&gt; 行动引导。/);
    assert.match(html, /痛点出现 -&gt; 原因解释 -&gt; 解决方式 -&gt; 证据证明 -&gt; 行动引导。/);
  });

  it("renders the diagnosis advisor and assistant presets", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, { workspaceId: "workspace_123" }),
    );

    assert.match(html, /诊断建议/);
    assert.match(html, /换痛点解决预估 ROAS \+27%/);
    assert.match(html, /推荐模板/);
    assert.match(html, /快消种草·青年/);
    assert.match(html, /创作助手/);
    assert.match(html, /这条视频该换什么推销手法？/);
    assert.match(html, /哪种推销手法 ROAS 最高？/);
  });

  it("renders imported dashboard video metadata in the video list", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, {
        workspaceId: "workspace_123",
        initialView: "videos",
        initialDashboardVideos: [
          {
            id: "dash_video_1",
            workspaceId: "workspace_123",
            finalVideoJobId: "fv_1",
            name: "618 亲子旅行成片",
            localUrl: "/api/workspaces/workspace_123/final-videos/fv_1/file",
            durationSec: 18,
            width: 1080,
            height: 1920,
            creativeTags: {},
            creativeFactors: {
              productType: "offline-experience-service",
              audience: "child",
              strategy: "scenario-demo",
            },
            metadata: {},
            importedAt: "2026-06-06T08:00:00.000Z",
            createdAt: "2026-06-06T08:00:00.000Z",
            updatedAt: "2026-06-06T08:00:00.000Z",
          },
        ],
      }),
    );

    assert.match(html, /数据面板视频/);
    assert.match(html, /618 亲子旅行成片/);
    assert.match(html, /18s/);
    assert.match(html, /fv_1/);
    assert.match(html, /线下体验服务/);
    assert.match(html, /儿童/);
    assert.match(html, /场景演示/);
  });
});
