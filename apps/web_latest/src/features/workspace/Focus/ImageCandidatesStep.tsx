import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { useImageBatch } from "../hooks/useImageBatch.js";
import { selectImage } from "../../../lib/api/imageSelect.js";
import { retryShot } from "../../../lib/api/shots.js";
import { AssetStrip } from "./AssetStrip.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function ImageCandidatesStep({
  workspaceId,
  shotId,
}: {
  workspaceId: string;
  shotId: string;
}) {
  const qc = useQueryClient();
  const status = useShotWorkflowStatus(workspaceId);
  const shot = status.data?.data.shots.find((s) => s.shotId === shotId);
  const batchId = shot?.activeImageBatchId ?? null;
  const batch = useImageBatch(workspaceId, shotId, batchId);

  const select = useMutation({
    mutationFn: (candId: string) =>
      selectImage(workspaceId, shotId, {
        imageCandidateId: candId,
        imageGenerationBatchId: batchId!,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      navigateFocus({ workspaceId, shotId, step: "video_script" });
    },
  });

  const retry = useMutation({
    mutationFn: () =>
      retryShot(
        shotId,
        "image_batch",
        `${workspaceId}:${shotId}:retry-image:${Date.now()}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-status", workspaceId] });
      qc.invalidateQueries({ queryKey: ["image-rounds", workspaceId, shotId, batchId] });
    },
  });

  if (!batchId)
    return (
      <div className="step-card">
        尚未发起图生成。请回到 Prompt 步骤。
      </div>
    );
  const detail = batch.data?.data;
  if (!detail) return <div className="step-card">加载中…</div>;
  const inflight = detail.status === "PENDING" || detail.status === "RUNNING";

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>选择分镜图</h2>
      <p className="step-card__meta">
        状态 {detail.status} · {detail.succeededCount}/{detail.requestedCount}
      </p>
      {inflight ? (
        <div className="progress-strip">
          <div className="progress-strip__fill" />
        </div>
      ) : null}
      <div className="candidates-grid">
        {detail.candidates.map((c) => (
          <button
            key={c.id}
            className={`candidate-tile candidate-tile--${c.status.toLowerCase()}`}
            disabled={c.status !== "SUCCEEDED"}
            onClick={() => select.mutate(c.id)}
          >
            {c.imageUrl ? (
              <img src={c.imageUrl} alt={c.id} />
            ) : (
              <span className="candidate-tile__missing">
                {c.errorMessage ?? c.status}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="step-card__actions">
        <button
          onClick={() =>
            navigateFocus({ workspaceId, shotId, step: "image_prompt" })
          }
        >
          ← 编辑 Prompt 重新生成
        </button>
        {detail.status === "FAILED" || detail.status === "PARTIAL" ? (
          <button onClick={() => retry.mutate()} disabled={retry.isPending}>
            重试该批次
          </button>
        ) : null}
      </div>
    </div>
  );
}
