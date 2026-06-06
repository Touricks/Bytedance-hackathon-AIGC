import { Download, Play } from "lucide-react";
import { toAbsoluteAssetUrl } from "../../../lib/api/client.js";
import { finalVideoDownloadUrl } from "../../../lib/api/finalVideo.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { statusTone } from "../reviewFlow.js";

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

export function FinalPanel({ vm }: { vm: WorkbenchViewModel }) {
  const job = vm.finalVideo;
  const oneClickJob = vm.oneClickFinalVideo;
  const oneClickStage = oneClickJob
    ? (oneClickStageLabels[oneClickJob.currentStage] ?? oneClickJob.currentStage)
    : null;
  const finalUrl = job?.localUrl ? toAbsoluteAssetUrl(job.localUrl) : null;
  const downloadUrl = finalUrl ? finalVideoDownloadUrl(finalUrl) : null;
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <h1>生成成片</h1>
      </div>
      {oneClickJob ? (
        <div className="review-one-click-progress">
          <span className={`review-status review-status--${statusTone(oneClickJob.status)}`}>
            {oneClickJob.status === "WAITING" ? "RUNNING" : oneClickJob.status}
          </span>
          <strong>{oneClickStage}</strong>
          {oneClickJob.errorMessage ? (
            <span className="review-error">{oneClickJob.errorMessage}</span>
          ) : (
            <span>全自动一键成片任务会在完成后接入这里的成片结果。</span>
          )}
        </div>
      ) : null}
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={
            vm.busy ||
            Boolean(vm.pending?.finalVideo) ||
            !vm.workflow?.canComposeFinalVideo
          }
          onClick={vm.actions.composeFinal}
        >
          <Play size={16} />
          {vm.pending?.finalVideo ? "正在生成成片..." : "生成成片"}
        </button>
      </div>
      {job ? (
        <div className="review-final">
          <span className={`review-status review-status--${statusTone(job.status)}`}>
            {job.status}
          </span>
          {finalUrl ? (
            <>
              <video src={finalUrl} controls />
              <a
                className="download-link"
                href={downloadUrl ?? finalUrl}
                download={`final-video-${job.id}.mp4`}
              >
                <Download size={14} />
                下载 MP4
              </a>
            </>
          ) : (
            <p className="review-muted">成片任务仍在处理中。</p>
          )}
          {job.errorMessage ? <p className="review-error">{job.errorMessage}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
