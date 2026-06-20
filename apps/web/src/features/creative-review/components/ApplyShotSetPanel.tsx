import { Ban, CheckCircle2, Layers3, RefreshCw } from "lucide-react";
import { validateP0StoryboardScript } from "@aigc-video/shared";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  formatReviewTime,
  formatShotDuration,
  shortEntityId
} from "../creativeReviewFormat.js";

export function ApplyShotSetPanel({
  vm,
  onActionComplete
}: {
  vm: WorkbenchViewModel;
  onActionComplete: () => void;
}) {
  const shotPrompt = vm.artifacts.shotPrompt;
  const activeShotSet = vm.workspaceStatus?.activeShotSet;
  const pending = Boolean(vm.pending?.applyShotSet);
  const storyboardValidation = vm.artifacts.storyboard
    ? validateP0StoryboardScript(vm.artifacts.storyboard.data)
    : null;
  const storyboardRequiresApproval = Boolean(
    storyboardValidation && !storyboardValidation.valid
  );
  const activeShotRows = [...vm.shotRows].sort((a, b) => a.orderIndex - b.orderIndex);
  const activeChanged = Boolean(activeShotSet?.upstream?.upstreamChanged);
  const actionClass =
    activeShotSet && !activeChanged ? "review-secondary" : "review-primary";
  const actionLabel = pending
    ? "正在创建分镜链路实例..."
    : activeShotSet
      ? activeChanged
        ? "应用并创建新实例"
        : "重新创建实例"
      : "创建分镜链路实例";
  const applyDescription = activeShotSet
    ? activeChanged
      ? "应用后会创建新的分镜链路实例，当前实例进入归档历史。"
      : null
    : "创建后会生成可执行分镜脚本，后续分镜图和分镜视频只读取当前生效实例。";
  const actionDisabledReason = vm.hasActiveGeneration
    ? "当前分镜生成任务正在执行，请完成后再试。"
    : pending
      ? "正在创建分镜链路实例，请完成后再试。"
      : vm.busy
        ? "当前任务正在执行，请完成后再试。"
        : !shotPrompt?.isCurrent
          ? "请先批准当前分镜生成要求。"
          : storyboardRequiresApproval
            ? "请先批准 15 秒三镜版本后再应用分镜。"
            : null;
  const actionDisabled = Boolean(actionDisabledReason);

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <h1>应用分镜</h1>
      </div>
      {storyboardRequiresApproval ? (
        <div className="review-upstream-note">
          <Ban size={14} />
          当前生效的分镜脚本仍是旧结构。请先回到分镜脚本模块，批准 15 秒三镜版本。
        </div>
      ) : null}
      {activeShotSet ? (
        <article className="shot-set-instance shot-set-instance--active">
          <header className="shot-set-instance__head">
            <Layers3 size={20} />
            <div>
              <strong>
                当前分镜链路实例{" "}
                <span className="mono">{shortEntityId(activeShotSet.id)}</span>
              </strong>
              <span>
                创建于 {formatReviewTime(activeShotSet.createdAt)} ·{" "}
                {activeShotRows.length || activeShotSet.shotCount || 0} 个分镜脚本
              </span>
            </div>
            <span className="review-status review-status--good">当前生效</span>
          </header>
          {activeChanged ? (
            <div className="review-upstream-note">
              <RefreshCw size={14} />
              生效分镜生成要求有更新，重新应用会创建新实例并归档当前实例。
            </div>
          ) : null}
          {activeShotRows.length > 0 ? (
            <div className="shot-set-shot-grid" aria-label="当前分镜脚本摘要">
              {activeShotRows.map((shot) => (
                <article key={shot.id} className="shot-set-shot-card">
                  <span className="mono">
                    #{shot.orderIndex} · {formatShotDuration(shot)}
                  </span>
                  <strong className="u-clip">{shot.title}</strong>
                </article>
              ))}
            </div>
          ) : (
            <p className="review-muted">正在同步当前分镜脚本摘要。</p>
          )}
        </article>
      ) : (
        <div className="review-empty-state">
          <Layers3 size={22} />
          <strong>尚未创建分镜链路实例。</strong>
          <span>需要先把生效的分镜生成要求应用为可执行 shots，再开始逐分镜制作。</span>
        </div>
      )}
      <div className="shot-set-apply-card">
        <div>
          <strong>
            {activeShotSet
              ? activeChanged
                ? "生效分镜生成要求有更新"
                : "当前分镜链路实例已创建"
              : "等待创建分镜链路实例"}
          </strong>
          {applyDescription ? <span>{applyDescription}</span> : null}
        </div>
        <button
          type="button"
          className={actionClass}
          disabled={actionDisabled}
          onClick={() => {
            vm.actions.applyShotSet();
            onActionComplete();
          }}
        >
          <CheckCircle2 size={16} />
          {actionLabel}
        </button>
      </div>
      {actionDisabledReason ? (
        <span className="review-action-note">{actionDisabledReason}</span>
      ) : null}
      <span className="review-action-note">
        批准分镜生成要求不会自动清空或重建已有分镜链路。
      </span>
    </section>
  );
}
