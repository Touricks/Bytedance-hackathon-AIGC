import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type {
  ChannelMetric,
  DashboardAnalyticsSnapshot,
  DashboardChannel,
  DashboardVideoSeed,
  StrategyMetric,
} from "./dashboardTypes.js";
import {
  channelMetricLabels,
  factorLabels,
  matrixMetricDisplay,
  metricDisplay,
  selectedItem,
  strategyMetricLabels,
} from "./dashboardFormatters.js";

interface DashboardAnalysisSectionsProps {
  snapshot: DashboardAnalyticsSnapshot;
  video: DashboardVideoSeed;
  channelMetric: ChannelMetric;
  strategyMetric: StrategyMetric;
  onChannelMetricChange: (metric: ChannelMetric) => void;
  onStrategyMetricChange: (metric: StrategyMetric) => void;
}

function SectionPaper(props: { children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
      {props.children}
    </Paper>
  );
}

function maxMetric(channels: DashboardChannel[], metric: ChannelMetric) {
  return Math.max(...channels.map((item) => item.metrics[metric]));
}

export function DashboardAnalysisSections({
  snapshot,
  video,
  channelMetric,
  strategyMetric,
  onChannelMetricChange,
  onStrategyMetricChange,
}: DashboardAnalysisSectionsProps) {
  const selectedChannel = selectedItem(
    snapshot.channels,
    snapshot.filters.selectedChannelId,
    "channel",
  );
  const labels = factorLabels(snapshot, video.creativeFactors);

  return (
    <Stack spacing={1.5}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionPaper>
            <Typography variant="h6" sx={{ fontWeight: 800 }} gutterBottom>
              转化漏斗
            </Typography>
            <Stack spacing={1}>
              {snapshot.funnel.map((step) => (
                <Stack
                  key={step.key}
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {step.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {step.displayValue}
                    </Typography>
                  </Box>
                  <Chip size="small" label={`${step.totalRate}%`} />
                  {step.stepRate === null ? null : (
                    <Typography variant="caption" color="text.secondary">
                      步转 {step.stepRate}%
                    </Typography>
                  )}
                </Stack>
              ))}
            </Stack>
          </SectionPaper>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <SectionPaper>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1}
              sx={{ mb: 1.5, justifyContent: "space-between" }}
            >
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                多渠道对比 · 同一条视频
              </Typography>
              <ButtonGroup size="small" variant="outlined">
                {(Object.keys(channelMetricLabels) as ChannelMetric[]).map((metric) => (
                  <Button
                    key={metric}
                    variant={metric === channelMetric ? "contained" : "outlined"}
                    onClick={() => onChannelMetricChange(metric)}
                  >
                    {channelMetricLabels[metric]}
                  </Button>
                ))}
              </ButtonGroup>
            </Stack>
            <Stack spacing={1.2}>
              {snapshot.channels.map((item) => {
                const value = item.metrics[channelMetric];
                return (
                  <Stack
                    key={item.id}
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    <Typography variant="body2" sx={{ width: 148 }}>
                      {item.name}
                    </Typography>
                    <Box sx={{ flex: 1, bgcolor: "action.hover", borderRadius: 1 }}>
                      <Box
                        sx={{
                          width: `${Math.max(8, (value / maxMetric(snapshot.channels, channelMetric)) * 100)}%`,
                          height: 10,
                          borderRadius: 1,
                          bgcolor: item.isBest ? "success.main" : "primary.main",
                        }}
                      />
                    </Box>
                    <Typography variant="body2" sx={{ width: 56, fontWeight: 800 }}>
                      {metricDisplay(channelMetric, value)}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          </SectionPaper>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <SectionPaper>
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 1.5, justifyContent: "space-between" }}
            >
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                推销手法 × 渠道矩阵
              </Typography>
              <ButtonGroup size="small" variant="outlined">
                {snapshot.strategyMatrix.metricTabs.map((metric) => (
                  <Button
                    key={metric}
                    variant={metric === strategyMetric ? "contained" : "outlined"}
                    onClick={() => onStrategyMetricChange(metric)}
                  >
                    {strategyMetricLabels[metric]}
                  </Button>
                ))}
              </ButtonGroup>
            </Stack>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>推销手法</TableCell>
                    <TableCell>样本</TableCell>
                    {snapshot.channels.map((item) => (
                      <TableCell key={item.id}>{item.name}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {snapshot.strategyMatrix.rows.map((row) => {
                    const strategy = snapshot.factorCatalog.strategies[row.strategy];
                    return (
                      <TableRow key={row.strategy}>
                        <TableCell sx={{ minWidth: 220 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {strategy.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {strategy.flow}
                          </Typography>
                          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                            {row.isCurrent ? <Chip size="small" label="当前视频" /> : null}
                            {row.isRecommended ? <Chip size="small" label="推荐替换" /> : null}
                          </Stack>
                        </TableCell>
                        <TableCell>{row.samples}</TableCell>
                        {snapshot.channels.map((item) => {
                          const metrics = row.metricsByChannel[item.id];
                          return (
                            <TableCell
                              key={item.id}
                              sx={{
                                bgcolor:
                                  item.id === selectedChannel.id
                                    ? "action.selected"
                                    : "transparent",
                                fontWeight: row.isRecommended && item.isBest ? 800 : 500,
                              }}
                            >
                              {metrics
                                ? matrixMetricDisplay(strategyMetric, metrics[strategyMetric])
                                : "--"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </SectionPaper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionPaper>
            <Typography variant="h6" sx={{ fontWeight: 800 }} gutterBottom>
              当前成片标签
            </Typography>
            {[
              ["商品/服务类型", labels.productType.label, labels.productType.description],
              ["适用人群", labels.audience.label, labels.audience.description],
              ["推销手法", labels.strategy.label, labels.strategy.description],
            ].map(([title, label, description]) => (
              <Box key={title} sx={{ mb: 1.4 }}>
                <Typography variant="caption" color="text.secondary">
                  {title}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 800 }}>
                  {label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {description}
                </Typography>
              </Box>
            ))}
          </SectionPaper>
        </Grid>
      </Grid>
    </Stack>
  );
}
