import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OneClickFinalVideoJob } from "../../lib/api/oneClickFinalVideo.js";
import { deriveOneClickProgress } from "./oneClickProgress.js";

function oneClickJob(
  overrides: Partial<OneClickFinalVideoJob> = {}
): OneClickFinalVideoJob {
  return {
    id: "ocv_123",
    workspaceId: "workspace_123",
    status: "RUNNING",
    currentStage: "product_brief",
    stageState: {},
    materialIntakeArtifactId: "mat_123",
    productBriefArtifactId: null,
    storyboardArtifactId: null,
    shotPromptArtifactId: null,
    shotSetId: null,
    finalVideoJobId: null,
    autoSelectionStrategy: "first_success",
    outputAspectRatio: "9:16",
    errorCode: null,
    errorMessage: null,
    idempotencyKey: "idem_123",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
    startedAt: "2026-06-08T00:00:00.000Z",
    completedAt: null,
    ...overrides
  };
}

describe("deriveOneClickProgress", () => {
  it("starts product brief generation at 10 percent", () => {
    const progress = deriveOneClickProgress(oneClickJob(), 4);

    assert.equal(progress.percent, 10);
    assert.equal(progress.label, "生成商品卖点");
    assert.equal(progress.tone, "busy");
  });

  it("advances through shot image selection with current shot progress", () => {
    const progress = deriveOneClickProgress(
      oneClickJob({
        currentStage: "image_selection",
        stageState: { image: { currentIndex: 1 } }
      }),
      4
    );

    assert.equal(progress.percent, 53);
    assert.equal(progress.label, "生成并选择分镜图");
    assert.equal(progress.detail, "分镜图 2/4");
  });

  it("advances through shot video selection with selected video progress", () => {
    const progress = deriveOneClickProgress(
      oneClickJob({
        currentStage: "video_selection",
        stageState: {
          video: {
            selectedCandidateIdsByShotId: {
              shot_1: "candidate_1",
              shot_2: "candidate_2"
            }
          }
        }
      }),
      4
    );

    assert.equal(progress.percent, 78);
    assert.equal(progress.label, "生成并选择分镜视频");
    assert.equal(progress.detail, "分镜视频 2/4");
  });

  it("shows completed one-click final video at 100 percent", () => {
    const progress = deriveOneClickProgress(
      oneClickJob({ status: "SUCCEEDED", currentStage: "completed" }),
      4
    );

    assert.equal(progress.percent, 100);
    assert.equal(progress.label, "已生成成片");
    assert.equal(progress.tone, "good");
  });

  it("keeps derived progress visible for failed jobs", () => {
    const progress = deriveOneClickProgress(
      oneClickJob({
        status: "FAILED",
        currentStage: "video_selection",
        stageState: {
          video: {
            selectedCandidateIdsByShotId: {
              shot_1: "candidate_1"
            }
          }
        }
      }),
      4
    );

    assert.equal(progress.percent, 71);
    assert.equal(progress.label, "生成并选择分镜视频");
    assert.equal(progress.tone, "danger");
  });
});
