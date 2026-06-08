import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canOpenReviewStep,
  deriveActiveStep,
  deriveCreativeActivity,
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
    ...overrides,
  } as never;
}

function currentArtifacts() {
  return {
    promptRequirements: { isCurrent: true },
    material: { isCurrent: true, status: "approved" },
    brief: { isCurrent: true, status: "approved" },
    storyboard: { isCurrent: true, status: "approved" },
    shotPrompt: { isCurrent: true, status: "approved" },
  };
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

    assert.deepEqual(
      steps.find((step) => step.id === "brief"),
      {
        id: "brief",
        label: "商品卖点审核",
        state: "上游已变化",
        tone: "danger",
      },
    );
  });

  it("marks user-action waiting states as in progress", () => {
    const initialSteps = deriveReviewStepIndicators(baseViewModel());
    const materialSteps = deriveReviewStepIndicators(
      baseViewModel({
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: null,
          brief: null,
          storyboard: null,
          shotPrompt: { isCurrent: true },
        },
        workspaceStatus: null,
      }),
    );
    const applySteps = deriveReviewStepIndicators(
      baseViewModel({
        artifacts: currentArtifacts(),
      }),
    );
    const finalSteps = deriveReviewStepIndicators(
      baseViewModel({
        artifacts: currentArtifacts(),
        workspaceStatus: { activeShotSet: { id: "shot-set-1" } },
        shots: [{ selectedImageId: "image-1", selectedVideoId: "video-1" }],
        workflow: { canComposeFinalVideo: true },
      }),
    );

    assert.equal(initialSteps.find((step) => step.id === "requirements")?.tone, "busy");
    assert.equal(materialSteps.find((step) => step.id === "material")?.tone, "busy");
    assert.equal(applySteps.find((step) => step.id === "apply")?.tone, "busy");
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
    assert.equal(steps.find((step) => step.id === "material")?.tone, "good");
    assert.equal(steps.find((step) => step.id === "apply")?.tone, "good");
  });

  it("keeps final generation active while one-click final video is running", () => {
    const vm = baseViewModel({
      pending: { oneClickFinalVideo: true },
      oneClickFinalVideo: {
        status: "WAITING",
        currentStage: "image_selection",
      },
      artifacts: currentArtifacts(),
      workspaceStatus: { activeShotSet: { id: "shot_set_1" } },
    });

    const activity = deriveCreativeActivity(vm);
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "final");
    assert.equal(activity.title, "一键成片进行中");
    assert.match(activity.message, /生成并选择分镜图/);
    assert.deepEqual(steps.find((step) => step.id === "final"), {
      id: "final",
      label: "生成成片",
      state: "生成中",
      tone: "busy",
    });
  });

  it("surfaces recoverable one-click failure without clearing intermediate artifacts", () => {
    const vm = baseViewModel({
      oneClickFinalVideo: {
        status: "FAILED",
        currentStage: "video_selection",
        errorMessage: "No succeeded video candidate",
      },
      artifacts: currentArtifacts(),
      workspaceStatus: { activeShotSet: { id: "shot_set_1" } },
      shots: [{ selectedImageId: "image-1", selectedVideoId: null }],
    });

    const activity = deriveCreativeActivity(vm);

    assert.equal(activity.title, "一键成片失败");
    assert.equal(activity.message, "No succeeded video candidate");
    assert.deepEqual(activity.action, { label: "查看进度", stepId: "material" });
  });

  it("keeps material intake active and marks downstream modules stale while regenerating it", () => {
    const vm = baseViewModel({
      pending: { materialIntake: true },
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "material");
    assert.deepEqual(steps.find((step) => step.id === "material"), {
      id: "material",
      label: "素材解读",
      state: "生成中",
      tone: "busy",
    });
    assert.equal(steps.find((step) => step.id === "brief")?.state, "上游已变化");
    assert.equal(steps.find((step) => step.id === "brief")?.tone, "danger");
    assert.equal(
      steps.find((step) => step.id === "storyboard")?.state,
      "上游已变化",
    );
    assert.equal(steps.find((step) => step.id === "storyboard")?.tone, "danger");
    assert.equal(
      steps.find((step) => step.id === "shotprompt")?.state,
      "上游已变化",
    );
    assert.equal(steps.find((step) => step.id === "shotprompt")?.tone, "danger");
  });

  it("waits for user approval when regenerated material intake is proposed", () => {
    const vm = baseViewModel({
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: false, status: "proposed" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: null,
      },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "material");
    assert.equal(steps.find((step) => step.id === "material")?.state, "待审核");
    assert.equal(steps.find((step) => step.id === "material")?.tone, "review");
    assert.equal(steps.find((step) => step.id === "brief")?.state, "上游已变化");
    assert.equal(steps.find((step) => step.id === "brief")?.tone, "danger");
    assert.equal(
      steps.find((step) => step.id === "storyboard")?.state,
      "上游已变化",
    );
    assert.equal(steps.find((step) => step.id === "storyboard")?.tone, "danger");
  });

  it("moves to product brief generation immediately after material intake approval starts", () => {
    const vm = baseViewModel({
      pending: { productBrief: true },
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: false, status: "proposed" },
        brief: null,
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: null,
      },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "brief");
    assert.deepEqual(steps.find((step) => step.id === "brief"), {
      id: "brief",
      label: "商品卖点审核",
      state: "生成中",
      tone: "busy",
    });
    assert.equal(steps.find((step) => step.id === "material")?.tone, "good");
  });

  it("keeps storyboard active while regenerating it from an approved product brief", () => {
    const vm = baseViewModel({
      pending: { storyboard: true },
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: false, status: "proposed" },
      },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "storyboard");
    assert.deepEqual(steps.find((step) => step.id === "storyboard"), {
      id: "storyboard",
      label: "分镜脚本",
      state: "生成中",
      tone: "busy",
    });
    assert.equal(
      steps.find((step) => step.id === "shotprompt")?.state,
      "上游已变化",
    );
    assert.equal(steps.find((step) => step.id === "shotprompt")?.tone, "danger");
  });

  it("keeps shot prompt active while regenerating it over existing downstream results", () => {
    const vm = baseViewModel({
      pending: { shotPrompt: true },
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
      workspaceStatus: { activeShotSet: { id: "old-shot-set" } },
      shots: [
        {
          shotId: "shot-1",
          orderIndex: 0,
          selectedImageId: "image-1",
          selectedVideoId: "video-1",
        },
      ],
      workflow: { canComposeFinalVideo: true },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "shotprompt");
    assert.deepEqual(steps.find((step) => step.id === "shotprompt"), {
      id: "shotprompt",
      label: "分镜生成要求",
      state: "生成中",
      tone: "busy",
    });
    assert.equal(steps.find((step) => step.id === "apply")?.state, "上游已变化");
    assert.equal(steps.find((step) => step.id === "apply")?.tone, "danger");
  });

  it("returns to apply when the current shot prompt supersedes the active shot chain", () => {
    const vm = baseViewModel({
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
      workspaceStatus: {
        activeShotSet: {
          id: "old-shot-set",
          upstream: { upstreamChanged: true },
        },
      },
      shots: [
        {
          shotId: "shot-1",
          orderIndex: 0,
          selectedImageId: "image-1",
          selectedVideoId: "video-1",
        },
      ],
      workflow: { canComposeFinalVideo: true },
      finalVideo: { status: "SUCCEEDED", localUrl: "/workspace/final.mp4" },
    });
    const defaultStep = deriveActiveStep(vm);
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(defaultStep, "apply");
    assert.deepEqual(steps.find((step) => step.id === "apply"), {
      id: "apply",
      label: "应用分镜",
      state: "上游已变化",
      tone: "danger",
    });
    assert.equal(steps.find((step) => step.id === "image")?.state, "上游已变化");
    assert.equal(steps.find((step) => step.id === "video")?.state, "上游已变化");
    assert.equal(steps.find((step) => step.id === "final")?.state, "上游已变化");
    assert.equal(canOpenReviewStep(vm, "image", defaultStep), false);
    assert.equal(canOpenReviewStep(vm, "final", defaultStep), false);
  });

  it("keeps apply active while recreating the shot chain over old selections", () => {
    const vm = baseViewModel({
      pending: { applyShotSet: true },
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
      workspaceStatus: { activeShotSet: { id: "old-shot-set" } },
      shots: [
        {
          shotId: "shot-1",
          orderIndex: 0,
          selectedImageId: "image-1",
          selectedVideoId: "video-1",
        },
      ],
      workflow: { canComposeFinalVideo: true },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "apply");
    assert.deepEqual(steps.find((step) => step.id === "apply"), {
      id: "apply",
      label: "应用分镜",
      state: "生成中",
      tone: "busy",
    });
    assert.equal(steps.find((step) => step.id === "image")?.state, "上游已变化");
    assert.equal(steps.find((step) => step.id === "image")?.tone, "danger");
  });

  it("keeps image selection active while a shot image is regenerating over old selections", () => {
    const vm = baseViewModel({
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
      workspaceStatus: { activeShotSet: { id: "shot-set-1" } },
      shots: [
        {
          shotId: "shot-1",
          orderIndex: 0,
          status: "IMAGE_GENERATING",
          selectedImageId: "old-image-1",
          selectedVideoId: "old-video-1",
        },
      ],
      workflow: { canComposeFinalVideo: true },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "image");
    assert.deepEqual(steps.find((step) => step.id === "image"), {
      id: "image",
      label: "分镜图选择",
      state: "生成中",
      tone: "busy",
    });
    assert.equal(steps.find((step) => step.id === "video")?.state, "上游已变化");
    assert.equal(steps.find((step) => step.id === "video")?.tone, "danger");
  });

  it("keeps video selection active while a shot video is regenerating over old final readiness", () => {
    const vm = baseViewModel({
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
      workspaceStatus: { activeShotSet: { id: "shot-set-1" } },
      shots: [
        {
          shotId: "shot-1",
          orderIndex: 0,
          status: "VIDEO_GENERATING",
          selectedImageId: "image-1",
          selectedVideoId: "old-video-1",
        },
      ],
      workflow: { canComposeFinalVideo: true },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "video");
    assert.deepEqual(steps.find((step) => step.id === "video"), {
      id: "video",
      label: "分镜视频选择",
      state: "生成中",
      tone: "busy",
    });
    assert.equal(steps.find((step) => step.id === "final")?.state, "上游已变化");
    assert.equal(steps.find((step) => step.id === "final")?.tone, "danger");
  });

  it("shows final generation as active while the compose request is starting or running", () => {
    const readyVm = {
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
      workspaceStatus: { activeShotSet: { id: "shot-set-1" } },
      shots: [
        {
          shotId: "shot-1",
          orderIndex: 0,
          status: "VIDEO_SELECTED",
          selectedImageId: "image-1",
          selectedVideoId: "video-1",
        },
      ],
      workflow: { canComposeFinalVideo: true },
    };
    const starting = baseViewModel({
      ...readyVm,
      pending: { finalVideo: true },
    });
    const running = baseViewModel({
      ...readyVm,
      finalVideo: { status: "RUNNING" },
    });

    for (const vm of [starting, running]) {
      const steps = deriveReviewStepIndicators(vm);

      assert.equal(deriveActiveStep(vm), "final");
      assert.deepEqual(steps.find((step) => step.id === "final"), {
        id: "final",
        label: "生成成片",
        state: "生成中",
        tone: "busy",
      });
    }
  });

  it("locks downstream steps while an upstream module is processing", () => {
    const vm = baseViewModel({
      pending: { shotPrompt: true },
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
      workspaceStatus: { activeShotSet: { id: "old-shot-set" } },
      shots: [
        {
          shotId: "shot-1",
          orderIndex: 0,
          selectedImageId: "image-1",
          selectedVideoId: "video-1",
        },
      ],
      workflow: { canComposeFinalVideo: true },
    });
    const defaultStep = deriveActiveStep(vm);

    assert.equal(defaultStep, "shotprompt");
    assert.equal(canOpenReviewStep(vm, "storyboard", defaultStep), true);
    assert.equal(canOpenReviewStep(vm, "shotprompt", defaultStep), true);
    assert.equal(canOpenReviewStep(vm, "apply", defaultStep), false);
    assert.equal(canOpenReviewStep(vm, "image", defaultStep), false);
    assert.equal(canOpenReviewStep(vm, "final", defaultStep), false);
  });

  it("locks downstream steps while an upstream artifact is waiting for review", () => {
    const vm = baseViewModel({
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: true, status: "approved" },
        storyboard: { isCurrent: false, status: "proposed" },
        shotPrompt: { isCurrent: true, status: "approved" },
      },
      workspaceStatus: { activeShotSet: { id: "old-shot-set" } },
      shots: [
        {
          shotId: "shot-1",
          orderIndex: 0,
          selectedImageId: "image-1",
          selectedVideoId: "video-1",
        },
      ],
      workflow: { canComposeFinalVideo: true },
      finalVideo: { status: "SUCCEEDED", localUrl: "/workspace/final.mp4" },
    });
    const defaultStep = deriveActiveStep(vm);

    assert.equal(defaultStep, "storyboard");
    assert.equal(canOpenReviewStep(vm, "storyboard", defaultStep), true);
    assert.equal(canOpenReviewStep(vm, "shotprompt", defaultStep), false);
    assert.equal(canOpenReviewStep(vm, "apply", defaultStep), false);
    assert.equal(canOpenReviewStep(vm, "image", defaultStep), false);
    assert.equal(canOpenReviewStep(vm, "final", defaultStep), false);
  });

  it("shows a proposed product brief for review even when the previous current brief is stale", () => {
    const vm = baseViewModel({
      artifacts: {
        promptRequirements: { isCurrent: true },
        material: { isCurrent: true, status: "approved" },
        brief: { isCurrent: false, status: "proposed" },
        storyboard: { isCurrent: true, status: "approved" },
        shotPrompt: null,
      },
      workspaceStatus: {
        modules: {
          "product-brief": {
            upstream: { upstreamChanged: true },
          },
        },
      },
    });
    const steps = deriveReviewStepIndicators(vm);

    assert.equal(deriveActiveStep(vm), "brief");
    assert.deepEqual(steps.find((step) => step.id === "brief"), {
      id: "brief",
      label: "商品卖点审核",
      state: "待审核",
      tone: "review",
    });
  });

  it("keeps future locked steps idle when they have not started", () => {
    const steps = deriveReviewStepIndicators(baseViewModel());

    assert.equal(steps.find((step) => step.id === "material")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "brief")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "storyboard")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "shotprompt")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "apply")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "image")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "video")?.tone, "idle");
    assert.equal(steps.find((step) => step.id === "final")?.tone, "idle");
  });

  it("marks shot selection progress as busy until every shot has a selection", () => {
    const emptyProgress = deriveReviewStepIndicators(
      baseViewModel({
        artifacts: currentArtifacts(),
        workspaceStatus: { activeShotSet: { id: "shot_set_1" } },
        shots: [{}, {}, {}, {}],
      }),
    );
    const partialProgress = deriveReviewStepIndicators(
      baseViewModel({
        artifacts: currentArtifacts(),
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
        artifacts: currentArtifacts(),
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
        artifacts: currentArtifacts(),
        workspaceStatus: { activeShotSet: { id: "shot-set-1" } },
        shots: [{ selectedImageId: "image-1", selectedVideoId: "video-1" }],
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

describe("deriveCreativeActivity", () => {
  it("explains what is happening while material intake is being generated", () => {
    const activity = deriveCreativeActivity(
      baseViewModel({
        pending: { materialIntake: true },
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: null,
          brief: null,
          storyboard: null,
          shotPrompt: null,
        },
      }),
    );

    assert.deepEqual(activity, {
      title: "素材解读生成中",
      message: "正在解读上传素材，完成后可以确认素材标签、相关性和主商品素材。",
      tone: "busy",
      stepId: "material",
      action: null,
    });
  });

  it("points the merchant to confirm material intake when it is ready for review", () => {
    const activity = deriveCreativeActivity(
      baseViewModel({
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: { isCurrent: false, status: "proposed" },
          brief: null,
          storyboard: null,
          shotPrompt: null,
        },
      }),
    );

    assert.deepEqual(activity, {
      title: "素材解读待确认",
      message: "请检查素材标签、相关性和主商品素材，确认后会进入商品卖点审核。",
      tone: "review",
      stepId: "material",
      action: { label: "去确认", stepId: "material" },
    });
  });

  it("explains product brief generation as a waiting state", () => {
    const activity = deriveCreativeActivity(
      baseViewModel({
        pending: { productBrief: true },
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: { isCurrent: true, status: "approved" },
          brief: null,
          storyboard: null,
          shotPrompt: null,
        },
      }),
    );

    assert.deepEqual(activity, {
      title: "商品卖点生成中",
      message: "正在生成商品卖点草稿，完成后可以审核卖点是否准确。",
      tone: "busy",
      stepId: "brief",
      action: null,
    });
  });

  it("turns partial image selection progress into one next-step notice", () => {
    const activity = deriveCreativeActivity(
      baseViewModel({
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: { isCurrent: true, status: "approved" },
          brief: { isCurrent: true, status: "approved" },
          storyboard: { isCurrent: true, status: "approved" },
          shotPrompt: { isCurrent: true, status: "approved" },
        },
        workspaceStatus: { activeShotSet: { id: "shot-set-1" } },
        shots: [
          { selectedImageId: "image-1" },
          { selectedImageId: "image-2" },
          {},
          {},
        ],
      }),
    );

    assert.deepEqual(activity, {
      title: "分镜图待选择",
      message: "还有 2 个分镜图需要选择，建议按分镜顺序完成。",
      tone: "busy",
      stepId: "image",
      action: { label: "去选择", stepId: "image" },
    });
  });

  it("points to final composition when all shot videos are selected", () => {
    const activity = deriveCreativeActivity(
      baseViewModel({
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: { isCurrent: true, status: "approved" },
          brief: { isCurrent: true, status: "approved" },
          storyboard: { isCurrent: true, status: "approved" },
          shotPrompt: { isCurrent: true, status: "approved" },
        },
        workspaceStatus: { activeShotSet: { id: "shot-set-1" } },
        shots: [
          { selectedImageId: "image-1", selectedVideoId: "video-1" },
          { selectedImageId: "image-2", selectedVideoId: "video-2" },
        ],
        workflow: { canComposeFinalVideo: true },
      }),
    );

    assert.deepEqual(activity, {
      title: "成片可生成",
      message: "分镜视频已选择完成，可以生成成片。",
      tone: "busy",
      stepId: "final",
      action: { label: "去生成", stepId: "final" },
    });
  });

  it("points back to apply when the active shot chain is stale after a final video exists", () => {
    const activity = deriveCreativeActivity(
      baseViewModel({
        artifacts: {
          promptRequirements: { isCurrent: true },
          material: { isCurrent: true, status: "approved" },
          brief: { isCurrent: true, status: "approved" },
          storyboard: { isCurrent: true, status: "approved" },
          shotPrompt: { isCurrent: true, status: "approved" },
        },
        workspaceStatus: {
          activeShotSet: {
            id: "old-shot-set",
            upstream: { upstreamChanged: true },
          },
        },
        shots: [{ selectedImageId: "image-1", selectedVideoId: "video-1" }],
        workflow: { canComposeFinalVideo: true },
        finalVideo: { status: "SUCCEEDED", localUrl: "/workspace/final.mp4" },
      }),
    );

    assert.deepEqual(activity, {
      title: "分镜链路待应用",
      message: "分镜生成要求已更新，需要重新应用分镜链路实例；旧候选和成片会保留。",
      tone: "danger",
      stepId: "apply",
      action: { label: "去应用", stepId: "apply" },
    });
  });

  it("points to the generated final video once it exists", () => {
    const activity = deriveCreativeActivity(
      baseViewModel({
        workflow: { canComposeFinalVideo: true },
        finalVideo: { status: "SUCCEEDED", localUrl: "/workspace/final.mp4" },
      }),
    );

    assert.deepEqual(activity, {
      title: "成片已生成",
      message: "成片已经生成，可以检查最终视频效果。",
      tone: "good",
      stepId: "final",
      action: { label: "查看成片", stepId: "final" },
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
