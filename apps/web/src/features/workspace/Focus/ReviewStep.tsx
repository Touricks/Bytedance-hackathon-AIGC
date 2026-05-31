import { useQuery } from "@tanstack/react-query";
import { getVideoBatch } from "../../../lib/api/videoBatch.js";
import { useShotWorkflowStatus } from "../hooks/useShotWorkflowStatus.js";
import { AssetStrip } from "./AssetStrip.js";
import { navigateFocus } from "../WorkspaceLayout.js";

export function ReviewStep({
  workspaceId,
  shotId,
}: {
  workspaceId: string;
  shotId: string;
}) {
  const status = useShotWorkflowStatus(workspaceId);
  const shot = status.data?.data.shots.find((s) => s.shotId === shotId);
  const batchId = shot?.activeVideoBatchId ?? null;
  const batch = useQuery({
    queryKey: ["video-rounds", workspaceId, shotId, batchId],
    queryFn: () => getVideoBatch(workspaceId, shotId, batchId!),
    enabled: Boolean(batchId),
  });
  const selectedId = shot?.selectedVideoId;
  const chosen = batch.data?.data.candidates.find(
    (c) => c.id === selectedId,
  );

  return (
    <div className="step-card">
      <AssetStrip shotId={shotId} />
      <h2>已确认分镜视频</h2>
      {chosen?.videoUrl ? (
        <video src={chosen.videoUrl} controls className="review-video" />
      ) : (
        <p>加载中…</p>
      )}
      <div className="step-card__actions">
        <button
          onClick={() =>
            navigateFocus({ workspaceId, shotId, step: "image_prompt" })
          }
        >
          重新编辑图 Prompt
        </button>
        <button
          onClick={() =>
            navigateFocus({ workspaceId, shotId, step: "video_script" })
          }
        >
          重新编辑剧本
        </button>
        <button
          onClick={() =>
            navigateFocus({
              workspaceId,
              shotId,
              step: "video_candidates",
            })
          }
        >
          重新选视频
        </button>
      </div>
    </div>
  );
}
