import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  createFinalVideo,
  finalVideoDownloadUrl,
  type FinalVideoJob,
} from "../../../lib/api/finalVideo.js";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { useFinalVideo } from "../hooks/useFinalVideo.js";

export function FinalComposeStep({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const status = useShotWorkflowStatus(workspaceId);
  const can = status.data?.data.canComposeFinalVideo ?? false;
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const result = useFinalVideo(activeJobId);

  const start = useMutation({
    mutationFn: () =>
      createFinalVideo(
        workspaceId,
        { outputAspectRatio: "9:16" },
        `${workspaceId}:final:${Date.now()}`,
      ),
    onSuccess: (res) => {
      setActiveJobId(res.data.finalVideoJobId);
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
    },
  });

  const job: FinalVideoJob | undefined = result.data?.data;

  return (
    <div className="step-card">
      <h2>最终合成</h2>
      {!can ? (
        <p>请确保所有分镜都已选中视频。</p>
      ) : (
        <>
          {!activeJobId && (
            <button onClick={() => start.mutate()} disabled={start.isPending}>
              开始合成
            </button>
          )}
          {activeJobId && job ? (
            <>
              <p>状态：{job.status}</p>
              {job.status === "SUCCEEDED" && job.localUrl ? (
                <>
                  <video
                    src={job.localUrl}
                    controls
                    className="review-video"
                  />
                  <a
                    className="download-link"
                    href={finalVideoDownloadUrl(job.localUrl)}
                    download={`final-video-${job.id}.mp4`}
                  >
                    <Download size={14} /> 下载 MP4
                  </a>
                  <button onClick={() => start.mutate()}>再次合成</button>
                </>
              ) : (
                <div className="progress-strip">
                  <div className="progress-strip__fill" />
                </div>
              )}
              {job.status === "FAILED" ? (
                <p className="error-banner">合成失败：{job.errorMessage}</p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
