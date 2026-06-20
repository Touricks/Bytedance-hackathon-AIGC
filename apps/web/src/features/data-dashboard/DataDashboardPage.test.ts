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

const otherWorkspaceVideo: DashboardVideoArtifact = {
  ...importedVideo,
  id: "dash_video_2",
  workspaceId: "workspace_other",
  finalVideoJobId: "fv_2",
  name: "其它工作区成片",
  localUrl: "/api/dashboard/videos/dash_video_2/file",
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

  it("renders the live 适用人群 × 推销手法 effect matrix card", () => {
    // SSR runs no effects, so the engine fetch never resolves: the live combo
    // matrix shows its no-data placeholder. The static 推销手法 × 渠道 heatmap is
    // gone. (The rendered grid is covered in DashboardComboMatrix.test.ts.)
    const html = renderDashboardWithSelectedVideo();

    assert.match(html, /适用人群 × 推销手法 · 效果矩阵/);
    assert.match(html, /分组暂无足够投放数据/);
    // The static 推销手法 \ 渠道 heatmap corner is gone.
    assert.doesNotMatch(html, /推销手法 \\ 渠道/);
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
    // "可调杠杆" (prototype-only lever framing + its seed diagnosis card) is removed.
    assert.doesNotMatch(html, /可调杠杆/);
    assert.match(html, /创作助手/);
    assert.match(html, /这条视频该换什么推销手法？/);
    assert.match(html, /哪种推销手法 ROAS 最高？/);
  });

  it("marks engine surfaces 基于推荐引擎 and frontend-seed surfaces 演示功能", () => {
    const html = renderDashboardWithSelectedVideo();

    // Engine outputs (matrix + 策略推荐) are emphasized as 基于推荐引擎.
    assert.match(html, /基于推荐引擎/);
    // Frontend-seed panels are explicitly flagged 演示功能.
    assert.match(html, /演示功能/);
    // The 基于推荐引擎 (real) marker leads the matrix card; the 演示功能 marker tags
    // the demo KPI caption — both present in the same render.
    assert.match(html, /核心指标/);
  });

  it("renders the live 策略推荐 panel with its weight toggle and empty placeholder", () => {
    // SSR runs no effects, so the engine fetch never resolves: the live panel
    // renders its weight toggle plus the no-data placeholder without throwing.
    const html = renderDashboardWithSelectedVideo();

    assert.match(html, /策略推荐/);
    assert.match(html, /效率优先/);
    assert.match(html, /规模优先/);
    assert.match(html, /分组暂无足够投放数据/);
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

  it("opens a workspace-return dashboard deep link without hiding other videos", () => {
    const html = renderToStaticMarkup(
      React.createElement(DataDashboardPage, {
        returnWorkspaceId: "workspace_123",
        initialView: "diagnosis",
        initialDashboardVideos: [importedVideo, otherWorkspaceVideo],
        initialDashboardVideoId: "dash_video_1",
        initialFinalVideoJobId: "fv_1",
      }),
    );

    assert.match(html, /618 亲子旅行成片/);
    assert.match(html, /数据面板视频库，共 2 条/);
    assert.match(html, /切换视频/);
    assert.match(html, /创作审核台/);
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
