import { Box, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import type { DashboardAnalyticsSnapshot } from "./dashboardTypes.js";

export function DashboardAdvisor({
  snapshot,
}: {
  snapshot: DashboardAnalyticsSnapshot;
}) {
  const recommendation = snapshot.strategyRecommendation;

  return (
    <Grid container spacing={1.5}>
      <Grid size={{ xs: 12, lg: 7 }}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }} gutterBottom>
            诊断建议
          </Typography>
          <Stack spacing={1.25}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                推荐替换推销手法
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {snapshot.factorCatalog.strategies[recommendation.suggestedStrategy].label}
                </Typography>
                <Chip color="success" size="small" label={recommendation.lift} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                推荐模板 {recommendation.suggestedTemplateName}
              </Typography>
            </Box>
            {recommendation.reasons.map((reason) => (
              <Typography key={reason} variant="body2">
                {reason}
              </Typography>
            ))}
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              {recommendation.rankForCurrentChannel.map((item) => (
                <Chip
                  key={item.strategy}
                  color={item.isBest ? "success" : item.isCurrent ? "primary" : "default"}
                  label={`${snapshot.factorCatalog.strategies[item.strategy].label} ${item.roas.toFixed(2)}`}
                />
              ))}
            </Stack>
            {snapshot.diagnosis.map((item) => (
              <Box key={item.title} sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Chip size="small" label={item.tag} />
                  <Typography variant="caption" color="text.secondary">
                    {item.metric}
                  </Typography>
                </Stack>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.body}
                </Typography>
                {item.lift ? <Chip size="small" color="success" label={item.lift} /> : null}
              </Box>
            ))}
          </Stack>
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, lg: 5 }}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }} gutterBottom>
            创作助手
          </Typography>
          <Stack spacing={1.5}>
            {snapshot.assistantPresets.map((preset) => (
              <Box key={preset.question}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {preset.question}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {preset.answer}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
                  {preset.chips.map((chip) => (
                    <Chip key={chip} size="small" label={chip} />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  );
}
