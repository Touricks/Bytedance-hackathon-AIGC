import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import {
  createOneClickFinalVideo,
  getOneClickFinalVideo,
  listOneClickFinalVideos,
} from "./oneClickFinalVideo.js";

const originalFetch = globalThis.fetch;

const sampleMaterial: MaterialIntakeArtifact = {
  scannedAt: "2026-06-04T00:00:00.000Z",
  primaryProductRef: "product.png",
  assets: [
    {
      ref: "product.png",
      kind: "image",
      mime: "image/png",
      bytes: 1024,
      sha256: "a".repeat(64),
      role: "product_main",
      description: "主商品素材",
      relevance: "high",
      usable: true,
      included: true,
    },
  ],
  rejected: [],
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("one-click final video api client", () => {
  it("creates one-click final video jobs with draft material intake and idempotency key", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        headers: init?.headers,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "ocv_123",
            workspaceId: "workspace_123",
            status: "PENDING",
            currentStage: "product_brief",
            stageState: {},
            materialIntakeArtifactId: "mat_123",
            productBriefArtifactId: null,
            storyboardArtifactId: null,
            shotPromptArtifactId: null,
            shotSetId: null,
            finalVideoJobId: null,
            autoSelectionStrategy: "first_success",
            outputAspectRatio: "16:9",
            errorCode: null,
            errorMessage: null,
            idempotencyKey: "idem_123",
            createdAt: "2026-06-04T00:00:00.000Z",
            updatedAt: "2026-06-04T00:00:00.000Z",
            startedAt: "2026-06-04T00:00:00.000Z",
            completedAt: null,
          },
        }),
        { status: 200 },
      );
    };

    const result = await createOneClickFinalVideo(
      "workspace_123",
      {
        materialIntake: { data: sampleMaterial },
        outputAspectRatio: "16:9",
        autoSelectionStrategy: "first_success",
      },
      "idem_123",
    );

    assert.equal(result.data.id, "ocv_123");
    assert.deepEqual(calls, [
      {
        method: "POST",
        url: "http://localhost:3000/api/workspaces/workspace_123/one-click-final-videos",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem_123",
        },
        body: {
          materialIntake: { data: sampleMaterial },
          outputAspectRatio: "16:9",
          autoSelectionStrategy: "first_success",
        },
      },
    ]);
  });

  it("fetches one-click jobs for refresh recovery", async () => {
    const calls: unknown[] = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(url) });
      const job = {
        id: "ocv_123",
        workspaceId: "workspace_123",
        status: "WAITING",
        currentStage: "video_selection",
        stageState: {},
        materialIntakeArtifactId: "mat_123",
        productBriefArtifactId: "brief_123",
        storyboardArtifactId: "story_123",
        shotPromptArtifactId: "shotprompt_123",
        shotSetId: "shotset_123",
        finalVideoJobId: null,
        autoSelectionStrategy: "first_success",
        outputAspectRatio: "9:16",
        errorCode: null,
        errorMessage: null,
        idempotencyKey: "idem_123",
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
        startedAt: "2026-06-04T00:00:00.000Z",
        completedAt: null,
      };
      return new Response(
        JSON.stringify({
          data: String(url).includes("/workspaces/") ? [job] : job,
        }),
        { status: 200 },
      );
    };

    const list = await listOneClickFinalVideos("workspace_123");
    const detail = await getOneClickFinalVideo("ocv_123");

    assert.equal(list.data[0]?.status, "WAITING");
    assert.equal(detail.data.id, "ocv_123");
    assert.deepEqual(calls, [
      {
        method: "GET",
        url: "http://localhost:3000/api/workspaces/workspace_123/one-click-final-videos",
      },
      {
        method: "GET",
        url: "http://localhost:3000/api/one-click-final-videos/ocv_123",
      },
    ]);
  });
});
