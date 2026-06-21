import { useEffect, useState } from "react";
import Collapse from "@mui/material/Collapse";
import {
  Archive,
  Ban,
  ChevronDown,
  CheckCircle2,
  Download,
  Film,
  Image as ImageIcon,
  Layers3,
  RefreshCw
} from "lucide-react";
import { validateP0StoryboardScript } from "@aigc-video/shared";
import { toAbsoluteAssetUrl } from "../../../lib/api/client.js";
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
  const shotSetHistory = vm.shotSetHistory ?? [];
  const activeChanged = Boolean(activeShotSet?.upstream?.upstreamChanged);
  const activeShotCount = vm.shotRows.length || activeShotSet?.shotCount || 0;
  const activeShotSetTitle = activeChanged
    ? "待更新的分镜链路实例"
    : "当前可用分镜链路实例";
  const activeShotSetStatusLabel = activeChanged ? "上游已变化" : "可继续制作";
  const activeShotSetStatusClass = activeChanged
    ? "review-status--waiting"
    : "review-status--good";
  const visibleShotSetHistory = shotSetHistory.filter((item) => {
    if (item.status === "archived") return true;
    return Boolean(item.upstream?.upstreamChanged);
  });
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
      ? "重新应用后会创建新的分镜链路实例，旧实例进入只读历史。"
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
        <article
          className={`shot-set-instance ${
            activeChanged ? "shot-set-instance--stale" : "shot-set-instance--active"
          }`}
        >
          <header className="shot-set-instance__head">
            <Layers3 size={20} />
            <div>
              <strong>
                {activeShotSetTitle}{" "}
                <span className="mono">{shortEntityId(activeShotSet.id)}</span>
              </strong>
              <span>
                创建于 {formatReviewTime(activeShotSet.createdAt)} ·{" "}
                {activeShotCount} 个分镜脚本
              </span>
            </div>
            <span className={`review-status ${activeShotSetStatusClass}`}>
              {activeShotSetStatusLabel}
            </span>
          </header>
          {activeChanged ? (
            <div className="review-upstream-note">
              <RefreshCw size={14} />
              分镜生成要求已更新，重新应用后会创建新实例，旧实例进入只读历史。
            </div>
          ) : null}
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
                ? "分镜链路实例需要更新"
                : "当前可用分镜链路实例已创建"
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
      {visibleShotSetHistory.length > 0 ? (
        <section className="shot-set-history" aria-label="历史分镜实例">
          <header className="shot-set-history__head">
            <Archive size={18} />
            <div>
              <strong>历史分镜实例</strong>
              <span>旧版本产物仅用于查看和下载，不会参与新版本生成。</span>
            </div>
          </header>
          <div className="shot-set-history__list">
            {visibleShotSetHistory.map((item, index) => (
              <HistoryShotSetItem
                key={item.id}
                item={item}
                defaultOpen={
                  (item.status === "active" &&
                    Boolean(item.upstream?.upstreamChanged)) ||
                  index === 0
                }
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function HistoryShotSetItem({
  item,
  defaultOpen
}: {
  item: NonNullable<WorkbenchViewModel["shotSetHistory"]>[number];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `shot-set-history-panel-${item.id}`;
  const buttonId = `shot-set-history-button-${item.id}`;

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, item.id]);

  const itemChanged = Boolean(item.upstream?.upstreamChanged);
  const isActive = item.status === "active";
  const title = isActive && itemChanged ? "待归档实例" : "归档实例";
  const statusLabel = isActive && itemChanged ? "上游已变化" : "只读归档";

  return (
    <article className={`shot-set-history-item ${open ? "is-open" : ""}`}>
      <button
        id={buttonId}
        type="button"
        className="shot-set-history-item__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown size={16} className="shot-set-history-item__chevron" />
        <span className="mono">{shortEntityId(item.id)}</span>
        <strong>{title}</strong>
        <span>
          {item.shotCount ?? item.shots.length} 镜 · 图 {item.selectedImageCount} ·
          视频 {item.selectedVideoCount}
        </span>
        <span className="review-status review-status--waiting">
          {statusLabel}
        </span>
      </button>
      <Collapse in={open} timeout="auto" unmountOnExit={false}>
        <div
          id={panelId}
          className="shot-set-history-item__body"
          role="region"
          aria-labelledby={buttonId}
        >
          <div className="shot-set-history-item__meta">
            <span>创建于 {formatReviewTime(item.createdAt)}</span>
            {item.archivedAt ? (
              <span>归档于 {formatReviewTime(item.archivedAt)}</span>
            ) : null}
          </div>
          {item.shots.length > 0 ? (
            <div className="shot-set-history-shots">
              {item.shots
                .slice()
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((shot) => (
                  <article key={shot.id} className="shot-set-history-shot">
                    <header>
                      <span className="mono">
                        第 {shot.orderIndex + 1} 镜 · {formatShotDuration(shot)}
                      </span>
                      <strong className="u-clip">{shot.title}</strong>
                    </header>
                    <div className="shot-set-history-shot__media">
                      <HistoryMedia
                        kind="image"
                        url={shot.selectedImage?.url ?? null}
                        label="已选分镜图"
                      />
                      <HistoryMedia
                        kind="video"
                        url={shot.selectedVideo?.url ?? null}
                        label="已选分镜视频"
                      />
                    </div>
                  </article>
                ))}
            </div>
          ) : (
            <p className="review-muted">该实例还没有分镜产物。</p>
          )}
        </div>
      </Collapse>
    </article>
  );
}

function HistoryMedia({
  kind,
  url,
  label
}: {
  kind: "image" | "video";
  url: string | null;
  label: string;
}) {
  const Icon = kind === "image" ? ImageIcon : Film;
  const absoluteUrl = url ? toAbsoluteAssetUrl(url) : null;
  const downloadLabel = kind === "image" ? "下载图片" : "下载视频";

  return (
    <div className="shot-set-history-media">
      <div className="shot-set-history-media__label">
        <Icon size={14} />
        <span>{label}</span>
      </div>
      {absoluteUrl ? (
        <>
          <div className="shot-set-history-media__preview">
            {kind === "image" ? (
              <img src={absoluteUrl} alt={label} loading="lazy" />
            ) : (
              <video src={absoluteUrl} controls preload="metadata" />
            )}
          </div>
          <a
            className="review-secondary shot-set-history-media__download"
            href={absoluteUrl}
            target="_blank"
            rel="noreferrer"
            download
          >
            <Download size={14} />
            {downloadLabel}
          </a>
        </>
      ) : (
        <span className="review-muted">未选择</span>
      )}
    </div>
  );
}
