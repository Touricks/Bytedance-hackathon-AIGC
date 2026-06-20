import { useEffect, useState } from "react";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { Clock3, Film, RefreshCw } from "lucide-react";
import { toAbsoluteAssetUrl } from "../../../lib/api/client.js";
import {
  getVideoBatchGenerationTargets,
  videoBatchActionNote,
} from "../../workbench/videoBatchTargets.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import { isTerminalReady, statusTone } from "../reviewFlow.js";
import { candidateMediaAspectRatio } from "../candidateMediaLayout.js";
import { videoCandidatePresentation } from "../videoCandidatePresentation.js";
import { CandidateMediaFrame } from "./Common.js";

export function VideoSelectionPanel({ vm }: { vm: WorkbenchViewModel }) {
  const allImagesSelected =
    vm.shots.length > 0 && vm.shots.every((shot) => Boolean(shot.selectedImageId));
  const videoTargets = allImagesSelected
    ? getVideoBatchGenerationTargets(vm.shots)
    : [];
  const actionNote = allImagesSelected
    ? videoBatchActionNote(vm.shots)
    : "等待全部分镜图选择完成";
  const rounds = vm.videoRounds;
  const selectedShot = vm.selectedWorkflowShot;
  const selectedShotHasVideoBatch = Boolean(selectedShot?.activeVideoBatchId);
  const selectedShotHasActiveVideoBatch =
    selectedShot?.activeVideoBatchStatus === "PENDING" ||
    selectedShot?.activeVideoBatchStatus === "RUNNING";
  const canRerollSelectedVideo =
    allImagesSelected &&
    selectedShotHasVideoBatch &&
    !selectedShotHasActiveVideoBatch &&
    !vm.generation.hasActiveVideoBatchInWorkflow;

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <h1>分镜视频选择</h1>
      </div>
      <div className="review-panel__actions">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="video-candidate-count-label">候选视频数量</InputLabel>
          <Select
            labelId="video-candidate-count-label"
            label="候选视频数量"
            value={vm.candidateCounts.video}
            onChange={(event) =>
              vm.actions.setVideoCandidateCount(Number(event.target.value))
            }
          >
            {vm.candidateCounts.videoOptions.map((count) => (
              <MenuItem key={count} value={count}>
                {count} 条
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <button
          type="button"
          className="review-primary"
          disabled={vm.busy || !allImagesSelected || videoTargets.length === 0}
          onClick={vm.actions.proposeAllVideos}
        >
          <Film size={16} />
          {vm.pending?.video ? "正在生成分镜视频..." : "批量生成分镜视频候选"}
        </button>
        <button
          type="button"
          className="review-secondary"
          disabled={vm.busy || !canRerollSelectedVideo}
          onClick={vm.actions.rerollVideoCandidates}
        >
          <RefreshCw size={16} />
          {vm.pending?.videoReroll
            ? "正在重新生成..."
            : "重新生成当前分镜视频"}
        </button>
        <span className="review-action-note">
          {actionNote}
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
              selectionBusy={Boolean(vm.pending?.videoSelection)}
              generationBusy={Boolean(vm.pending?.video)}
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
  selectionBusy,
  generationBusy,
  allowFeedback,
  onSelect,
  onRegenerate
}: {
  round: NonNullable<WorkbenchViewModel["latestVideoRound"]>;
  batchId: string | null;
  selectionBusy: boolean;
  generationBusy: boolean;
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
  const succeededCount = round.batch?.succeededCount ?? 0;
  const requestedCount = round.batch?.requestedCount ?? round.candidates.length;
  const isGenerating =
    round.batch?.status === "PENDING" || round.batch?.status === "RUNNING";
  return (
    <div className="review-round">
      <div className="review-round__head">
        <span
          className={`review-status review-status--${statusTone(round.batch?.status)}`}
        >
          {round.batch?.status ?? "等待"}
        </span>
        <span>
          {succeededCount}/{requestedCount}
        </span>
      </div>
      {succeededCount > 0 && isGenerating ? (
        <div className="review-upstream-note">
          <Clock3 size={15} />
          <span>已有成功视频可选择，剩余候选继续生成中。</span>
        </div>
      ) : null}
      {round.batch?.status === "PARTIAL" ? (
        <div className="review-upstream-note">
          <Clock3 size={15} />
          <span>部分候选生成失败，可先选择成功视频，或重新生成当前分镜视频。</span>
        </div>
      ) : null}
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
          const presentation = videoCandidatePresentation(candidate, allowFeedback);
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
                src={
                  presentation.mediaUrl
                    ? toAbsoluteAssetUrl(presentation.mediaUrl)
                    : null
                }
                alt={candidate.id}
                statusText={presentation.statusText}
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
                  disabled={selectionBusy || !batchId || !presentation.canSelect}
                  onClick={() => batchId && onSelect(candidate.id, batchId)}
                >
                  {presentation.selectLabel}
                </button>
              </CardActions>
              {presentation.canFeedback ? (
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
                          if (!trimmed || generationBusy) return;
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
                            disabled={generationBusy || !feedbackText.trim()}
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
                        disabled={generationBusy}
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
