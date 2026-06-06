import { useEffect, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import {
  listDashboardVideoArtifacts,
  type DashboardVideoArtifact,
} from "../../lib/api/dashboardVideoArtifacts.js";
import {
  navigateToWorkspace,
  navigateToWorkspacesLanding,
} from "../../routes/routeState.js";
import { DashboardOverview } from "./DashboardOverview.js";
import { DashboardSidebar, type DashboardView } from "./DashboardSidebar.js";
import { DashboardVideoList } from "./DashboardVideoList.js";
import { getDashboardAnalyticsSnapshot } from "./dashboardDataApi.js";
import type { ChannelMetric, StrategyMetric } from "./dashboardTypes.js";

interface DataDashboardPageProps {
  workspaceId?: string;
  initialView?: DashboardView;
  initialDashboardVideos?: DashboardVideoArtifact[];
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
  initialView = "diagnosis",
  initialDashboardVideos = [],
}: DataDashboardPageProps) {
  const snapshot = getDashboardAnalyticsSnapshot();
  const [activeView, setActiveView] = useState<DashboardView>(initialView);
  const [dashboardVideos, setDashboardVideos] = useState(initialDashboardVideos);
  const [channelMetric, setChannelMetric] = useState<ChannelMetric>("roas");
  const [strategyMetric, setStrategyMetric] = useState<StrategyMetric>(
    snapshot.strategyMatrix.selectedMetric,
  );

  useEffect(() => {
    if (!workspaceId) return;
    if (initialDashboardVideos.length > 0) return;
    let cancelled = false;
    listDashboardVideoArtifacts(workspaceId)
      .then((response) => {
        if (!cancelled) setDashboardVideos(response.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceId, initialDashboardVideos.length]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f7f8fb" }}>
      <DashboardSidebar
        activeView={activeView}
        userName={snapshot.user.displayName}
        onViewChange={setActiveView}
      />

      <Box component="main" sx={{ flex: 1, minWidth: 0, p: 2.5 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", md: "center" },
            }}
          >
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>
                分析诊断看板
              </Typography>
              <Typography variant="body2" color="text.secondary">
                视频复盘 · 推销手法×渠道 · 创作建议
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                type="button"
                variant="outlined"
                size="small"
                startIcon={<ArrowLeft size={15} />}
                onClick={() => goToCreativeReview(workspaceId)}
              >
                {workspaceId ? "创作审核台" : "主工作台"}
              </Button>
              <Button type="button" variant="outlined" size="small" startIcon={<RefreshCw size={15} />}>
                刷新
              </Button>
              <Button type="button" variant="contained" size="small" startIcon={<Download size={15} />}>
                导出看板
              </Button>
            </Stack>
          </Stack>

          {activeView === "videos" ? (
            <DashboardVideoList videos={dashboardVideos} snapshot={snapshot} />
          ) : (
            <DashboardOverview
              snapshot={snapshot}
              channelMetric={channelMetric}
              strategyMetric={strategyMetric}
              onChannelMetricChange={setChannelMetric}
              onStrategyMetricChange={setStrategyMetric}
            />
          )}
        </Stack>
      </Box>
    </Box>
  );
}
