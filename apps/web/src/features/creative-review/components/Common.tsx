import { useEffect, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CardMedia from "@mui/material/CardMedia";
import { FileText, Wand2 } from "lucide-react";
import type { MaterialIntakeArtifact } from "@aigc-video/shared";
import { CANDIDATE_MEDIA_FRAME_WIDTH } from "../candidateMediaLayout.js";
import {
  deriveMaterialPreviewMode,
  materialPreviewModeLabel,
  type MaterialPreviewMode
} from "../materialPreview.js";

export function ReviewActionDock({ children }: { children: ReactNode }) {
  return <div className="review-action-dock">{children}</div>;
}

export function MaterialAssetPreview({
  kind,
  src,
  filename,
  className,
  fit = "cover"
}: {
  kind: MaterialIntakeArtifact["assets"][number]["kind"];
  src: string;
  filename: string;
  className: string;
  fit?: "cover" | "contain";
}) {
  const [mode, setMode] = useState<MaterialPreviewMode>(() =>
    deriveMaterialPreviewMode({ kind })
  );

  useEffect(() => {
    setMode(deriveMaterialPreviewMode({ kind }));
  }, [kind, src]);

  return (
    <div
      className={`material-asset-preview material-asset-preview--${mode} material-asset-preview--fit-${fit} ${className}`}
      data-preview-mode={mode}
      data-preview-fit={fit}
    >
      {kind === "image" ? (
        <img
          src={src}
          alt={filename}
          onLoad={(event) => {
            const image = event.currentTarget;
            setMode(
              deriveMaterialPreviewMode({
                kind,
                width: image.naturalWidth,
                height: image.naturalHeight
              })
            );
          }}
        />
      ) : (
        <div
          className="material-asset-preview__file-cover"
          aria-label={`${filename} 文件封面`}
        >
          <FileText size={22} />
        </div>
      )}
      <span className="material-asset-preview__badge">
        {materialPreviewModeLabel(mode)}
      </span>
    </div>
  );
}

export function CandidateMediaFrame({
  kind,
  src,
  alt,
  statusText,
  aspectRatio,
  badge
}: {
  kind: "image" | "video";
  src: string | null | undefined;
  alt: string;
  statusText: string;
  aspectRatio: string;
  badge?: string | null;
}) {
  return (
    <Box
      className={`review-candidate-media review-candidate-media--${kind} ${
        src ? "review-candidate-media--ready" : "review-candidate-media--empty"
      }`}
      data-aspect-ratio={aspectRatio}
      sx={{
        width: CANDIDATE_MEDIA_FRAME_WIDTH,
        aspectRatio
      }}
    >
      {src ? (
        kind === "image" ? (
          <Box
            component="img"
            src={src}
            alt={alt}
            className="review-candidate-media__asset"
          />
        ) : (
          <CardMedia
            component="video"
            src={src}
            aria-label={alt}
            controls
            preload="metadata"
            className="review-candidate-media__asset"
          />
        )
      ) : (
        <div className="review-candidate-media__empty">
          <span>{statusText}</span>
        </div>
      )}
      {badge ? <span className="review-candidate__badge">{badge}</span> : null}
    </Box>
  );
}

export function ProposalPlaceholder({
  title,
  actionLabel,
  busy,
  onAction
}: {
  title: string;
  actionLabel: string;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <h1>{title}</h1>
      </div>
      <div className="review-empty-state">
        <FileText size={22} />
        <strong>当前审核内容还没有生成。</strong>
        <span>点击后会读取上游生效创作产物，并创建新的待审创作产物。</span>
      </div>
      <div className="review-panel__actions">
        <Button
          type="button"
          className="review-primary"
          onClick={onAction}
          disabled={busy}
          variant="contained"
        >
          <Wand2 size={16} />
          {actionLabel}
        </Button>
      </div>
    </section>
  );
}
