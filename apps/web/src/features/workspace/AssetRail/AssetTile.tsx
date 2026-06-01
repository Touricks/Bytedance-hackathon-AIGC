export interface AssetTileProps {
  assetId: string;
  url: string;
  label: string;
  title?: string;
  selected?: boolean;
  onToggle?(): void;
}

export function AssetTile({
  assetId,
  url,
  label,
  title,
  selected,
  onToggle,
}: AssetTileProps) {
  return (
    <button
      className={`asset-tile ${selected ? "asset-tile--selected" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-asset-id", assetId);
      }}
      onClick={onToggle}
      title={title ?? label}
    >
      <img src={url} alt={label} />
    </button>
  );
}
