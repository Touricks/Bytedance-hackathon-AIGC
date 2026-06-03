import { Download, Play } from "lucide-react";
import { toAbsoluteAssetUrl } from "../../../lib/api/client.js";
import { finalVideoDownloadUrl } from "../../../lib/api/finalVideo.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { statusTone } from "../reviewFlow.js";

export function FinalPanel({ vm }: { vm: WorkbenchViewModel }) {
  const job = vm.finalVideo;
  const finalUrl = job?.localUrl ? toAbsoluteAssetUrl(job.localUrl) : null;
  const downloadUrl = finalUrl ? finalVideoDownloadUrl(finalUrl) : null;
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>用户手动触发</span>
        <h1>生成成片</h1>
        <p>全部分镜视频确认后，再由用户明确点击生成成片。</p>
      </div>
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
