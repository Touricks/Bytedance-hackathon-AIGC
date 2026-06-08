import type { OneClickFinalVideoJob } from "../../lib/api/oneClickFinalVideo.js";

export type OneClickProgressTone = "busy" | "good" | "danger";

export interface OneClickProgress {
  percent: number;
  label: string;
  detail: string;
  tone: OneClickProgressTone;
}

export const oneClickStageLabels: Record<string, string> = {
  product_brief: "生成商品卖点",
  storyboard: "生成分镜脚本",
  shotprompt: "生成分镜生成要求",
  shot_set: "应用分镜链路",
  image_selection: "生成并选择分镜图",
  video_selection: "生成并选择分镜视频",
  final_compose: "生成成片",
  completed: "已生成成片"
};

const completedLabel = "已生成成片";

const stagePercent: Record<string, number> = {
  product_brief: 10,
  storyboard: 20,
  shotprompt: 30,
  shot_set: 40,
  image_selection: 40,
  video_selection: 65,
  final_compose: 95,
  completed: 100
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function selectedCount(value: unknown): number {
  if (!isRecord(value)) return 0;
  return Object.values(value).filter(Boolean).length;
}

function positiveShotCount(shotCount: number | null | undefined): number {
  return Number.isFinite(shotCount) && shotCount && shotCount > 0
    ? Math.floor(shotCount)
    : 0;
}

function boundedPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stageStateSection(
  stageState: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const section = stageState[key];
  return isRecord(section) ? section : {};
}

function imageProgress(
  stageState: Record<string, unknown>,
  shotCount: number
): { percent: number; detail: string } {
  const image = stageStateSection(stageState, "image");
  if (shotCount <= 0) return { percent: 40, detail: "正在生成并选择分镜图" };

  const selected = selectedCount(image.selectedCandidateIdsByShotId);
  const currentIndex =
    typeof image.currentIndex === "number" && Number.isFinite(image.currentIndex)
      ? Math.max(0, Math.min(shotCount - 1, Math.floor(image.currentIndex)))
      : null;
  const completed = Math.max(selected, currentIndex === null ? 0 : currentIndex + 1);
  const boundedCompleted = Math.max(0, Math.min(shotCount, completed));

  return {
    percent: boundedPercent(40 + (boundedCompleted / shotCount) * 25),
    detail: `分镜图 ${boundedCompleted}/${shotCount}`
  };
}

function videoProgress(
  stageState: Record<string, unknown>,
  shotCount: number
): { percent: number; detail: string } {
  const video = stageStateSection(stageState, "video");
  if (shotCount <= 0) return { percent: 65, detail: "正在生成并选择分镜视频" };

  const completed = Math.max(
    0,
    Math.min(shotCount, selectedCount(video.selectedCandidateIdsByShotId))
  );

  return {
    percent: boundedPercent(65 + (completed / shotCount) * 25),
    detail: `分镜视频 ${completed}/${shotCount}`
  };
}

export function deriveOneClickProgress(
  job: OneClickFinalVideoJob,
  shotCount?: number | null
): OneClickProgress {
  const normalizedShotCount = positiveShotCount(shotCount);
  const label = oneClickStageLabels[job.currentStage] ?? job.currentStage;
  const tone: OneClickProgressTone =
    job.status === "FAILED" || job.status === "CANCELLED"
      ? "danger"
      : job.status === "SUCCEEDED"
        ? "good"
        : "busy";

  if (job.status === "SUCCEEDED" || job.currentStage === "completed") {
    return {
      percent: 100,
      label: completedLabel,
      detail: "成片已生成",
      tone
    };
  }

  if (job.currentStage === "image_selection") {
    return {
      ...imageProgress(job.stageState, normalizedShotCount),
      label,
      tone
    };
  }

  if (job.currentStage === "video_selection") {
    return {
      ...videoProgress(job.stageState, normalizedShotCount),
      label,
      tone
    };
  }

  return {
    percent: boundedPercent(stagePercent[job.currentStage] ?? 0),
    label,
    detail: label,
    tone
  };
}
