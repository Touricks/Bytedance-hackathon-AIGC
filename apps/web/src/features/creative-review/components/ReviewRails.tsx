import { useMemo, useState } from "react";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import { Clock3, Trash2, Upload } from "lucide-react";
import { RowsPhotoAlbum, type Photo } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import {
  toAbsoluteAssetUrl,
  toWorkspaceMaterialUrl,
  deleteWorkspaceMaterial
} from "../../../lib/api/client.js";
import { materialAssetFilename } from "../../../lib/materials.js";
import { shotStatusLabel } from "../../../lib/shotStatusLabel.js";
import type { WorkbenchViewModel } from "../../workbench/useWorkbenchViewModel.js";
import {
  canOpenReviewStep,
  deriveCreativeActivity,
  deriveCreativeActivityProgress,
  deriveReviewStepIndicators,
  materialDeleteResetConfirmMessage,
  shouldResetFlowAfterMaterialDelete,
  type ReviewStepId
} from "../reviewFlow.js";
import { MaterialAssetPreview } from "./Common.js";

const materialPhotoFallbackSize = { width: 160, height: 90 } as const;

type MaterialLibraryPhoto = Photo & {
  ref: string;
  filename: string;
  description: string | undefined;
};

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function materialPhotoRatioLabel(width: number, height: number) {
  if (width <= 0 || height <= 0) return "16:9";
  const divisor = greatestCommonDivisor(Math.round(width), Math.round(height));
  const ratioWidth = Math.round(width / divisor);
  const ratioHeight = Math.round(height / divisor);
  if (ratioWidth <= 24 && ratioHeight <= 24) {
    return `${ratioWidth}:${ratioHeight}`;
  }
  if (width === height) return "1:1";
  return width > height ? "横图" : "竖图";
}

export function StepRail({
  vm,
  active,
  defaultStep,
  onSelect,
  onShotSelect
}: {
  vm: WorkbenchViewModel;
  active: ReviewStepId;
  defaultStep: ReviewStepId;
  onSelect: (step: ReviewStepId) => void;
  onShotSelect: (shotId: string) => void;
}) {
  const steps = deriveReviewStepIndicators(vm);

  return (
    <aside className="review-rail">
      <div className="review-rail__brand">
        <span>创作审核台</span>
      </div>
      <ol className="review-steps">
        {steps.map((step, index) => {
          const reachable = canOpenReviewStep(vm, step.id, defaultStep);
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`review-step ${active === step.id ? "review-step--active" : ""} ${
                  reachable ? "" : "review-step--locked"
                }`}
                disabled={!reachable}
                onClick={() => onSelect(step.id)}
                aria-current={active === step.id ? "step" : undefined}
              >
                <span className="review-step__index">{index + 1}</span>
                <span className="review-step__label">{step.label}</span>
                <span className={`review-step__state review-step__state--${step.tone}`}>
                  {step.state}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {vm.shots.length > 0 ? (
        <section className="review-shot-nav">
          <h3>分镜列表</h3>
          <List className="review-shot-nav__list" aria-label="分镜列表">
            {vm.shots.map((shot) => {
              const isSelected = shot.shotId === vm.selectedShotId;
              const upstreamChanged = Boolean(shot.upstream?.upstreamChanged);
              return (
                <ListItem
                  key={shot.shotId}
                  className="review-shot-nav__list-item"
                  disablePadding
                >
                  <ListItemButton
                    className={`review-shot-nav__item ${
                      isSelected ? "review-shot-nav__item--active" : ""
                    }`}
                    selected={isSelected}
                    onClick={() => onShotSelect(shot.shotId)}
                  >
                    <span className="review-shot-nav__index">{shot.orderIndex + 1}</span>
                    <ListItemAvatar className="review-shot-nav__avatar">
                      {shot.selectedImageUrl ? (
                        <img
                          className="review-shot-nav__thumb"
                          src={toAbsoluteAssetUrl(shot.selectedImageUrl)}
                          alt={`分镜 ${shot.orderIndex + 1} 已选分镜图`}
                        />
                      ) : (
                        <span
                          className="review-shot-nav__thumb review-shot-nav__thumb--empty"
                          aria-hidden="true"
                        />
                      )}
                    </ListItemAvatar>
                    <ListItemText
                      className="review-shot-nav__text"
                      primary={shotStatusLabel(shot.status)}
                      secondary={
                        upstreamChanged ? (
                          <Chip
                            className="review-shot-nav__upstream"
                            label="上游已变化"
                            size="small"
                          />
                        ) : null
                      }
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </section>
      ) : null}
    </aside>
  );
}

export function RightRail({
  vm,
  onReturnToRequirements,
  onSelectStep
}: {
  vm: WorkbenchViewModel;
  onReturnToRequirements: () => void;
  onSelectStep: (step: ReviewStepId) => void;
}) {
  const assets = vm.materialLibrary?.assets ?? [];
  const [photoDimensions, setPhotoDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deletingRef, setDeletingRef] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const shouldResetAfterDelete = shouldResetFlowAfterMaterialDelete(
    vm.artifacts.promptRequirements
  );
  const activity = deriveCreativeActivity(vm);
  const activityProgress = deriveCreativeActivityProgress(vm);
  const photos = useMemo<MaterialLibraryPhoto[]>(
    () =>
      assets
        .filter((asset) => asset.kind === "image")
        .map((asset) => {
          const filename = materialAssetFilename(asset.ref);
          const dimensions = photoDimensions[asset.ref] ?? materialPhotoFallbackSize;
          return {
            key: asset.ref,
            ref: asset.ref,
            filename,
            description: asset.description,
            src: toWorkspaceMaterialUrl(vm.workspaceId, asset.ref),
            width: dimensions.width,
            height: dimensions.height,
            alt: filename,
            title: filename,
            label: `放大查看素材 ${filename}`
          };
        }),
    [assets, photoDimensions, vm.workspaceId]
  );
  const nonImageAssets = useMemo(
    () => assets.filter((asset) => asset.kind !== "image"),
    [assets]
  );
  const lightboxSlides = useMemo(
    () =>
      photos.map((photo) => ({
        src: photo.src,
        alt: photo.alt,
        width: photo.width,
        height: photo.height,
        imageFit: "contain" as const
      })),
    [photos]
  );
  const activeLightboxIndex =
    lightboxIndex !== null && lightboxIndex < lightboxSlides.length ? lightboxIndex : 0;

  const rememberPhotoDimensions = (ref: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    setPhotoDimensions((current) => {
      const previous = current[ref];
      if (previous?.width === width && previous.height === height) return current;
      return { ...current, [ref]: { width, height } };
    });
  };

  const deleteMaterial = async (ref: string) => {
    if (shouldResetAfterDelete && !window.confirm(materialDeleteResetConfirmMessage)) {
      return;
    }
    setDeletingRef(ref);
    setDeleteError(null);
    try {
      await deleteWorkspaceMaterial({ workspaceId: vm.workspaceId, ref });
      if (shouldResetAfterDelete) {
        onReturnToRequirements();
      }
      await vm.actions.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingRef(null);
    }
  };

  return (
    <aside className="review-side">
      <section className="review-side__section">
        <div className="review-side__head">
          <Upload size={16} />
          <h2>素材库</h2>
        </div>
        {assets.length === 0 ? (
          <p className="review-muted">还没有上传素材。</p>
        ) : (
          <div className="review-assets">
            {photos.length > 0 ? (
              <RowsPhotoAlbum<MaterialLibraryPhoto>
                photos={photos}
                spacing={8}
                padding={0}
                targetRowHeight={96}
                rowConstraints={{ minPhotos: 1, maxPhotos: 2, singleRowMaxHeight: 116 }}
                defaultContainerWidth={276}
                onClick={({ index }) => setLightboxIndex(index)}
                render={{
                  photo: ({ onClick }, { photo, width, height }) => (
                    <div
                      key={photo.ref}
                      className="review-asset review-asset--image"
                      title={photo.description}
                      style={{ width }}
                    >
                      <button
                        type="button"
                        className="review-asset__image-button"
                        aria-label={photo.label}
                        onClick={onClick}
                        style={{ aspectRatio: `${width} / ${height}` }}
                      >
                        <img
                          src={photo.src}
                          alt={photo.alt}
                          title={photo.title}
                          loading="lazy"
                          decoding="async"
                          onLoad={(event) => {
                            const image = event.currentTarget;
                            rememberPhotoDimensions(
                              photo.ref,
                              image.naturalWidth,
                              image.naturalHeight
                            );
                          }}
                        />
                        <span className="material-asset-preview__badge">
                          {materialPhotoRatioLabel(photo.width, photo.height)}
                        </span>
                      </button>
                      <span className="review-asset__name" title={photo.filename}>
                        {photo.filename}
                      </span>
                      <button
                        type="button"
                        className="review-secondary"
                        disabled={deletingRef === photo.ref}
                        title={
                          shouldResetAfterDelete
                            ? `删除 ${photo.filename}，流程将返回模块一:创作要求与上传素材`
                            : `删除 ${photo.filename}`
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteMaterial(photo.ref);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                }}
              />
            ) : null}
            {nonImageAssets.map((asset) => {
              const filename = materialAssetFilename(asset.ref);
              return (
                <div key={asset.ref} className="review-asset" title={asset.description}>
                  <MaterialAssetPreview
                    kind={asset.kind}
                    src={toWorkspaceMaterialUrl(vm.workspaceId, asset.ref)}
                    filename={filename}
                    className="review-asset__preview"
                  />
                  <span className="review-asset__name" title={filename}>
                    {filename}
                  </span>
                  <button
                    type="button"
                    className="review-secondary"
                    disabled={deletingRef === asset.ref}
                    title={
                      shouldResetAfterDelete
                        ? `删除 ${filename}，流程将返回模块一:创作要求与上传素材`
                        : `删除 ${filename}`
                    }
                    onClick={() => deleteMaterial(asset.ref)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <Lightbox
          open={lightboxIndex !== null && lightboxSlides.length > 0}
          close={() => setLightboxIndex(null)}
          index={activeLightboxIndex}
          slides={lightboxSlides}
          carousel={{ imageFit: "contain" }}
        />
        {deleteError ? <p className="review-error">{deleteError}</p> : null}
        {shouldResetAfterDelete ? (
          <p className="review-muted">
            删除已提交后的素材会让流程返回模块一-创作要求与上传素材,避免后续模块继续引用已删除素材。
          </p>
        ) : null}
      </section>
      <section className="review-side__section">
        <div className="review-side__head">
          <Clock3 size={16} />
          <h2>创作动态</h2>
        </div>
        <div
          className={`review-activity review-activity--${activity.tone}`}
          aria-live="polite"
        >
          <strong>{activity.title}</strong>
          <p>{activity.message}</p>
          {activityProgress ? (
            <div className="review-activity-progress">
              <div className="review-activity-progress__meta">
                <span>{activityProgress.label}</span>
                <strong>
                  {activityProgress.percent === null
                    ? "进行中"
                    : `${activityProgress.percent}%`}
                </strong>
              </div>
              <div
                className={`review-activity-progress__bar ${
                  activityProgress.percent === null
                    ? "review-activity-progress__bar--indeterminate"
                    : ""
                }`}
                role="progressbar"
                aria-label={`${activityProgress.label}进度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  activityProgress.percent === null ? undefined : activityProgress.percent
                }
              >
                <span
                  className={`review-activity-progress__fill review-activity-progress__fill--${activityProgress.tone}`}
                  style={
                    activityProgress.percent === null
                      ? undefined
                      : { width: `${activityProgress.percent}%` }
                  }
                />
              </div>
              <p className="review-activity-progress__detail">
                {activityProgress.detail}
              </p>
            </div>
          ) : null}
          {activity.action ? (
            <button
              type="button"
              className="review-secondary review-activity__action"
              onClick={() => onSelectStep(activity.action!.stepId)}
            >
              {activity.action.label}
            </button>
          ) : null}
        </div>
      </section>
    </aside>
  );
}
