import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  proposeVideoScript,
  regenerateVideoCandidates,
  regenerateVideoScript,
} from "./videoScript.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("video script api client", () => {
  it("proposes video scripts with candidate count", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/shots/shot_1/video-scripts/propose",
      );
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        userDirection: "镜头节奏更稳",
        candidateCount: 3,
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "art_vid_1",
            shotId: "shot_1",
            version: 1,
            status: "ACTIVE",
            durationSec: 4,
            scriptJson: {},
            providerPrompt: "分镜视频提示",
            basedOnImageCandidateId: "imc_1",
            basedOnPrevImageCandidateId: null,
            basedOnNextImageCandidateId: null,
            createdBy: "system",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
          artifact: {
            id: "art_vid_1",
            shotId: "shot_1",
            version: 1,
            status: "ACTIVE",
            durationSec: 4,
            scriptJson: {},
            providerPrompt: "分镜视频提示",
            basedOnImageCandidateId: "imc_1",
            basedOnPrevImageCandidateId: null,
            basedOnNextImageCandidateId: null,
            createdBy: "system",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
          batch: {},
          candidates: [],
        }),
        { status: 200 },
      );
    };

    const result = await proposeVideoScript("workspace_123", "shot_1", {
      userDirection: "镜头节奏更稳",
      candidateCount: 3,
    });

    assert.equal(result.data.id, "art_vid_1");
  });

  it("regenerates video scripts with required feedback candidate and text", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/shots/shot_1/video-scripts/regenerate",
      );
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        baseArtifactId: "art_vid_base",
        feedbackVideoCandidateId: "vcd_feedback",
        userDirection: "镜头慢一点，不要突然拉远",
        candidateCount: 2,
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "art_vid_next",
            shotId: "shot_1",
            version: 2,
            status: "ACTIVE",
            durationSec: 4,
            scriptJson: {},
            providerPrompt: "重新生成后的分镜视频提示",
            basedOnImageCandidateId: "imc_1",
            basedOnPrevImageCandidateId: null,
            basedOnNextImageCandidateId: null,
            createdBy: "user",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
          artifact: {
            id: "art_vid_next",
            shotId: "shot_1",
            version: 2,
            status: "ACTIVE",
            durationSec: 4,
            scriptJson: {},
            providerPrompt: "重新生成后的分镜视频提示",
            basedOnImageCandidateId: "imc_1",
            basedOnPrevImageCandidateId: null,
            basedOnNextImageCandidateId: null,
            createdBy: "user",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
          batch: {},
          candidates: [],
        }),
        { status: 200 },
      );
    };

    const result = await regenerateVideoScript("workspace_123", "shot_1", {
      baseArtifactId: "art_vid_base",
      feedbackVideoCandidateId: "vcd_feedback",
      userDirection: "镜头慢一点，不要突然拉远",
      candidateCount: 2,
    });

    assert.equal(result.data.id, "art_vid_next");
  });

  it("regenerates video candidates without requiring a feedback candidate", async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "http://localhost:3000/api/workspaces/workspace_123/shots/shot_1/video-candidates/regenerate",
      );
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        userDirection: "重新抽当前视频",
        candidateCount: 2,
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "art_vid_reroll",
            shotId: "shot_1",
            version: 3,
            status: "ACTIVE",
            durationSec: 4,
            scriptJson: {},
            providerPrompt: "重抽后的分镜视频提示",
            basedOnImageCandidateId: "imc_1",
            basedOnPrevImageCandidateId: null,
            basedOnNextImageCandidateId: null,
            createdBy: "user",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
          artifact: {
            id: "art_vid_reroll",
            shotId: "shot_1",
            version: 3,
            status: "ACTIVE",
            durationSec: 4,
            scriptJson: {},
            providerPrompt: "重抽后的分镜视频提示",
            basedOnImageCandidateId: "imc_1",
            basedOnPrevImageCandidateId: null,
            basedOnNextImageCandidateId: null,
            createdBy: "user",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
          batch: {},
          candidates: [],
        }),
        { status: 200 },
      );
    };

    const result = await regenerateVideoCandidates("workspace_123", "shot_1", {
      userDirection: "重新抽当前视频",
      candidateCount: 2,
    });

    assert.equal(result.data.id, "art_vid_reroll");
  });
});
