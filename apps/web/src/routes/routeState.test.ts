import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dashboardPath, resolveAppRoute, workspacePath } from "./routeState.js";

describe("resolveAppRoute", () => {
  it("opens the main workspace landing by default", () => {
    assert.deepEqual(resolveAppRoute("/"), {
      type: "workspaces-landing",
    });
    assert.deepEqual(resolveAppRoute("/workspaces"), {
      type: "workspaces-landing",
    });
  });

  it("routes the standalone dashboard path away from the 创作审核台", () => {
    assert.deepEqual(resolveAppRoute("/dashboard"), {
      type: "data-dashboard",
      dashboardScope: "global",
    });
    assert.deepEqual(resolveAppRoute("/dashboard/ws_123"), {
      type: "data-dashboard",
      dashboardScope: "global",
      returnWorkspaceId: "ws_123",
    });
    assert.deepEqual(resolveAppRoute("/dashboard", "?view=videos"), {
      type: "data-dashboard",
      dashboardScope: "global",
      initialView: "videos",
    });
    assert.deepEqual(
      resolveAppRoute(
        "/dashboard",
        "?view=diagnosis&videoId=dash_1&finalVideoJobId=fv_1&returnWorkspaceId=ws_123",
      ),
      {
        type: "data-dashboard",
        dashboardScope: "global",
        returnWorkspaceId: "ws_123",
        initialView: "diagnosis",
        initialDashboardVideoId: "dash_1",
        initialFinalVideoJobId: "fv_1",
      },
    );
    assert.deepEqual(resolveAppRoute("/dashboard/ws_123", "?scope=workspace&view=videos"), {
      type: "data-dashboard",
      workspaceId: "ws_123",
      dashboardScope: "workspace",
      initialView: "videos",
    });
  });

  it("keeps the base workspace path on the 创作审核台", () => {
    assert.deepEqual(resolveAppRoute("/workspaces/ws_123"), {
      type: "creative-review",
      workspaceId: "ws_123",
    });
  });

  it("builds canonical workspace routes for the merged router", () => {
    assert.equal(workspacePath("ws_123"), "/workspaces/ws_123");
    assert.equal(dashboardPath(), "/dashboard");
    assert.equal(dashboardPath("ws_123"), "/dashboard?returnWorkspaceId=ws_123");
    assert.equal(dashboardPath(undefined, "videos"), "/dashboard?view=videos");
    assert.equal(
      dashboardPath("ws_123", "videos"),
      "/dashboard?view=videos&returnWorkspaceId=ws_123",
    );
    assert.equal(
      dashboardPath("ws_123", "diagnosis", "fv_1", "dash_1"),
      "/dashboard?view=diagnosis&videoId=dash_1&finalVideoJobId=fv_1&returnWorkspaceId=ws_123",
    );
    assert.equal(
      dashboardPath("ws_123", "videos", undefined, undefined, { scope: "workspace" }),
      "/dashboard/ws_123?view=videos&scope=workspace",
    );
  });
});
