import { useEffect, useState } from "react";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import { CheckCircle2, Clock3, Image as ImageIcon, RefreshCw } from "lucide-react";
import { toAbsoluteAssetUrl } from "../../../lib/api/client.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  canConfirmSelection,
  isSelectableCandidate,
  stageCandidate
} from "../imageSelection.js";
import { statusTone } from "../reviewFlow.js";
import { candidateMediaAspectRatio } from "../candidateMediaLayout.js";
import { CandidateMediaFrame } from "./Common.js";

export function ImageSelectionPanel({
  vm,
  manualShotSelectionId,
  onAutoSelectShot,
  onImageSelectionConfirmed
}: {
  vm: WorkbenchViewModel;
  manualShotSelectionId: string | null;
  onAutoSelectShot: (shotId: string) => void;
  onImageSelectionConfirmed: () => void;
}) {
  const nextImageShot = vm.shots.find((shot) => !shot.selectedImageId) ?? null;
  const shot = vm.selectedWorkflowShot ?? nextImageShot;
  const rounds = vm.imageRounds;
  const mustSelectNext = nextImageShot && shot?.shotId !== nextImageShot.shotId;
  const selectedWasManual =
    manualShotSelectionId !== null && manualShotSelectionId === vm.selectedShotId;
  const canGenerate =
    Boolean(vm.selectedShotId) &&
    shot !== null &&
    !mustSelectNext &&
    !["IMAGE_GENERATING", "IMAGE_PROMPT_PROPOSING"].includes(shot.status);
  const selectedImageRendered = Boolean(
    shot?.selectedImageId &&
    rounds.some((round) =>
      round.candidates.some((candidate) => candidate.id === shot.selectedImageId)
    )
  );

  useEffect(() => {
    if (
      nextImageShot &&
      (!vm.selectedShotId ||
        (!selectedWasManual && vm.selectedWorkflowShot?.selectedImageId))
    ) {
      onAutoSelectShot(nextImageShot.shotId);
    }
  }, [
    nextImageShot?.shotId,
    selectedWasManual,
    vm.selectedShotId,
    vm.selectedWorkflowShot?.selectedImageId
  ]);

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <span>按分镜顺序推进</span>
        <h1>分镜图选择</h1>
        <p>
          后一张分镜图会使用前一张已选分镜图作为场景连续性锚点，所以这里不能并行生成。
        </p>
      </div>
      {!shot ? (
        <div className="review-empty-state">没有可生成的分镜图。</div>
      ) : (
        <>
          <div className="review-current-shot">
            <span>当前分镜</span>
            <strong>分镜 {shot.orderIndex + 1}</strong>
            <em>{shot.status}</em>
          </div>
          {mustSelectNext && nextImageShot ? (
            <p className="review-warning">
              请先完成分镜 {nextImageShot.orderIndex + 1} 的分镜图选择。
            </p>
          ) : null}
          <div className="review-panel__actions">
            <button
              type="button"
              className="review-primary"
              disabled={vm.busy || !canGenerate}
              onClick={vm.actions.proposeImage}
            >
              <ImageIcon size={16} />
              {vm.pending?.image ? "正在生成分镜图..." : "生成分镜图候选"}
            </button>
          </div>
          {rounds.length > 0 ? (
            <>
              {rounds.map((round, index) => (
                <CandidateImages
                  key={round.artifact.id}
                  round={round}
                  batchId={round.batch?.id ?? null}
                  busy={vm.busy}
                  showDetachedSelection={!selectedImageRendered && index === 0}
                  allowFeedback={index === 0}
                  onSelect={(candidateId, selectedBatchId) => {
                    vm.actions.selectImageCandidate(candidateId, selectedBatchId);
                    onImageSelectionConfirmed();
                  }}
                  onRegenerate={(candidateId, userDirection) =>
                    vm.actions.regenerateImage({
                      baseArtifactId: round.artifact.id,
                      feedbackImageCandidateId: candidateId,
                      userDirection
                    })
                  }
                />
              ))}
            </>
          ) : (
            <div className="review-empty-state">
              <ImageIcon size={22} />
              <strong>当前分镜还没有候选图。</strong>
              <span>生成后，选择一张作为当前分镜图，再进入下一分镜。</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CandidateImages({
  round,
  batchId,
  busy,
  showDetachedSelection,
  allowFeedback,
  onSelect,
  onRegenerate
}: {
  round: NonNullable<WorkbenchViewModel["latestImageRound"]>;
  batchId: string | null;
  busy: boolean;
  showDetachedSelection: boolean;
  allowFeedback: boolean;
  onSelect: (candidateId: string, batchId: string) => void;
  onRegenerate: (candidateId: string, userDirection: string) => void;
}) {
  const committedId = round.selection?.selectedCandidateId ?? null;
  const [stagedId, setStagedId] = useState<string | null>(committedId);
  const [feedbackCandidateId, setFeedbackCandidateId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const candidateAspectRatio = candidateMediaAspectRatio(round.batch?.aspectRatio);
  useEffect(() => {
    setStagedId(committedId);
  }, [committedId]);
  useEffect(() => {
    setFeedbackCandidateId(null);
    setFeedbackText("");
  }, [round.artifact.id]);

  const confirmEnabled =
    Boolean(batchId) && canConfirmSelection({ stagedId, committedId, busy });

  const confirmNote = committedId
    ? stagedId === committedId
      ? "已确认当前分镜图，点选其他候选可改选。"
      : "已选中新候选，点击确认以更新当前分镜图。"
    : stagedId
      ? "点击确认以选定当前分镜图。"
      : "先点选一张成功生成的候选图，再确认。";

  return (
    <div className="review-round">
      <div className="review-round__head">
        <span
          className={`review-status review-status--${statusTone(round.batch?.status)}`}
        >
          {round.batch?.status ?? "等待"}
        </span>
        <span>
          第 {round.artifact.version} 轮 · {round.batch?.succeededCount ?? 0}/
          {round.batch?.requestedCount ?? round.candidates.length}
        </span>
      </div>
      {round.upstream?.upstreamChanged ? (
        <div className="review-upstream-note">
          <Clock3 size={15} />
          <span>本轮分镜图基于旧上游；当前选择仍可用，重新生成会使用最新内容。</span>
        </div>
      ) : null}
      <div className="review-image-grid">
        {round.candidates.map((candidate) => {
          const isStaged = candidate.id === stagedId;
          const isCommitted = candidate.id === committedId;
          const isFeedbackOpen = feedbackCandidateId === candidate.id;
          const canFeedback =
            allowFeedback &&
            candidate.status === "SUCCEEDED" &&
            Boolean(candidate.imageUrl);
          return (
            <Card
              variant="outlined"
              key={candidate.id}
              className="review-candidate-card"
              sx={{ width: "fit-content", maxWidth: "100%", overflow: "visible" }}
            >
              <button
                type="button"
                disabled={busy || !isSelectableCandidate(candidate.status)}
                aria-pressed={isStaged}
                className={[
                  "review-candidate",
                  `review-candidate--${statusTone(candidate.status)}`,
                  isStaged ? "review-candidate--staged" : "",
                  isCommitted ? "review-candidate--committed" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() =>
                  setStagedId((current) =>
                    stageCandidate(current, candidate.id, round.candidates)
                  )
                }
              >
                <CandidateMediaFrame
                  kind="image"
                  src={candidate.imageUrl ? toAbsoluteAssetUrl(candidate.imageUrl) : null}
                  alt={candidate.id}
                  statusText={candidate.errorMessage ?? candidate.status}
                  aspectRatio={candidateAspectRatio}
                  badge={isCommitted ? "当前选择" : null}
                />
              </button>
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
                        基于这张图反馈
                      </button>
                    )}
                  </div>
                </CardActions>
              ) : null}
            </Card>
          );
        })}
      </div>
      {committedId &&
      !round.candidates.some((candidate) => candidate.id === committedId) &&
      showDetachedSelection &&
      round.selection?.selectedImageUrl ? (
        <div className="review-current-image">
          <img
            src={toAbsoluteAssetUrl(round.selection.selectedImageUrl)}
            alt="当前已确认分镜图"
          />
          <div>
            <strong>当前选择</strong>
            <span>来自旧候选轮次；重新生成不会自动替换它。</span>
          </div>
        </div>
      ) : null}
      <div className="review-panel__actions">
        <button
          type="button"
          className="review-primary"
          disabled={!confirmEnabled}
          onClick={() => {
            if (batchId && stagedId) onSelect(stagedId, batchId);
          }}
        >
          <CheckCircle2 size={16} />
          确认选择
        </button>
        <span className="review-action-note">{confirmNote}</span>
      </div>
    </div>
  );
}
