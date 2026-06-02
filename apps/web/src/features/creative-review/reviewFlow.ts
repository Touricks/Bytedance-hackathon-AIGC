import type { WorkbenchViewModel } from "../workbench/useWorkbenchViewModel.js";

export type ReviewStepId =
  | "requirements"
  | "brief"
  | "storyboard"
  | "shotprompt"
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

export const materialDeleteResetConfirmMessage =
  "当前素材库已被下游消费，删除该素材将返回模块一";

export const reviewStepOrder: ReviewStepId[] = [
  "requirements",
  "brief",
  "storyboard",
  "shotprompt",
  "image",
  "video",
  "final",
];

export function statusTone(value: string | null | undefined): ReviewTone {
  if (!value) return "idle";
  if (value.includes("FAILED") || value === "failed" || value === "上游已变化") return "danger";
  if (
    value.includes("SELECTED") ||
    value === "approved" ||
    value === "SUCCEEDED" ||
    value === "已确认" ||
    value === "已生效" ||
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
    value === "待提交" ||
    value === "等待生成" ||
    value === "等待应用" ||
    value === "可生成"
  ) {
    return "busy";
  }
  if (value === "proposed" || value.includes("READY") || value === "PARTIAL") {
    return "review";
  }
  return "idle";
}

function selectionProgressTone(selectedCount: number, totalCount: number): ReviewTone {
  if (totalCount < 1) return "idle";
  return selectedCount === totalCount ? "good" : "busy";
}

export function shouldResetFlowAfterMaterialDelete(
  promptRequirements: { isCurrent?: boolean } | null | undefined,
): boolean {
  return Boolean(promptRequirements?.isCurrent);
}

export function deriveReviewStepIndicators(
  vm: WorkbenchViewModel,
): ReviewStepIndicator[] {
  const moduleUpstreamChanged = (moduleId: ReviewModuleId) =>
    Boolean(vm.workspaceStatus?.modules?.[moduleId]?.upstream?.upstreamChanged);
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
      id: "brief",
      label: "商品卖点审核",
      state: moduleUpstreamChanged("product-brief")
        ? "上游已变化"
        : (vm.artifacts.brief?.status ?? "等待生成"),
    },
    {
      id: "storyboard",
      label: "分镜规划",
      state: moduleUpstreamChanged("storyboard")
        ? "上游已变化"
        : (vm.artifacts.storyboard?.status ?? "等待生成"),
    },
    {
      id: "shotprompt",
      label: "分镜生成要求",
      state: moduleUpstreamChanged("shotprompt")
        ? "上游已变化"
        : (vm.artifacts.shotPrompt?.status ?? "等待生成"),
    },
    {
      id: "image",
      label: "分镜图选择",
      state: `${selectedImageCount}/${shotCount || 0}`,
      tone: selectionProgressTone(selectedImageCount, shotCount),
    },
    {
      id: "video",
      label: "分镜视频选择",
      state: `${selectedVideoCount}/${shotCount || 0}`,
      tone: selectionProgressTone(selectedVideoCount, shotCount),
    },
    {
      id: "final",
      label: "生成成片",
      state: vm.finalVideo?.localUrl
        ? "已生成"
        : vm.workflow?.canComposeFinalVideo
          ? "可生成"
          : "等待选择",
      tone: vm.finalVideo?.localUrl ? "good" : undefined,
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

export function deriveActiveStep(vm: WorkbenchViewModel): ReviewStepId {
  const hasRequirements = Boolean(vm.artifacts.promptRequirements?.isCurrent);
  const brief = vm.artifacts.brief;
  const storyboard = vm.artifacts.storyboard;
  const shotPrompt = vm.artifacts.shotPrompt;
  const hasActiveShotSet = Boolean(vm.workspaceStatus?.activeShotSet);
  const hasShots = vm.shots.length > 0;
  const allImagesSelected =
    hasShots && vm.shots.every((shot) => Boolean(shot.selectedImageId));
  const allVideosSelected =
    hasShots && vm.shots.every((shot) => Boolean(shot.selectedVideoId));

  if (!hasRequirements || !brief) return "requirements";
  if (!brief.isCurrent) return "brief";
  if (!storyboard || !storyboard.isCurrent) return "storyboard";
  if (!shotPrompt || !shotPrompt.isCurrent || !hasActiveShotSet) return "shotprompt";
  if (!allImagesSelected) return "image";
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

  switch (stepId) {
    case "requirements":
      return true;
    case "brief":
      return Boolean(vm.artifacts.brief);
    case "storyboard":
      return Boolean(vm.artifacts.storyboard);
    case "shotprompt":
      return Boolean(vm.artifacts.shotPrompt);
    case "image":
      return Boolean(vm.workspaceStatus?.activeShotSet) || vm.shots.length > 0;
    case "video":
      return vm.shots.some((shot) => Boolean(shot.selectedImageId));
    case "final":
      return Boolean(vm.workflow?.canComposeFinalVideo);
  }
}
