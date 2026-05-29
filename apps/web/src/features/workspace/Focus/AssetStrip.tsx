import { useShotAssetRefs } from "../hooks/useShotAssetRefs.js";

export function AssetStrip({ shotId }: { shotId: string }) {
  const { refs } = useShotAssetRefs(shotId);
  if (refs.length === 0) return null;
  return (
    <div className="asset-strip">
      <span className="asset-strip__label">引用：</span>
      {refs.map((r) => (
        <span key={r.id} className="asset-strip__chip">
          {r.role} · {r.assetId.slice(0, 8)}
        </span>
      ))}
    </div>
  );
}
