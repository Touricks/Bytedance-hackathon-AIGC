import type { ShotStatus } from "./api/client.js";

export const SHOT_STATUS_LABELS: Record<ShotStatus, string> = {
  DRAFT: "草稿",
  IMAGE_PROMPT_PROPOSING: "图稿提议",
  IMAGE_PROMPT_READY: "图稿已就绪",
  IMAGE_PROMPT_EDITED: "图稿已编辑",
  IMAGE_GENERATING: "分镜图正在生成",
  IMAGE_CANDIDATES_READY: "分镜图待选择",
  IMAGE_SELECTED: "分镜图已选择",
  VIDEO_SCRIPT_PROPOSING: "视频稿提议",
  VIDEO_SCRIPT_READY: "视频稿已就绪",
  VIDEO_SCRIPT_EDITED: "视频稿已编辑",
  VIDEO_GENERATING: "视频正在生成",
  VIDEO_CANDIDATES_READY: "视频待选择",
  VIDEO_SELECTED: "视频已选择",
  FAILED: "失败",
};

export function shotStatusLabel(status: ShotStatus | string | null | undefined) {
  if (!status) return "未知";
  return status in SHOT_STATUS_LABELS
    ? SHOT_STATUS_LABELS[status as ShotStatus]
    : "未知";
}
