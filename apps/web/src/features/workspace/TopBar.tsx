import { ChevronLeft, Layers, FileText } from "lucide-react";

export interface TopBarProps {
  workspaceLabel: string;
  activeShotLabel: string | null;
  onBack(): void;
  onToggleTrace(): void;
}

export function TopBar({
  workspaceLabel,
  activeShotLabel,
  onBack,
  onToggleTrace,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <button className="top-bar__back" onClick={onBack} title="返回工作区列表">
        <ChevronLeft size={16} />
      </button>
      <div className="top-bar__crumbs">
        <Layers size={14} /> <span>{workspaceLabel}</span>
        {activeShotLabel ? (
          <>
            <span className="top-bar__sep">/</span>
            <span>{activeShotLabel}</span>
          </>
        ) : null}
      </div>
      <div className="top-bar__spacer" />
      <button
        className="top-bar__trace"
        onClick={onToggleTrace}
        title="打开 Trace 面板"
      >
        <FileText size={14} /> Trace
      </button>
    </header>
  );
}
