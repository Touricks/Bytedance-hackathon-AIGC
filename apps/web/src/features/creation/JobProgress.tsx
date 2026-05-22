import { JOB_STAGE_MESSAGES, type GenerationJob } from "@aigc-video/shared";

interface JobProgressProps {
  job?: GenerationJob;
}

export function JobProgress({ job }: JobProgressProps) {
  if (!job) {
    return (
      <section className="panel muted-panel">
        <h2>生成进度</h2>
        <p>创建任务后会显示实时阶段。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>生成进度</h2>
        <span>{job.status}</span>
      </div>
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${job.progress}%` }} />
      </div>
      <p>{JOB_STAGE_MESSAGES[job.stage]}</p>
      {job.errorMessage ? <p className="error">{job.errorMessage}</p> : null}
    </section>
  );
}
