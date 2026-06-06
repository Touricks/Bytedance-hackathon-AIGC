import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type {
  ChannelMetric,
  DashboardAnalyticsSnapshot,
  StrategyMetric,
} from "./dashboardTypes.js";
import { DashboardAdvisor } from "./DashboardAdvisor.js";
import { DashboardAnalysisSections } from "./DashboardAnalysisSections.js";
import { DashboardMetricCards } from "./DashboardMetricCards.js";
import { currentVideo, factorLabels, selectedItem } from "./dashboardFormatters.js";

interface DashboardOverviewProps {
  snapshot: DashboardAnalyticsSnapshot;
  channelMetric: ChannelMetric;
  strategyMetric: StrategyMetric;
  onChannelMetricChange: (metric: ChannelMetric) => void;
  onStrategyMetricChange: (metric: StrategyMetric) => void;
}

export function DashboardOverview({
  snapshot,
  channelMetric,
  strategyMetric,
  onChannelMetricChange,
  onStrategyMetricChange,
}: DashboardOverviewProps) {
  const video = currentVideo(snapshot);
  const channel = selectedItem(snapshot.channels, snapshot.filters.selectedChannelId, "channel");
  const labels = factorLabels(snapshot, video.creativeFactors);

  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ flexWrap: "wrap", alignItems: "center" }}
        >
          <Chip label={`视频 ${video.name}`} />
          <Chip label={`平台 ${snapshot.filters.selectedPlatform}`} />
          <Chip label={`KOL渠道 ${channel.name}`} />
          <Chip label={`时间 ${snapshot.filters.selectedRange}`} />
          <Chip label={`目标 ${snapshot.filters.selectedGoal}`} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
            {snapshot.meta.updatedLabel}
          </Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between" }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: 120,
                aspectRatio: "16/9",
                borderRadius: 1.5,
                bgcolor: "action.hover",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              16:9
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                {video.filename}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
                <Chip size="small" label={`商品 ${labels.productType.label}`} />
                <Chip size="small" label={`人群 ${labels.audience.label}`} />
                <Chip size="small" label={`推销手法 ${labels.strategy.label}`} />
                {video.template.status !== "none" ? (
                  <Chip size="small" label={`模板 ${video.template.name}`} />
                ) : null}
              </Stack>
            </Box>
          </Stack>

          <Stack direction="row" spacing={3}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                受众
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {video.audienceText}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                分发渠道
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {channel.name} · {channel.tier}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                发布
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {video.publishedAt}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Paper>

      <DashboardMetricCards kpis={snapshot.kpis} />
      <DashboardAnalysisSections
        snapshot={snapshot}
        video={video}
        channelMetric={channelMetric}
        strategyMetric={strategyMetric}
        onChannelMetricChange={onChannelMetricChange}
        onStrategyMetricChange={onStrategyMetricChange}
      />
      <DashboardAdvisor snapshot={snapshot} />
    </Stack>
  );
}
