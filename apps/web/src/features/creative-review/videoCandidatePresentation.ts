import type { VideoCandidate } from "../../lib/api/videoBatch.js";

export function videoCandidatePresentation(
  candidate: VideoCandidate,
  allowFeedback: boolean,
) {
  const mediaUrl = candidate.videoUrl ?? candidate.previewVideoUrl ?? null;
  const isPersisting = candidate.status === "PERSISTING";
  const canSelect = candidate.status === "SUCCEEDED" && Boolean(candidate.videoUrl);
  return {
    mediaUrl,
    statusText: isPersisting
      ? "正在保存到工作目录"
      : candidate.errorMessage ?? candidate.status,
    selectLabel: isPersisting ? "正在保存到工作目录" : "选择为当前分镜视频",
    canSelect,
    canFeedback: allowFeedback && canSelect,
  };
}
