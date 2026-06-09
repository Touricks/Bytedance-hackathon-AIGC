import type { OneClickFinalVideoJob } from "../../../lib/api/oneClickFinalVideo.js";
import { deriveOneClickProgress } from "../../workbench/oneClickProgress.js";

export function OneClickProgress({
  job,
  shotCount,
  description
}: {
  job: OneClickFinalVideoJob;
  shotCount?: number | null;
  description: string;
}) {
  const progress = deriveOneClickProgress(job, shotCount);
  const statusLabel = job.status === "WAITING" ? "RUNNING" : job.status;

  return (
    <div className="review-one-click-progress">
      <div className="review-one-click-progress__meta">
        <span className={`review-status review-status--${progress.tone}`}>
          {statusLabel}
        </span>
        <strong>{progress.label}</strong>
        <span className="review-one-click-progress__percent">
          {progress.percent}%
        </span>
      </div>
      <div
        className="review-one-click-progress__bar"
        role="progressbar"
        aria-label="一键成片进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <span
          className="review-one-click-progress__fill"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="review-one-click-progress__detail">
        <span>{progress.detail}</span>
        {job.errorMessage ? (
          <span className="review-error">{job.errorMessage}</span>
        ) : (
          <span>{description}</span>
        )}
      </div>
    </div>
  );
}
