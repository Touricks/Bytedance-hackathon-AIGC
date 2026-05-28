export interface AssetTileProps {
  assetId: string;
  url: string;
  label: string;
  selected?: boolean;
  onToggle?(): void;
}

export function AssetTile({
  assetId,
  url,
  label,
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
      title={label}
    >
      <img src={url} alt={label} />
    </button>
  );
}
