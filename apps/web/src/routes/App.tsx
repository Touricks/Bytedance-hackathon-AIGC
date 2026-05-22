import { useState } from "react";
import type { CreateGenerationJobRequest } from "@aigc-video/shared";
import { createGenerationJob } from "../lib/api/client.js";
import { useGenerationJob } from "../lib/job/useGenerationJob.js";
import { MaterialForm } from "../features/material/MaterialForm.js";
import { JobProgress } from "../features/creation/JobProgress.js";
import { ScriptPanel } from "../features/script/ScriptPanel.js";
import { VideoPreview } from "../features/creation/VideoPreview.js";

export function App() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const jobQuery = useGenerationJob(jobId);

  async function handleSubmit(input: CreateGenerationJobRequest) {
    setIsSubmitting(true);
    try {
      const result = await createGenerationJob(input);
      setJobId(result.job.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  const detail = jobQuery.data;

  return (
    <main className="app-shell">
      <header>
        <p className="eyebrow">Ecommerce AIGC Video</p>
        <h1>带货视频生成工作台</h1>
        <p>
          P0 路径：商品图与卖点 → 结构化剧本与分镜 → 单次 12 秒成片 →
          预览导出。
        </p>
      </header>
      <div className="workspace-grid">
        <MaterialForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        <JobProgress job={detail?.job} />
        <ScriptPanel script={detail?.script} shots={detail?.shots} />
        <VideoPreview finalAsset={detail?.finalAsset} />
      </div>
    </main>
  );
}
