import { Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import type { DashboardKpi } from "./dashboardTypes.js";

function sparklinePoints(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 120;
      const y = 24 - ((value - min) / (max - min || 1)) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function DashboardMetricCards({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <Grid container spacing={1.5}>
      {kpis.map((kpi) => (
        <Grid key={kpi.key} size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <Card variant="outlined" sx={{ height: "100%", borderRadius: 2 }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  {kpi.label}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {kpi.displayValue}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {kpi.deltaDisplay} {kpi.benchmarkLabel}
                </Typography>
                <svg viewBox="0 0 120 28" role="img" aria-label={`${kpi.label} 趋势`}>
                  <polyline
                    points={sparklinePoints(kpi.sparkline)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
