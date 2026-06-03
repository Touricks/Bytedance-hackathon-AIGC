import { useEffect, useState } from "react";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import { Clock3, Film, RefreshCw } from "lucide-react";
import { toAbsoluteAssetUrl } from "../../../lib/api/client.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { isTerminalReady, statusTone } from "../reviewFlow.js";
import { candidateMediaAspectRatio } from "../candidateMediaLayout.js";
import { CandidateMediaFrame } from "./Common.js";

export function VideoSelectionPanel({ vm }: { vm: WorkbenchViewModel }) {
  const allImagesSelected =
    vm.shots.length > 0 && vm.shots.every((shot) => Boolean(shot.selectedImageId));
  const videoTargets = vm.shots.filter(
    (shot) => shot.selectedImageId && !shot.selectedVideoId && !shot.activeVideoBatchId
  );
  const rounds = vm.videoRounds;

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>批量生成，逐分镜审核</span>
        <h1>分镜视频选择</h1>
        <p>全部分镜图选择完成后，批量生成视频候选；用户仍然逐个分镜选择当前分镜视频。</p>
      </div>
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || !allImagesSelected || videoTargets.length === 0}
          onClick={vm.actions.proposeAllVideos}
        >
          <Film size={16} />
          {vm.pending?.video ? "正在生成分镜视频..." : "批量生成分镜视频候选"}
        </button>
        <span className="review-action-note">
          {videoTargets.length > 0
            ? `待生成 ${videoTargets.length} 个分镜`
            : "已有视频候选或已完成选择"}
        </span>
      </div>
      {vm.selectedWorkflowShot ? (
        <div className="review-current-shot">
          <span>当前审核</span>
          <strong>分镜 {vm.selectedWorkflowShot.orderIndex + 1}</strong>
          <em>{vm.selectedWorkflowShot.status}</em>
        </div>
      ) : null}
      {rounds.length > 0 ? (
        <>
          {rounds.map((round, index) => (
            <CandidateVideos
              key={round.artifact.id}
              round={round}
              batchId={round.batch?.id ?? null}
              busy={vm.busy}
              allowFeedback={index === 0}
              onSelect={vm.actions.selectVideoCandidate}
              onRegenerate={(candidateId, userDirection) =>
                vm.actions.regenerateVideo({
                  baseArtifactId: round.artifact.id,
                  feedbackVideoCandidateId: candidateId,
                  userDirection
                })
              }
            />
          ))}
        </>
      ) : (
        <div className="review-empty-state">
          <Film size={22} />
          <strong>当前分镜还没有视频候选。</strong>
          <span>批量生成完成后，在左侧切换分镜逐个审核。</span>
        </div>
      )}
    </section>
  );
}

function CandidateVideos({
  round,
  batchId,
  busy,
  allowFeedback,
  onSelect,
  onRegenerate
}: {
  round: NonNullable<WorkbenchViewModel["latestVideoRound"]>;
  batchId: string | null;
  busy: boolean;
  allowFeedback: boolean;
  onSelect: (candidateId: string, batchId: string) => void;
  onRegenerate: (candidateId: string, userDirection: string) => void;
}) {
  const candidateAspectRatio = candidateMediaAspectRatio(round.batch?.aspectRatio);
  const [feedbackCandidateId, setFeedbackCandidateId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  useEffect(() => {
    setFeedbackCandidateId(null);
    setFeedbackText("");
  }, [round.artifact.id]);
  return (
    <div className="review-round">
      <div className="review-round__head">
        <span
          className={`review-status review-status--${statusTone(round.batch?.status)}`}
        >
          {round.batch?.status ?? "等待"}
        </span>
        <span>
          {round.batch?.succeededCount ?? 0}/
          {round.batch?.requestedCount ?? round.candidates.length}
        </span>
      </div>
      {round.upstream?.upstreamChanged ? (
        <div className="review-upstream-note">
          <Clock3 size={15} />
          <span>本轮分镜视频基于旧上游；当前选择仍可用，重新生成会使用最新内容。</span>
        </div>
      ) : null}
      <div className="review-video-grid">
        {round.candidates.map((candidate) => {
          const isFeedbackOpen = feedbackCandidateId === candidate.id;
          const isCommitted = candidate.id === round.selection?.selectedCandidateId;
          const canFeedback =
            allowFeedback &&
            candidate.status === "SUCCEEDED" &&
            Boolean(candidate.videoUrl);
          return (
            <Card
              variant="outlined"
              key={candidate.id}
              className={[
                "review-candidate-card",
                "review-video-candidate",
                `review-candidate--${statusTone(candidate.status)}`,
                isCommitted ? "review-candidate--committed" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              sx={{ width: "fit-content", maxWidth: "100%", overflow: "visible" }}
            >
              <CandidateMediaFrame
                kind="video"
                src={candidate.videoUrl ? toAbsoluteAssetUrl(candidate.videoUrl) : null}
                alt={candidate.id}
                statusText={candidate.errorMessage ?? candidate.status}
                aspectRatio={candidateAspectRatio}
                badge={isCommitted ? "当前选择" : null}
              />
              <CardActions
                className="review-candidate-actions"
                sx={{ display: "grid", width: "100%", p: 0 }}
              >
                <button
                  type="button"
                  className="review-secondary"
                  disabled={busy || !batchId || candidate.status !== "SUCCEEDED"}
                  onClick={() => batchId && onSelect(candidate.id, batchId)}
                >
                  选择为当前分镜视频
                </button>
              </CardActions>
              {canFeedback ? (
                <CardActions
                  className="review-candidate-actions"
                  sx={{ display: "grid", width: "100%", p: 0 }}
                >
                  <div className="review-candidate-feedback">
                    {isFeedbackOpen ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const trimmed = feedbackText.trim();
                          if (!trimmed || busy) return;
                          onRegenerate(candidate.id, trimmed);
                        }}
                      >
                        <label>
                          本次反馈
                          <textarea
                            value={feedbackText}
                            onChange={(event) => setFeedbackText(event.target.value)}
                            placeholder="填写你的意见"
                            required
                          />
                        </label>
                        <div className="review-panel__actions">
                          <button
                            type="submit"
                            className="review-secondary"
                            disabled={busy || !feedbackText.trim()}
                          >
                            <RefreshCw size={16} />
                            按反馈重新生成
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                              setFeedbackCandidateId(null);
                              setFeedbackText("");
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="review-secondary"
                        disabled={busy}
                        onClick={() => {
                          setFeedbackCandidateId(candidate.id);
                          setFeedbackText("");
                        }}
                      >
                        <RefreshCw size={16} />
                        基于这个视频反馈
                      </button>
                    )}
                  </div>
                </CardActions>
              ) : null}
            </Card>
          );
        })}
      </div>
      {!isTerminalReady(round.batch?.status) ? <div className="review-progress" /> : null}
    </div>
  );
}
