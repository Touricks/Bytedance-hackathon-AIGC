import { ThemeProvider } from "@mui/material/styles";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { DashboardVideoArtifact } from "../../lib/api/dashboardVideoArtifacts.js";
import {
  navigateToWorkspace,
  navigateToWorkspacesLanding,
} from "../../routes/routeState.js";
import type { DashboardRouteScope } from "../../routes/routeState.js";
import { DashboardAssistant } from "./DashboardAssistant.js";
import { DashboardOverview } from "./DashboardOverview.js";
import { DashboardSidebar } from "./DashboardSidebar.js";
import { DashboardToast } from "./DashboardToast.js";
import { DashboardVideoList } from "./DashboardVideoList.js";
import { dashboardTheme } from "./dashboardTheme.js";
import { getDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";
import type { DashboardView } from "./dashboardTypes.js";
import { useDataDashboardViewModel } from "./useDataDashboardViewModel.js";

interface DataDashboardPageProps {
  workspaceId?: string;
  returnWorkspaceId?: string;
  dashboardScope?: DashboardRouteScope;
  initialView?: DashboardView;
  initialDashboardVideos?: DashboardVideoArtifact[];
  initialSelectedDashboardVideoId?: string | null;
  initialDashboardVideoId?: string | null;
  initialFinalVideoJobId?: string | null;
}

function goToCreativeReview(workspaceId?: string) {
  if (workspaceId) {
    navigateToWorkspace(workspaceId);
    return;
  }
  navigateToWorkspacesLanding();
}

export function DataDashboardPage({
  workspaceId,
  returnWorkspaceId,
  dashboardScope = "global",
  initialView = "diagnosis",
  initialDashboardVideos = [],
  initialSelectedDashboardVideoId = null,
  initialDashboardVideoId = null,
  initialFinalVideoJobId = null,
}: DataDashboardPageProps) {
  const snapshot = getDashboardAnalyticsSnapshot();
  const backWorkspaceId = returnWorkspaceId ?? workspaceId;
  const vm = useDataDashboardViewModel({
    snapshot,
    workspaceId,
    dashboardScope,
    initialView,
    initialDashboardVideos,
    initialSelectedDashboardVideoId:
      initialSelectedDashboardVideoId ?? initialDashboardVideoId,
    initialDashboardVideoId,
    initialFinalVideoJobId,
    returnWorkspaceId: backWorkspaceId,
  });

  return (
    <ThemeProvider theme={dashboardTheme}>
      <div className="dash-root">
        <DashboardSidebar
          activeView={vm.activeView}
          userName={snapshot.user.displayName}
          onViewChange={vm.setActiveView}
        />

        <main className="dash-main">
          <header className="dash-topbar">
            <div className="dash-topbar-l">
              <h1 className="dash-page-title">分析诊断看板</h1>
            </div>
            <div className="dash-topbar-r">
              <button
                type="button"
                className="dash-hbtn"
                onClick={() => goToCreativeReview(backWorkspaceId)}
              >
                <ArrowLeft size={16} strokeWidth={1.8} />
                {backWorkspaceId ? "创作审核台" : "主工作台"}
              </button>
              <button
                type="button"
                className="dash-hbtn"
                title="刷新"
                onClick={() => void vm.refreshDashboardVideos()}
              >
                <RefreshCw size={16} strokeWidth={1.8} />
              </button>
            </div>
          </header>

          {vm.activeView === "videos" ? (
            <DashboardVideoList
              videos={vm.dashboardVideos}
              snapshot={snapshot}
              selectedVideoId={vm.selectedDashboardVideoId}
              onSelectVideo={vm.selectDashboardVideo}
            />
          ) : (
            <DashboardOverview vm={vm} />
          )}
        </main>

        <DashboardAssistant
          presets={snapshot.assistantPresets}
          open={vm.chatOpen}
          onOpenChange={vm.setChatOpen}
          onAction={vm.handleAssistantAction}
        />
        <DashboardToast message={vm.toast} />
      </div>
    </ThemeProvider>
  );
}
