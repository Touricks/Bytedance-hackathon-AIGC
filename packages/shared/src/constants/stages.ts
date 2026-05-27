import type { JobStage } from "../types/domain.js";

export const JOB_STAGE_MESSAGES: Record<JobStage, string> = {
  queued: "任务已排队",
  script_generating: "正在生成剧本和分镜",
  media_generating: "正在生成 12 秒成片",
  completed: "视频已生成",
  failed: "生成失败"
};
