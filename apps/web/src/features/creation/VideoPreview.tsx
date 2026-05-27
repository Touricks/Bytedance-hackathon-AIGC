import { useState } from "react";
import type { Asset } from "@aigc-video/shared";
import {
  toAbsoluteAssetUrl,
  type RuntimePromptView,
  type VideoExportRunView,
} from "../../lib/api/client.js";

interface VideoPreviewProps {
  finalAsset?: Asset | null;
  videoExport?: VideoExportRunView;
  disabled?: boolean;
  onFeedbackSubmit?: (feedback: string) => Promise<void> | void;
}

export function VideoPreview({
  finalAsset,
  videoExport,
  disabled,
  onFeedbackSubmit,
}: VideoPreviewProps) {
  const [feedback, setFeedback] = useState("");
  const videoUrl =
    videoExport?.finalVideo.localUrl ??
    videoExport?.finalVideo.providerUrl ??
    finalAsset?.url;

  async function submitFeedback() {
    const value = feedback.trim();
    if (!value || !onFeedbackSubmit) {
      return;
    }
    await onFeedbackSubmit(value);
    setFeedback("");
  }

  return (
    <section className="panel preview-panel">
      <div className="section-heading">
        <h2>预览导出</h2>
        <span>{videoUrl ? "ready" : "waiting"}</span>
      </div>
      {videoUrl ? (
        <div className="video-output">
          <video controls src={toAbsoluteAssetUrl(videoUrl)} />
          <a
            className="export-link"
            href={toAbsoluteAssetUrl(videoUrl)}
            target="_blank"
            rel="noreferrer"
          >
            打开/导出成片
          </a>
          {videoExport ? (
            <div className="archive-meta">
              <span>job {videoExport.jobId}</span>
              <span>asset {videoExport.finalVideo.assetId}</span>
              <span>{videoExport.finalVideo.archivedAt}</span>
            </div>
          ) : null}
          <PromptPreview promptView={videoExport?.promptView} />
          <div className="feedback-box">
            <label>
              <span>成片反馈</span>
              <textarea
                rows={3}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="例如：开头更早展示产品，旁白更口语化"
              />
            </label>
            <button
              type="button"
              disabled={disabled || !feedback.trim() || !onFeedbackSubmit}
              onClick={() => void submitFeedback()}
            >
              提交反馈
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-preview">等待 12 秒成片生成</div>
      )}
    </section>
  );
}

function PromptPreview({ promptView }: { promptView?: RuntimePromptView }) {
  if (!promptView) {
    return null;
  }

  return (
    <section className="prompt-view compact-prompt-view">
      <div className="prompt-view-heading">
        <h3>{promptView.nl.title}</h3>
        <span>{promptView.promptVersion}</span>
      </div>
      <div className="prompt-section-list">
        {promptView.nl.sections.map((section) => (
          <article className="prompt-section" key={section.id}>
            <strong>{section.label}</strong>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
