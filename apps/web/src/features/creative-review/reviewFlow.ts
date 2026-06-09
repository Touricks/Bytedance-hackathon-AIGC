import type { WorkbenchViewModel } from "../workbench/useWorkbenchViewModel.js";

export type ReviewStepId =
  | "requirements"
  | "material"
  | "brief"
  | "storyboard"
  | "shotprompt"
  | "apply"
  | "image"
  | "video"
  | "final";

export type ReviewModuleId = "product-brief" | "storyboard" | "shotprompt";
export type ReviewTone = "idle" | "good" | "busy" | "review" | "danger";

export interface ReviewStepIndicator {
  id: ReviewStepId;
  label: string;
  state: string;
  tone: ReviewTone;
}

export interface CreativeActivity {
  title: string;
  message: string;
  tone: ReviewTone;
  stepId: ReviewStepId;
  action: { label: string; stepId: ReviewStepId } | null;
}

export const materialDeleteResetConfirmMessage =
  "当前素材库已被下游消费，删除该素材将返回模块一";

export const reviewStepOrder: ReviewStepId[] = [
  "requirements",
  "material",
  "brief",
  "storyboard",
  "shotprompt",
  "apply",
  "image",
  "video",
  "final",
];

const imageActiveStatuses = new Set(["IMAGE_PROMPT_PROPOSING", "IMAGE_GENERATING"]);
const videoActiveStatuses = new Set(["VIDEO_SCRIPT_PROPOSING", "VIDEO_GENERATING"]);
const finalVideoActiveStatuses = new Set(["PENDING", "RUNNING"]);
const oneClickStageLabels: Record<string, string> = {
  product_brief: "生成商品卖点",
  storyboard: "生成分镜脚本",
  shotprompt: "生成分镜生成要求",
  shot_set: "应用分镜链路",
  image_selection: "生成并选择分镜图",
  video_selection: "生成并选择分镜视频",
  final_compose: "生成成片",
  completed: "已生成成片",
};

const artifactStatusLabels: Record<string, string> = {
  proposed: "待审核",
  approved: "已生效",
  archived: "已归档",
  failed: "处理失败",
};

function artifactStatusLabel(status: string | null | undefined, fallback: string) {
  if (!status) return fallback;
  return artifactStatusLabels[status] ?? status;
}

export function statusTone(value: string | null | undefined): ReviewTone {
  if (!value) return "idle";
  if (value.includes("FAILED") || value === "failed" || value === "上游已变化") return "danger";
  if (
    value.includes("SELECTED") ||
    value === "approved" ||
    value === "SUCCEEDED" ||
    value === "已确认" ||
    value === "已生效" ||
    value === "已归档" ||
    value === "已创建" ||
    value === "已生成"
  ) {
    return "good";
  }
  if (
    value.includes("GENERATING") ||
    value.includes("PROPOSING") ||
    value === "PENDING" ||
    value === "RUNNING" ||
    value === "WAITING" ||
    value === "PERSISTING" ||
    value === "待提交" ||
    value === "生成中" ||
    value === "等待生成" ||
    value === "等待应用" ||
    value === "可生成"
  ) {
    return "busy";
  }
  if (value === "待审核" || value === "proposed" || value.includes("READY") || value === "PARTIAL") {
    return "review";
  }
  return "idle";
}

function selectionProgressTone(selectedCount: number, totalCount: number): ReviewTone {
  if (totalCount < 1) return "idle";
  return selectedCount === totalCount ? "good" : "busy";
}

function hasImageActivity(vm: WorkbenchViewModel) {
  return (
    Boolean(vm.pending?.image) ||
    vm.shots.some((shot) => imageActiveStatuses.has(shot.status))
  );
}

function hasVideoActivity(vm: WorkbenchViewModel) {
  return (
    Boolean(vm.pending?.video) ||
    vm.shots.some((shot) => videoActiveStatuses.has(shot.status))
  );
}

function hasFinalVideoActivity(vm: WorkbenchViewModel) {
  return (
    Boolean(vm.pending?.finalVideo) ||
    Boolean(vm.pending?.oneClickFinalVideo) ||
    finalVideoActiveStatuses.has(vm.finalVideo?.status ?? "")
  );
}

function oneClickStageLabel(vm: WorkbenchViewModel) {
  const stage = vm.oneClickFinalVideo?.currentStage;
  return stage ? (oneClickStageLabels[stage] ?? stage) : "准备一键成片";
}

function activeShotSetUpstreamChanged(vm: WorkbenchViewModel) {
  return Boolean(vm.workspaceStatus?.activeShotSet?.upstream?.upstreamChanged);
}

function deriveProcessingStep(vm: WorkbenchViewModel): ReviewStepId | null {
  if (vm.pending?.materialIntake) return "material";
  if (vm.pending?.productBrief) return "brief";
  if (vm.pending?.storyboard) return "storyboard";
  if (vm.pending?.shotPrompt) return "shotprompt";
  if (vm.pending?.applyShotSet) return "apply";
  if (hasImageActivity(vm)) return "image";
  if (hasVideoActivity(vm)) return "video";
  if (hasFinalVideoActivity(vm)) return "final";
  return null;
}

export function shouldResetFlowAfterMaterialDelete(
  promptRequirements: { isCurrent?: boolean } | null | undefined,
): boolean {
  return Boolean(promptRequirements?.isCurrent);
}

export function deriveCreativeActivity(vm: WorkbenchViewModel): CreativeActivity {
  const shotCount = vm.shots.length;
  const selectedImageCount = vm.shots.filter((shot) => shot.selectedImageId).length;
  const selectedVideoCount = vm.shots.filter((shot) => shot.selectedVideoId).length;

  if (vm.pending?.materialIntake) {
    return {
      title: "素材解读生成中",
      message: "正在解读上传素材，完成后可以确认素材标签、相关性和主商品素材。",
      tone: "busy",
      stepId: "material",
      action: null,
    };
  }
  if (vm.pending?.productBrief) {
    return {
      title: "商品卖点生成中",
      message: "正在生成商品卖点草稿，完成后可以审核卖点是否准确。",
      tone: "busy",
      stepId: "brief",
      action: null,
    };
  }
  if (vm.pending?.storyboard) {
    return {
      title: "分镜脚本生成中",
      message: "正在生成分镜脚本，完成后可以确认口播、节奏和画面意图。",
      tone: "busy",
      stepId: "storyboard",
      action: null,
    };
  }
  if (vm.pending?.shotPrompt) {
    return {
      title: "分镜生成要求生成中",
      message: "正在生成分镜生成要求，完成后可以检查每个分镜的图像和视频要求。",
      tone: "busy",
      stepId: "shotprompt",
      action: null,
    };
  }
  if (vm.pending?.applyShotSet) {
    return {
      title: "分镜链路创建中",
      message: "正在创建分镜链路实例，完成后可以逐个选择分镜图。",
      tone: "busy",
      stepId: "apply",
      action: null,
    };
  }
  if (vm.pending?.oneClickFinalVideo) {
    return {
      title: "一键成片进行中",
      message: `当前阶段：${oneClickStageLabel(vm)}。全部完成后即可查看成片。`,
      tone: "busy",
      stepId: "final",
      action: null,
    };
  }
  if (activeShotSetUpstreamChanged(vm) && vm.artifacts.shotPrompt?.isCurrent) {
    return {
      title: "分镜链路待应用",
      message: "分镜生成要求已更新，需要重新应用分镜链路实例；旧候选和成片会保留。",
      tone: "danger",
      stepId: "apply",
      action: { label: "去应用", stepId: "apply" },
    };
  }
  if (hasImageActivity(vm)) {
    return {
      title: "分镜图生成中",
      message: "正在生成分镜图候选，完成后可以为当前分镜选择一张图。",
      tone: "busy",
      stepId: "image",
      action: null,
    };
  }
  if (hasVideoActivity(vm)) {
    return {
      title: "分镜视频生成中",
      message: "正在生成分镜视频候选，完成后可以选择可用于成片的视频。",
      tone: "busy",
      stepId: "video",
      action: null,
    };
  }
  if (vm.oneClickFinalVideo?.status === "FAILED") {
    return {
      title: "一键成片失败",
      message:
        vm.oneClickFinalVideo.errorMessage ??
        "一键链路已停止，已生成的中间产物会保留，可回到对应步骤手动继续。",
      tone: "danger",
      stepId: "final",
      action: { label: "查看进度", stepId: "material" },
    };
  }
  if (vm.finalVideo?.localUrl) {
    return {
      title: "成片已生成",
      message: "成片已经生成，可以检查最终视频效果。",
      tone: "good",
      stepId: "final",
      action: { label: "查看成片", stepId: "final" },
    };
  }
  if (hasFinalVideoActivity(vm)) {
    return {
      title: "成片生成中",
      message: "正在生成成片，完成后可以检查最终视频效果。",
      tone: "busy",
      stepId: "final",
      action: null,
    };
  }
  if (!vm.artifacts.promptRequirements?.isCurrent) {
    return {
      title: "创作要求待提交",
      message: "请填写创作要求并上传素材，提交后会进入素材解读。",
      tone: "busy",
      stepId: "requirements",
      action: { label: "去填写", stepId: "requirements" },
    };
  }
  if (!vm.artifacts.material) {
    return {
      title: "素材解读待生成",
      message: "创作要求已提交，可以生成素材解读来确认素材用途。",
      tone: "busy",
      stepId: "material",
      action: { label: "去生成", stepId: "material" },
    };
  }
  if (!vm.artifacts.material.isCurrent) {
    return {
      title: "素材解读待确认",
      message: "请检查素材标签、相关性和主商品素材，确认后会进入商品卖点审核。",
      tone: "review",
      stepId: "material",
      action: { label: "去确认", stepId: "material" },
    };
  }
  if (!vm.artifacts.brief) {
    return {
      title: "商品卖点待生成",
      message: "素材解读已确认，可以生成商品卖点草稿。",
      tone: "busy",
      stepId: "brief",
      action: { label: "去生成", stepId: "brief" },
    };
  }
  if (!vm.artifacts.brief.isCurrent) {
    return {
      title: "商品卖点待审核",
      message: "商品卖点草稿已生成，可以审核卖点是否准确。",
      tone: "review",
      stepId: "brief",
      action: { label: "去审核", stepId: "brief" },
    };
  }
  if (!vm.artifacts.storyboard) {
    return {
      title: "分镜脚本待生成",
      message: "商品卖点已确认，可以生成分镜脚本。",
      tone: "busy",
      stepId: "storyboard",
      action: { label: "去生成", stepId: "storyboard" },
    };
  }
  if (!vm.artifacts.storyboard.isCurrent) {
    return {
      title: "分镜脚本待确认",
      message: "分镜脚本已生成，可以确认口播、节奏和画面意图。",
      tone: "review",
      stepId: "storyboard",
      action: { label: "去确认", stepId: "storyboard" },
    };
  }
  if (!vm.artifacts.shotPrompt) {
    return {
      title: "分镜生成要求待生成",
      message: "分镜脚本已确认，可以生成分镜生成要求。",
      tone: "busy",
      stepId: "shotprompt",
      action: { label: "去生成", stepId: "shotprompt" },
    };
  }
  if (!vm.artifacts.shotPrompt.isCurrent) {
    return {
      title: "分镜生成要求待确认",
      message: "分镜生成要求已生成，可以检查每个分镜的图像和视频要求。",
      tone: "review",
      stepId: "shotprompt",
      action: { label: "去确认", stepId: "shotprompt" },
    };
  }
  if (!vm.workspaceStatus?.activeShotSet) {
    return {
      title: "分镜链路待应用",
      message: "分镜生成要求已确认，可以创建分镜链路实例。",
      tone: "busy",
      stepId: "apply",
      action: { label: "去应用", stepId: "apply" },
    };
  }
  if (shotCount > 0 && selectedImageCount < shotCount) {
    const remaining = shotCount - selectedImageCount;
    return {
      title: "分镜图待选择",
      message: `还有 ${remaining} 个分镜图需要选择，建议按分镜顺序完成。`,
      tone: "busy",
      stepId: "image",
      action: { label: "去选择", stepId: "image" },
    };
  }
  if (shotCount > 0 && selectedVideoCount < shotCount) {
    const remaining = shotCount - selectedVideoCount;
    return {
      title: "分镜视频待选择",
      message: `还有 ${remaining} 个分镜视频需要选择，完成后可以生成成片。`,
      tone: "busy",
      stepId: "video",
      action: { label: "去选择", stepId: "video" },
    };
  }
  if (vm.workflow?.canComposeFinalVideo) {
    return {
      title: "成片可生成",
      message: "分镜视频已选择完成，可以生成成片。",
      tone: "busy",
      stepId: "final",
      action: { label: "去生成", stepId: "final" },
    };
  }
  return {
    title: "创作状态已同步",
    message: "当前创作状态已同步，可以继续查看各审核模块。",
    tone: "good",
    stepId: "final",
    action: null,
  };
}

export function deriveReviewStepIndicators(
  vm: WorkbenchViewModel,
): ReviewStepIndicator[] {
  const moduleIsUpstreamChanged = (moduleId: ReviewModuleId) =>
    moduleUpstreamChanged(vm, moduleId);
  const materialPending = Boolean(vm.pending?.materialIntake);
  const productBriefPending = Boolean(vm.pending?.productBrief);
  const storyboardPending = Boolean(vm.pending?.storyboard);
  const shotPromptPending = Boolean(vm.pending?.shotPrompt);
  const applyShotSetPending = Boolean(vm.pending?.applyShotSet);
  const imageActive = hasImageActivity(vm);
  const videoActive = hasVideoActivity(vm);
  const finalVideoActive = hasFinalVideoActivity(vm);
  const materialNeedsReview = Boolean(
    vm.artifacts.material && !vm.artifacts.material.isCurrent,
  );
  const briefNeedsReview = Boolean(
    vm.artifacts.brief && !vm.artifacts.brief.isCurrent,
  );
  const storyboardNeedsReview = Boolean(
    vm.artifacts.storyboard && !vm.artifacts.storyboard.isCurrent,
  );
  const shotPrompt = vm.artifacts.shotPrompt;
  const shotPromptNeedsReview = Boolean(
    shotPrompt && !shotPrompt.isCurrent,
  );
  const activeShotSetChanged = activeShotSetUpstreamChanged(vm);
  const materialBlocksDownstream = materialPending || materialNeedsReview;
  const shotPromptBlocksDownstream =
    materialBlocksDownstream ||
    productBriefPending ||
    briefNeedsReview ||
    storyboardPending ||
    storyboardNeedsReview;
  const applyBlocksDownstream =
    shotPromptBlocksDownstream ||
    shotPromptPending ||
    shotPromptNeedsReview ||
    moduleIsUpstreamChanged("shotprompt");
  const imageBlocksDownstream =
    applyBlocksDownstream || applyShotSetPending || activeShotSetChanged;
  const videoBlocksDownstream = imageBlocksDownstream || imageActive;
  const finalBlocksDownstream = videoBlocksDownstream || videoActive;
  const defaultStep = deriveActiveStep(vm);
  const selectedImageCount = vm.shots.filter((shot) => shot.selectedImageId).length;
  const selectedVideoCount = vm.shots.filter((shot) => shot.selectedVideoId).length;
  const shotCount = vm.shots.length;
  const steps: Array<Omit<ReviewStepIndicator, "tone"> & { tone?: ReviewTone }> = [
    {
      id: "requirements",
      label: "创作要求与上传素材",
      state: vm.artifacts.promptRequirements?.isCurrent ? "已确认" : "待提交",
    },
    {
      id: "material",
      label: "素材解读",
      state: materialPending
        ? "生成中"
        : productBriefPending || vm.artifacts.material?.isCurrent
          ? "已生效"
          : artifactStatusLabel(vm.artifacts.material?.status, "等待生成"),
    },
    {
      id: "brief",
      label: "商品卖点审核",
      state: productBriefPending
        ? "生成中"
        : materialBlocksDownstream
          ? "上游已变化"
          : briefNeedsReview
            ? artifactStatusLabel(vm.artifacts.brief?.status, "待审核")
            : moduleIsUpstreamChanged("product-brief")
              ? "上游已变化"
              : artifactStatusLabel(vm.artifacts.brief?.status, "等待生成"),
    },
    {
      id: "storyboard",
      label: "分镜脚本",
      state:
        storyboardPending
          ? "生成中"
          : materialBlocksDownstream || productBriefPending || briefNeedsReview
          ? "上游已变化"
          : storyboardNeedsReview
            ? artifactStatusLabel(vm.artifacts.storyboard?.status, "待审核")
            : moduleIsUpstreamChanged("storyboard")
              ? "上游已变化"
              : artifactStatusLabel(vm.artifacts.storyboard?.status, "等待生成"),
    },
    {
      id: "shotprompt",
      label: "分镜生成要求",
      state:
        shotPromptPending
          ? "生成中"
          : shotPromptBlocksDownstream
          ? "上游已变化"
          : shotPromptNeedsReview
            ? artifactStatusLabel(shotPrompt?.status, "待审核")
            : moduleIsUpstreamChanged("shotprompt")
              ? "上游已变化"
              : artifactStatusLabel(shotPrompt?.status, "等待生成"),
    },
    {
      id: "apply",
      label: "应用分镜",
      state: applyBlocksDownstream || activeShotSetChanged
        ? "上游已变化"
        : applyShotSetPending
          ? "生成中"
          : vm.workspaceStatus?.activeShotSet
          ? "已创建"
          : "等待应用",
    },
    {
      id: "image",
      label: "分镜图选择",
      state: imageBlocksDownstream
        ? "上游已变化"
        : imageActive
          ? "生成中"
          : `${selectedImageCount}/${shotCount || 0}`,
      tone: imageBlocksDownstream || imageActive
        ? undefined
        : selectionProgressTone(selectedImageCount, shotCount),
    },
    {
      id: "video",
      label: "分镜视频选择",
      state: videoBlocksDownstream
        ? "上游已变化"
        : videoActive
          ? "生成中"
          : `${selectedVideoCount}/${shotCount || 0}`,
      tone: videoBlocksDownstream || videoActive
        ? undefined
        : selectionProgressTone(selectedVideoCount, shotCount),
    },
    {
      id: "final",
      label: "生成成片",
      state: finalBlocksDownstream
        ? "上游已变化"
        : finalVideoActive
          ? "生成中"
          : vm.finalVideo?.localUrl
          ? "已生成"
          : vm.workflow?.canComposeFinalVideo
            ? "可生成"
            : "等待选择",
      tone: finalBlocksDownstream || finalVideoActive
        ? undefined
        : vm.finalVideo?.localUrl
          ? "good"
          : undefined,
    },
  ];

  return steps.map((step) => {
    const tone = step.tone ?? statusTone(step.state);
    return {
      ...step,
      tone:
        tone === "danger" || canOpenReviewStep(vm, step.id, defaultStep)
          ? tone
          : "idle",
    };
  });
}

export function isTerminalReady(status: string | null | undefined) {
  return status === "SUCCEEDED" || status === "PARTIAL";
}

function stepComesAfter(stepId: ReviewStepId, upstreamStepId: ReviewStepId) {
  return reviewStepOrder.indexOf(stepId) > reviewStepOrder.indexOf(upstreamStepId);
}

function moduleUpstreamChanged(
  vm: WorkbenchViewModel,
  moduleId: ReviewModuleId,
) {
  return Boolean(vm.workspaceStatus?.modules?.[moduleId]?.upstream?.upstreamChanged);
}

function hasBlockingUpstreamBeforeStep(
  vm: WorkbenchViewModel,
  stepId: ReviewStepId,
) {
  if (
    stepComesAfter(stepId, "requirements") &&
    !vm.artifacts.promptRequirements?.isCurrent
  ) {
    return true;
  }
  if (
    stepComesAfter(stepId, "material") &&
    (vm.pending?.materialIntake || !vm.artifacts.material?.isCurrent)
  ) {
    return true;
  }
  if (
    stepComesAfter(stepId, "brief") &&
    (vm.pending?.productBrief ||
      !vm.artifacts.brief?.isCurrent ||
      moduleUpstreamChanged(vm, "product-brief"))
  ) {
    return true;
  }
  if (
    stepComesAfter(stepId, "storyboard") &&
    (vm.pending?.storyboard ||
      !vm.artifacts.storyboard?.isCurrent ||
      moduleUpstreamChanged(vm, "storyboard"))
  ) {
    return true;
  }
  if (
    stepComesAfter(stepId, "shotprompt") &&
    (vm.pending?.shotPrompt ||
      !vm.artifacts.shotPrompt?.isCurrent ||
      moduleUpstreamChanged(vm, "shotprompt"))
  ) {
    return true;
  }
  if (
    stepComesAfter(stepId, "apply") &&
    (vm.pending?.applyShotSet ||
      activeShotSetUpstreamChanged(vm) ||
      !vm.workspaceStatus?.activeShotSet)
  ) {
    return true;
  }
  return false;
}

export function deriveActiveStep(vm: WorkbenchViewModel): ReviewStepId {
  const hasRequirements = Boolean(vm.artifacts.promptRequirements?.isCurrent);
  const materialPending = Boolean(vm.pending?.materialIntake);
  const productBriefPending = Boolean(vm.pending?.productBrief);
  const storyboardPending = Boolean(vm.pending?.storyboard);
  const shotPromptPending = Boolean(vm.pending?.shotPrompt);
  const applyShotSetPending = Boolean(vm.pending?.applyShotSet);
  const imageActive = hasImageActivity(vm);
  const videoActive = hasVideoActivity(vm);
  const material = vm.artifacts.material;
  const brief = vm.artifacts.brief;
  const storyboard = vm.artifacts.storyboard;
  const shotPrompt = vm.artifacts.shotPrompt;
  const hasActiveShotSet = Boolean(vm.workspaceStatus?.activeShotSet);
  const activeShotSetChanged = activeShotSetUpstreamChanged(vm);
  const hasShots = vm.shots.length > 0;
  const allImagesSelected =
    hasShots && vm.shots.every((shot) => Boolean(shot.selectedImageId));
  const allVideosSelected =
    hasShots && vm.shots.every((shot) => Boolean(shot.selectedVideoId));

  if (vm.pending?.oneClickFinalVideo) return "final";
  if (materialPending) return "material";
  if (!hasRequirements) return "requirements";
  if (productBriefPending) return "brief";
  if (!material || !material.isCurrent) return "material";
  if (!brief || !brief.isCurrent) return "brief";
  if (storyboardPending) return "storyboard";
  if (!storyboard || !storyboard.isCurrent) return "storyboard";
  if (shotPromptPending) return "shotprompt";
  if (!shotPrompt || !shotPrompt.isCurrent) return "shotprompt";
  if (applyShotSetPending) return "apply";
  if (!hasActiveShotSet || activeShotSetChanged) return "apply";
  if (imageActive) return "image";
  if (!allImagesSelected) return "image";
  if (videoActive) return "video";
  if (!allVideosSelected) return "video";
  return "final";
}

export function canOpenReviewStep(
  vm: WorkbenchViewModel,
  stepId: ReviewStepId,
  defaultStep: ReviewStepId,
) {
  const defaultIndex = reviewStepOrder.indexOf(defaultStep);
  const stepIndex = reviewStepOrder.indexOf(stepId);
  if (stepIndex <= defaultIndex) return true;
  const processingStep = deriveProcessingStep(vm);
  const activeShotSetChanged = activeShotSetUpstreamChanged(vm);
  if (
    processingStep &&
    stepIndex > reviewStepOrder.indexOf(processingStep)
  ) {
    return false;
  }
  if (hasBlockingUpstreamBeforeStep(vm, stepId)) return false;

  switch (stepId) {
    case "requirements":
      return true;
    case "material":
      return Boolean(vm.artifacts.promptRequirements?.isCurrent) || Boolean(vm.artifacts.material);
    case "brief":
      return Boolean(vm.artifacts.material?.isCurrent) || Boolean(vm.artifacts.brief);
    case "storyboard":
      return Boolean(vm.artifacts.storyboard);
    case "shotprompt":
      return Boolean(vm.artifacts.shotPrompt);
    case "apply":
      return Boolean(vm.artifacts.shotPrompt?.isCurrent);
    case "image":
      return (
        !activeShotSetChanged &&
        (Boolean(vm.workspaceStatus?.activeShotSet) || vm.shots.length > 0)
      );
    case "video":
      return (
        !activeShotSetChanged &&
        vm.shots.some((shot) => Boolean(shot.selectedImageId))
      );
    case "final":
      return !activeShotSetChanged && Boolean(vm.workflow?.canComposeFinalVideo);
  }
}
