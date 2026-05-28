import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { useVideoBatch } from "../hooks/useVideoBatch.js";
import { selectVideo } from "../../../lib/api/videoSelect.js";
import { retryShot } from "../../../lib/api/shots.js";
import { AssetStrip } from "./AssetStrip.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function VideoCandidatesStep({
  workspaceId,
  shotId,
}: {
  workspaceId: string;
  shotId: string;
}) {
  const qc = useQueryClient();
  const status = useShotWorkflowStatus(workspaceId);
  const shot = status.data?.data.shots.find((s) => s.shotId === shotId);
  const batchId = shot?.activeVideoBatchId ?? null;
  const batch = useVideoBatch(shotId, batchId);

  const select = useMutation({
    mutationFn: (candId: string) =>
      selectVideo(shotId, {
        videoCandidateId: candId,
        videoGenerationBatchId: batchId!,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      navigateFocus({ workspaceId, shotId, step: "review" });
    },
  });

  const retry = useMutation({
    mutationFn: () =>
      retryShot(
        shotId,
        "video_batch",
        `${workspaceId}:${shotId}:retry-video:${Date.now()}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      qc.invalidateQueries({ queryKey: ["video-batch", shotId, batchId] });
    },
  });

  if (!batchId)
    return (
      <div className="step-card">尚未生成视频。请返回剧本步骤。</div>
    );
  const d = batch.data?.data;
  if (!d) return <div className="step-card">加载中…</div>;
  const inflight = d.status === "PENDING" || d.status === "RUNNING";

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>选择分镜视频</h2>
      <p className="step-card__meta">
        状态 {d.status} · {d.succeededCount}/{d.requestedCount}
      </p>
      {inflight ? (
        <div className="progress-strip">
          <div className="progress-strip__fill" />
        </div>
      ) : null}
      {d.status === "FAILED" ? (
        <div className="step-card__actions">
          <button onClick={() => retry.mutate()} disabled={retry.isPending}>
            重试该批次
          </button>
        </div>
      ) : null}
      <div className="candidates-grid candidates-grid--videos">
        {d.candidates.map((c) => (
          <div
            key={c.id}
            className={`candidate-tile candidate-tile--${c.status.toLowerCase()}`}
          >
            {c.videoUrl ? (
              <video src={c.videoUrl} controls preload="metadata" />
            ) : (
              <span className="candidate-tile__missing">
                {c.errorMessage ?? c.status}
              </span>
            )}
            <button
              disabled={c.status !== "SUCCEEDED"}
              onClick={() => select.mutate(c.id)}
            >
              选这个
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
