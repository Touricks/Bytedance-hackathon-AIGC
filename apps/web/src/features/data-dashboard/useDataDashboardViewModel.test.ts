import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";
import { selectedItem } from "./dashboardFormatters.js";
import {
  dashboardVideoContextFromArtifact,
  deriveDashboardKpis,
  isGroupNotFoundError,
  shouldUseWorkspaceDashboardVideos,
  weightsFor,
} from "./useDataDashboardViewModel.js";

const snapshot = getDashboardAnalyticsSnapshot();
const channelOf = (id: string) =>
  selectedItem(snapshot.channels, id, "channel");

describe("deriveDashboardKpis", () => {
  it("drives KPI values from the selected channel and deltas vs the best channel", () => {
    const kpis = deriveDashboardKpis(snapshot, channelOf("home"));
    const ctr = kpis.find((kpi) => kpi.key === "ctr");
    const roas = kpis.find((kpi) => kpi.key === "roas");
    const gmv = kpis.find((kpi) => kpi.key === "gmv");

    assert.equal(ctr?.displayValue, "2.96%");
    // home CTR 2.96 vs best (mia) 3.42 → -0.46pp, a "bad" delta.
    assert.deepEqual(ctr?.delta, { up: false, tone: "bad", text: "0.46pp" });
    assert.equal(roas?.displayValue, "3.62");
    assert.equal(roas?.delta.text, "1.23");
    assert.equal(gmv?.displayValue, "¥9.4万");
    assert.deepEqual(gmv?.delta, { up: false, tone: "bad", text: "¥3.4万" });
  });

  it("recomputes KPIs when a different channel is selected", () => {
    const homeRoas = deriveDashboardKpis(snapshot, channelOf("home")).find(
      (k) => k.key === "roas",
    );
    const miaRoas = deriveDashboardKpis(snapshot, channelOf("mia")).find(
      (k) => k.key === "roas",
    );
    const miaGmv = deriveDashboardKpis(snapshot, channelOf("mia")).find(
      (k) => k.key === "gmv",
    );

    assert.equal(homeRoas?.displayValue, "3.62");
    assert.equal(miaRoas?.displayValue, "4.85");
    // The best channel has no gap vs itself.
    assert.equal(miaRoas?.delta.text, "0");
    assert.equal(miaRoas?.delta.tone, "good");
    assert.equal(miaGmv?.delta.text, "¥0");
    assert.equal(miaGmv?.delta.tone, "good");
  });

  it("keeps the sparkline + label metadata from the seed", () => {
    const kpis = deriveDashboardKpis(snapshot, channelOf("home"));
    assert.equal(kpis.length, snapshot.kpis.length);
    assert.deepEqual(
      kpis.slice(-2).map((kpi) => kpi.key),
      ["roas", "gmv"],
    );
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
      creativeFactors: {
        productCategory: "mom-baby-pet",
        dealType: "seeding-nonstandard",
        audience: "child",
        strategy: "scenario-demo",
      },
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
      name: "未绑定创作预设",
      status: "none",
    });
  });

  it("falls back gracefully for imported artifacts with unknown attribution factors", () => {
    const context = dashboardVideoContextFromArtifact(snapshot, {
      id: "dash_video_unknown",
      workspaceId: "workspace_123",
      finalVideoJobId: "fv_unknown",
      name: "未知归因成片",
      localUrl: "/api/dashboard/videos/dash_video_unknown/file",
      durationSec: 18,
      width: 1080,
      height: 1920,
      creativeFactors: {
        productCategory: "legacy-product-category",
        dealType: "legacy-deal-type",
        audience: "legacy-audience",
        strategy: "legacy-strategy",
      } as unknown as Parameters<
        typeof dashboardVideoContextFromArtifact
      >[1]["creativeFactors"],
      importedAt: "2026-06-06T08:00:00.000Z",
      createdAt: "2026-06-06T08:00:00.000Z",
      updatedAt: "2026-06-06T08:00:00.000Z",
    });

    assert.equal(context.audienceText, "未归类人群");
  });
});

describe("weightsFor", () => {
  it("leans on ROAS for 效率优先", () => {
    assert.deepEqual(weightsFor("roas"), { roasWeight: 0.8, gmvWeight: 0.2 });
  });

  it("leans on GMV for 规模优先", () => {
    assert.deepEqual(weightsFor("gmv"), { roasWeight: 0.4, gmvWeight: 0.6 });
  });
});

describe("isGroupNotFoundError", () => {
  it("treats a fetchJson 404 as no-data (true)", () => {
    assert.equal(
      isGroupNotFoundError(
        new Error(
          "GET /api/dashboard/recommendations/automotive/impulse-hit failed: 404 not found",
        ),
      ),
      true,
    );
  });

  it("does not swallow other errors", () => {
    assert.equal(
      isGroupNotFoundError(new Error("GET /x failed: 500 boom")),
      false,
    );
    assert.equal(isGroupNotFoundError("nope"), false);
    assert.equal(isGroupNotFoundError(new Error("network down")), false);
  });
});

describe("shouldUseWorkspaceDashboardVideos", () => {
  it("uses the global dashboard registry by default even with a return workspace", () => {
    assert.equal(shouldUseWorkspaceDashboardVideos("global", "workspace_123"), false);
  });

  it("uses workspace-scoped dashboard videos only for explicit workspace scope", () => {
    assert.equal(shouldUseWorkspaceDashboardVideos("workspace", "workspace_123"), true);
    assert.equal(shouldUseWorkspaceDashboardVideos("workspace"), false);
  });
});
