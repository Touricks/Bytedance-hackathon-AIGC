import {
  JOB_STAGE_MESSAGES,
  type CreativeWorkspace,
  type GenerationJob,
} from "@aigc-video/shared";
import type { WorkspaceNextAction } from "../../lib/api/client.js";

interface JobProgressProps {
  job?: GenerationJob;
  nextAction?: WorkspaceNextAction;
  runtimeProviderLabel?: string;
  workspace?: CreativeWorkspace;
}

export function JobProgress({
  job,
  nextAction,
  runtimeProviderLabel,
  workspace,
}: JobProgressProps) {
  const currentStage = job?.stage ?? nextAction?.stage ?? workspace?.status;
  const stageLabel = currentStage ?? "等待选择工作目录";
  const nextLabel = nextAction
    ? (nextAction.runtimeBuilder ?? nextAction.actionType)
    : "select workspace";
  const statusLabel = job?.status ?? workspace?.status ?? "pending";
  const message = job
    ? JOB_STAGE_MESSAGES[job.stage]
    : workspace
      ? "当前工作目录已载入，可继续执行下一步。"
      : "请选择或打开一个工作目录。";

  return (
    <section className={`panel progress-panel ${job ? "" : "muted-panel"}`}>
      <div className="section-heading">
        <h2>生成进度</h2>
        <span>{statusLabel}</span>
      </div>
      {job ? (
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${job.progress}%` }} />
        </div>
      ) : null}
      <div className="progress-summary">
        <div>
          <span>当前阶段</span>
          <strong>{stageLabel}</strong>
        </div>
        <div>
          <span>下一步</span>
          <strong>{nextLabel}</strong>
        </div>
      </div>
      <p>{message}</p>
      {job?.errorMessage ? <p className="error">{job.errorMessage}</p> : null}
      <details className="developer-details">
        <summary>开发者信息</summary>
        <dl>
          <div>
            <dt>workspaceId</dt>
            <dd>{workspace?.id ?? "pending"}</dd>
          </div>
          <div>
            <dt>scriptId</dt>
            <dd>{workspace?.currentScriptId ?? "pending"}</dd>
          </div>
          <div>
            <dt>jobId</dt>
            <dd>{job?.id ?? workspace?.currentJobId ?? "pending"}</dd>
          </div>
          <div>
            <dt>raw status</dt>
            <dd>{statusLabel}</dd>
          </div>
          <div>
            <dt>runtime mode</dt>
            <dd>{nextAction?.runtimeMode ?? "pending"}</dd>
          </div>
          <div>
            <dt>provider</dt>
            <dd>{nextAction?.provider ?? runtimeProviderLabel ?? "pending"}</dd>
          </div>
          <div>
            <dt>next endpoint</dt>
            <dd>{nextAction?.endpoint ?? "pending"}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
