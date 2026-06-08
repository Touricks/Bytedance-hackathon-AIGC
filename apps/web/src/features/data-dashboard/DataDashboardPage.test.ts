import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardVideoArtifact } from "../../lib/api/dashboardVideoArtifacts.js";
import { DataDashboardPage } from "./DataDashboardPage.js";

const importedVideo: DashboardVideoArtifact = {
  id: "dash_video_1",
  workspaceId: "workspace_123",
  finalVideoJobId: "fv_1",
  name: "618 亲子旅行成片",
  localUrl: "/api/dashboard/videos/dash_video_1/file",
  durationSec: 18,
  width: 1080,
  height: 1920,
  creativeFactors: {
    productCategory: "mom-baby-pet",
    dealType: "seeding-nonstandard",
    audience: "child",
    strategy: "scenario-demo",
  },
  importedAt: "2026-06-06T08:00:00.000Z",
  createdAt: "2026-06-06T08:00:00.000Z",
  updatedAt: "2026-06-06T08:00:00.000Z",
};

function renderDashboardWithSelectedVideo() {
  return renderToStaticMarkup(
    React.createElement(DataDashboardPage, {
      workspaceId: "workspace_123",
      initialDashboardVideos: [importedVideo],
      initialSelectedDashboardVideoId: importedVideo.id,
    }),
  );
}

describe("DataDashboardPage", () => {
  it("renders the dashboard shell as a single-user workspace page", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, { workspaceId: "workspace_123" }),
    );

    assert.match(html, /分析诊断看板/);
    assert.match(html, /视频列表/);
    assert.match(html, /暂无选中视频/);
    assert.doesNotMatch(html, /UGC_洁面_限时优惠_30s/);
    assert.match(html, /当前用户/);
    assert.match(html, /数据更新于 5 分钟前/);
    assert.match(html, /TikTok Shop · 美国/);
    assert.doesNotMatch(html, /视频复盘 · 推销手法×渠道 · 创作建议/);
    assert.doesNotMatch(html, />工作区</);
    assert.doesNotMatch(html, /管理员|Marketing Team|mock metrics|full mock/i);
    assert.doesNotMatch(html, /设置|导出看板|PDF/);
  });

  it("renders KPI, funnel, and channel comparison sections", () => {
    const html = renderDashboardWithSelectedVideo();

    assert.match(html, /点击率 CTR/);
    assert.match(html, /3秒留存/);
    assert.match(html, /GMV/);
    assert.match(html, /¥9\.4万/);
    assert.match(html, /转化漏斗/);
    assert.match(html, /曝光/);
    assert.match(html, /多渠道对比/);
    assert.match(html, /@Fanshi/);
    assert.match(html, /@Xuanyi/);
    assert.match(html, /@Zihan/);
    assert.match(html, /@Master/);
    assert.doesNotMatch(
      html,
      /@CleanWithMia|@HomeHacks\.Sara|@GlowRoutine|@TidyTok\.Jen/,
    );
  });

  it("renders the strategy matrix with factor artifact explanations", () => {
    const html = renderDashboardWithSelectedVideo();

    assert.match(html, /推销手法 × 量化渠道/);
    assert.match(html, /场景演示/);
    assert.match(html, /痛点解决/);
    assert.match(html, /最优组合/);
    assert.match(
      html,
      /场景进入 -&gt; 过程演示 -&gt; 关键卖点 -&gt; 结果证明 -&gt; 行动引导。/,
    );
    assert.match(
      html,
      /痛点出现 -&gt; 原因解释 -&gt; 解决方式 -&gt; 证据证明 -&gt; 行动引导。/,
    );
  });

  it("renders the diagnosis advisor and the floating creative assistant", () => {
    const html = renderDashboardWithSelectedVideo();

    assert.match(html, /智能创作建议/);
    assert.match(html, /诊断结论/);
    assert.match(html, /换痛点解决预估 ROAS \+27%/);
    assert.doesNotMatch(html, /建议对应内置模板/);
    assert.match(html, /母婴宠物/);
    assert.match(html, /种草型非标品/);
    assert.match(html, /儿童/);
    assert.match(html, /可调杠杆/);
    assert.match(html, /创作助手/);
    assert.match(html, /这条视频该换什么推销手法？/);
    assert.match(html, /哪种推销手法 ROAS 最高？/);
  });

  it("renders imported dashboard video metadata in the video list", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, {
        workspaceId: "workspace_123",
        initialView: "videos",
        initialDashboardVideos: [importedVideo],
      }),
    );

    assert.match(html, /数据面板视频/);
    assert.match(html, /618 亲子旅行成片/);
    assert.match(html, /18s/);
    assert.match(html, /fv_1/);
    assert.match(html, /母婴宠物/);
    assert.match(html, /种草型非标品/);
    assert.match(html, /儿童/);
    assert.match(html, /场景演示/);
    assert.match(html, /poster="data:image\/svg\+xml/);
    assert.match(html, /preload="none"/);
  });

  it("opens the diagnosis view for an imported dashboard video by final video job id", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, {
        workspaceId: "workspace_123",
        initialView: "diagnosis",
        initialDashboardVideos: [importedVideo],
        initialFinalVideoJobId: "fv_1",
      }),
    );

    assert.match(html, /618 亲子旅行成片/);
    assert.match(html, /数据面板导入/);
    assert.doesNotMatch(html, /暂无选中视频/);
  });

  it("keeps the video list usable when imported attribution factors are unknown", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, {
        workspaceId: "workspace_123",
        initialView: "videos",
        initialDashboardVideos: [
          {
            ...importedVideo,
            id: "dash_video_unknown_factors",
            creativeFactors: {
              productCategory: "legacy-product-category",
              dealType: "legacy-deal-type",
              audience: "legacy-audience",
              strategy: "legacy-strategy",
            } as unknown as DashboardVideoArtifact["creativeFactors"],
          },
        ],
      }),
    );

    assert.match(html, /未归类商品类目/);
    assert.match(html, /未归类成交类型/);
    assert.match(html, /未归类人群/);
    assert.match(html, /未归类推销手法/);
    assert.match(html, /poster="data:image\/svg\+xml/);
    assert.match(html, /preload="none"/);
  });

  it("renders an empty video list without falling back to seed videos", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, {
        workspaceId: "workspace_123",
        initialView: "videos",
        initialDashboardVideos: [],
      }),
    );

    assert.match(html, /暂无数据面板视频/);
    assert.doesNotMatch(html, /UGC_洁面_限时优惠_30s/);
    assert.doesNotMatch(html, /口播_洁面_立即购买_15s/);
  });
});
