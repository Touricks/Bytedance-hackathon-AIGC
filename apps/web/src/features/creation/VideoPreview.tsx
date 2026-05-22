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
        <video controls src={finalAsset.url} />
      ) : (
        <div className="empty-preview">等待 12 秒成片生成</div>
      )}
    </section>
  );
}
