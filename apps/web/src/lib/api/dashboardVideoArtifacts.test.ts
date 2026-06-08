import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  importDashboardVideoArtifact,
  listGlobalDashboardVideoArtifacts,
  listDashboardVideoArtifacts,
} from "./dashboardVideoArtifacts.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("dashboard video artifact api client", () => {
  it("imports a named final video into the dashboard", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(
        JSON.stringify({
          data: {
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
              visualStyle: "authentic",
            },
            metadata: {},
            importedAt: "2026-06-06T08:00:00.000Z",
            createdAt: "2026-06-06T08:00:00.000Z",
            updatedAt: "2026-06-06T08:00:00.000Z",
          },
        }),
        { status: 200 },
      );
    };

    const result = await importDashboardVideoArtifact("workspace_123", {
      finalVideoJobId: "fv_1",
      name: "618 亲子旅行成片",
    });

    assert.equal(result.data.id, "dash_video_1");
    assert.deepEqual(calls, [
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/dashboard/videos",
        body: {
          finalVideoJobId: "fv_1",
          name: "618 亲子旅行成片",
        },
      },
    ]);
  });

  it("lists dashboard video metadata", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(init?.method ?? "GET", "GET");
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/dashboard/videos",
      );
      return new Response(
        JSON.stringify({
          data: [
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
              creativeFactors: null,
              metadata: {},
              importedAt: "2026-06-06T08:00:00.000Z",
              createdAt: "2026-06-06T08:00:00.000Z",
              updatedAt: "2026-06-06T08:00:00.000Z",
            },
          ],
        }),
        { status: 200 },
      );
    };

    const result = await listDashboardVideoArtifacts("workspace_123");

    assert.equal(result.data[0]?.name, "618 亲子旅行成片");
  });

  it("lists global dashboard video metadata", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(init?.method ?? "GET", "GET");
      assert.equal(String(url), "http://localhost:3000/api/dashboard/videos");
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "dash_video_1",
              workspaceId: "workspace_123",
              finalVideoJobId: "fv_1",
              name: "618 亲子旅行成片",
              localUrl: "/api/dashboard/videos/dash_video_1/file",
              durationSec: 18,
              width: 1080,
              height: 1920,
              creativeTags: {},
              creativeFactors: null,
              metadata: {},
              importedAt: "2026-06-06T08:00:00.000Z",
              createdAt: "2026-06-06T08:00:00.000Z",
              updatedAt: "2026-06-06T08:00:00.000Z",
            },
          ],
        }),
        { status: 200 },
      );
    };

    const result = await listGlobalDashboardVideoArtifacts();

    assert.equal(result.data[0]?.localUrl, "/api/dashboard/videos/dash_video_1/file");
  });
});
