export interface VersionChipsProps<T extends { id: string; version: number }> {
  versions: T[];
  activeId: string | null;
  onPick(version: T): void;
}
export function VersionChips<T extends { id: string; version: number }>({
  versions,
  activeId,
  onPick,
}: VersionChipsProps<T>) {
  return (
    <div className="version-chips">
      {versions.map((v) => (
        <button
          key={v.id}
          className={`version-chip ${v.id === activeId ? "version-chip--active" : ""}`}
          onClick={() => onPick(v)}
        >
          v{v.version}
        </button>
      ))}
    </div>
  );
}
