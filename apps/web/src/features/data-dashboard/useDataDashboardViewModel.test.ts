import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";
import { selectedItem } from "./dashboardFormatters.js";
import {
  dashboardVideoContextFromArtifact,
  deriveDashboardKpis,
} from "./useDataDashboardViewModel.js";

const snapshot = getDashboardAnalyticsSnapshot();
const channelOf = (id: string) => selectedItem(snapshot.channels, id, "channel");

describe("deriveDashboardKpis", () => {
  it("drives KPI values from the selected channel and deltas vs the best channel", () => {
    const kpis = deriveDashboardKpis(snapshot, channelOf("home"));
    const ctr = kpis.find((kpi) => kpi.key === "ctr");
    const roas = kpis.find((kpi) => kpi.key === "roas");

    assert.equal(ctr?.displayValue, "2.96%");
    // home CTR 2.96 vs best (mia) 3.42 → -0.46pp, a "bad" delta.
    assert.deepEqual(ctr?.delta, { up: false, tone: "bad", text: "0.46pp" });
    assert.equal(roas?.displayValue, "3.62");
    assert.equal(roas?.delta.text, "1.23");
  });

  it("recomputes KPIs when a different channel is selected", () => {
    const homeRoas = deriveDashboardKpis(snapshot, channelOf("home")).find((k) => k.key === "roas");
    const miaRoas = deriveDashboardKpis(snapshot, channelOf("mia")).find((k) => k.key === "roas");

    assert.equal(homeRoas?.displayValue, "3.62");
    assert.equal(miaRoas?.displayValue, "4.85");
    // The best channel has no gap vs itself.
    assert.equal(miaRoas?.delta.text, "0");
    assert.equal(miaRoas?.delta.tone, "good");
  });

  it("keeps the sparkline + label metadata from the seed", () => {
    const kpis = deriveDashboardKpis(snapshot, channelOf("home"));
    assert.equal(kpis.length, snapshot.kpis.length);
    assert.equal(kpis[0]?.label, "点击率 CTR");
    assert.ok((kpis[0]?.sparkline.length ?? 0) > 0);
  });
});

describe("dashboardVideoContextFromArtifact", () => {
  it("builds the diagnosis video context from an imported dashboard artifact", () => {
    const context = dashboardVideoContextFromArtifact(snapshot, {
      id: "dash_video_1",
      workspaceId: "workspace_123",
      finalVideoJobId: "fv_1",
      name: "618 亲子旅行成片",
      localUrl: "/api/dashboard/videos/dash_video_1/file",
      durationSec: 18,
      width: 1080,
      height: 1920,
      creativeTags: {
        creativeRequirementTemplate: {
          name: "亲子旅行·场景体验",
          status: "applied",
        },
      },
      creativeFactors: {
        productType: "offline-experience-service",
        audience: "child",
        strategy: "scenario-demo",
        visualStyle: "authentic",
      },
      metadata: {},
      importedAt: "2026-06-06T08:00:00.000Z",
      createdAt: "2026-06-06T08:00:00.000Z",
      updatedAt: "2026-06-06T08:00:00.000Z",
    });

    assert.equal(context.name, "618 亲子旅行成片");
    assert.equal(context.filename, "618 亲子旅行成片");
    assert.equal(context.duration, "18s");
    assert.equal(context.localUrl, "/api/dashboard/videos/dash_video_1/file");
    assert.equal(context.audienceText, "儿童");
    assert.deepEqual(context.template, {
      name: "亲子旅行·场景体验",
      status: "applied",
    });
  });
});
