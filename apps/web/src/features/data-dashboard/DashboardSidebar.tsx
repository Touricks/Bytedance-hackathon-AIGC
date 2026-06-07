import { BarChart3, FileVideo, Sparkles, User } from "lucide-react";
import type { DashboardView } from "./dashboardTypes.js";

interface DashboardSidebarProps {
  activeView: DashboardView;
  userName: string;
  onViewChange: (view: DashboardView) => void;
}

const NAV_ITEMS: { id: DashboardView; label: string; icon: typeof BarChart3 }[] = [
  { id: "diagnosis", label: "分析诊断", icon: BarChart3 },
  { id: "videos", label: "视频列表", icon: FileVideo },
];

export function DashboardSidebar({ activeView, userName, onViewChange }: DashboardSidebarProps) {
  return (
    <aside className="dash-sidebar">
      <div className="dash-brand">
        <span className="dash-brand-mark">
          <Sparkles size={18} />
        </span>
        <span className="dash-brand-name">
          Dai<b>Reel</b>
        </span>
        <span className="dash-brand-pro">Pro</span>
      </div>

      <nav className="dash-nav" aria-label="数据看板导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={"dash-nav-item" + (item.id === activeView ? " is-active" : "")}
              onClick={() => onViewChange(item.id)}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="dash-nav dash-nav-bottom">
        <div className="dash-user">
          <span className="dash-user-ava">
            <User size={16} strokeWidth={1.8} />
          </span>
          <div className="dash-user-meta">
            <b>{userName}</b>
          </div>
        </div>
      </div>
    </aside>
  );
}
