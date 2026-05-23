import type { Asset } from "@aigc-video/shared";

interface VideoPreviewProps {
  finalAsset?: Asset | null;
}

export function VideoPreview({ finalAsset }: VideoPreviewProps) {
  return (
    <section className="panel preview-panel">
      <div className="section-heading">
        <h2>预览导出</h2>
        <span>{finalAsset ? "ready" : "waiting"}</span>
      </div>
      {finalAsset ? (
        <div className="video-output">
          <video controls src={finalAsset.url} />
          <a className="export-link" href={finalAsset.url} target="_blank" rel="noreferrer">
            打开/导出成片
          </a>
        </div>
      ) : (
        <div className="empty-preview">等待 12 秒成片生成</div>
      )}
    </section>
  );
}
