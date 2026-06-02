import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveReviewStepIndicators,
  materialDeleteResetConfirmMessage,
  shouldResetFlowAfterMaterialDelete,
} from "./reviewFlow.js";

function baseViewModel(overrides: Record<string, unknown> = {}) {
  return {
    artifacts: {
      promptRequirements: null,
      material: null,
      brief: null,
      storyboard: null,
      shotPrompt: null,
    },
    workspaceStatus: null,
    shots: [],
    workflow: null,
    finalVideo: null,
    ...overrides,
  } as never;
}

describe("deriveReviewStepIndicators", () => {
  it("marks a completed module as stale when upstream data changed", () => {
    const steps = deriveReviewStepIndicators(
      baseViewModel({
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: { isCurrent: true },
          brief: { isCurrent: true, status: "approved" },
          storyboard: null,
          shotPrompt: null,
        },
        workspaceStatus: {
          modules: {
            "product-brief": {
              upstream: { upstreamChanged: true },
            },
          },
        },
      }),
    );

    assert.deepEqual(steps.find((step) => step.id === "brief"), {
      id: "brief",
      label: "商品卖点审核",
      state: "上游已变化",
      tone: "danger",
    });
  });

  it("marks reachable user-action waiting states as in progress", () => {
    const initialSteps = deriveReviewStepIndicators(baseViewModel());
    const finalSteps = deriveReviewStepIndicators(
      baseViewModel({
        workflow: { canComposeFinalVideo: true },
      }),
    );

    assert.equal(initialSteps.find((step) => step.id === "requirements")?.tone, "busy");
    assert.equal(finalSteps.find((step) => step.id === "final")?.tone, "busy");
  });

  it("marks completed workflow checkpoints as done", () => {
    const steps = deriveReviewStepIndicators(
      baseViewModel({
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: { isCurrent: true },
          brief: { isCurrent: true, status: "approved" },
          storyboard: { isCurrent: true, status: "approved" },
          shotPrompt: { isCurrent: true, status: "approved" },
        },
        workspaceStatus: { activeShotSet: { id: "shot_set_1" } },
      }),
    );

    assert.equal(steps.find((step) => step.id === "requirements")?.tone, "good");
  });

  it("keeps future locked steps idle when they have not started", () => {
    const steps = deriveReviewStepIndicators(baseViewModel());

    assert.equal(steps.find((step) => step.id === "brief")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "storyboard")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "shotprompt")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "image")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "video")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "final")?.tone, "idle");
  });

  it("marks shot selection progress as busy until every shot has a selection", () => {
    const emptyProgress = deriveReviewStepIndicators(
      baseViewModel({
        workspaceStatus: { activeShotSet: { id: "shot_set_1" } },
        shots: [{}, {}, {}, {}],
      }),
    );
    const partialProgress = deriveReviewStepIndicators(
      baseViewModel({
        workspaceStatus: { activeShotSet: { id: "shot_set_1" } },
        shots: [
          { selectedImageId: "image_1" },
          { selectedImageId: "image_2" },
          {},
          {},
        ],
      }),
    );
    const completeProgress = deriveReviewStepIndicators(
      baseViewModel({
        workspaceStatus: { activeShotSet: { id: "shot_set_1" } },
        shots: [
          { selectedImageId: "image_1", selectedVideoId: "video_1" },
          { selectedImageId: "image_2", selectedVideoId: "video_2" },
          { selectedImageId: "image_3", selectedVideoId: "video_3" },
          { selectedImageId: "image_4", selectedVideoId: "video_4" },
        ],
      }),
    );

    assert.equal(emptyProgress.find((step) => step.id === "image")?.tone, "busy");
    assert.equal(partialProgress.find((step) => step.id === "image")?.tone, "busy");
    assert.equal(completeProgress.find((step) => step.id === "image")?.tone, "good");
    assert.equal(completeProgress.find((step) => step.id === "video")?.tone, "good");
  });

  it("marks the final video step complete once a final video URL exists", () => {
    const steps = deriveReviewStepIndicators(
      baseViewModel({
        workflow: { canComposeFinalVideo: true },
        finalVideo: { status: "SUCCEEDED", localUrl: "/workspace/final.mp4" },
      }),
    );

    assert.deepEqual(steps.find((step) => step.id === "final"), {
      id: "final",
      label: "生成成片",
      state: "已生成",
      tone: "good",
    });
  });
});

describe("shouldResetFlowAfterMaterialDelete", () => {
  it("uses the downstream-consumption warning copy for the confirm dialog", () => {
    assert.equal(
      materialDeleteResetConfirmMessage,
      "当前素材库已被下游消费，删除该素材将返回模块一",
    );
  });

  it("requires confirmation and first-step reset after requirements are current", () => {
    assert.equal(shouldResetFlowAfterMaterialDelete({ isCurrent: true }), true);
  });

  it("does not reset the flow before requirements are submitted", () => {
    assert.equal(shouldResetFlowAfterMaterialDelete(null), false);
    assert.equal(shouldResetFlowAfterMaterialDelete({ isCurrent: false }), false);
  });
});
