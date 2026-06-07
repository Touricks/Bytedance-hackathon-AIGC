import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { buildSparkline } from "./dashboardFormatters.js";
import type { DashboardKpiView } from "./useDataDashboardViewModel.js";

export function DashboardMetricCards({ kpis }: { kpis: DashboardKpiView[] }) {
  return (
    <div className="dash-kpi-row">
      {kpis.map((kpi) => (
        <DashboardKpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}

function DashboardKpiCard({ kpi }: { kpi: DashboardKpiView }) {
  const width = 150;
  const height = 32;
  const { path, area } = buildSparkline(kpi.sparkline, width, height);
  const gradientId = `dash-spark-${kpi.key}`;
  const Arrow = kpi.delta.up ? ArrowUp : ArrowDown;

  return (
    <div className="dash-kpi">
      <div className="dash-kpi-top">
        <span className="dash-kpi-label">{kpi.label}</span>
        <span className="dash-kpi-info">
          <Info size={13} strokeWidth={1.6} />
        </span>
      </div>
      <div className="dash-kpi-val">{kpi.displayValue}</div>
      <div className="dash-kpi-foot">
        <span className={`dash-delta dash-delta-${kpi.delta.tone}`}>
          <Arrow size={12} strokeWidth={2.2} />
          {kpi.delta.text}
        </span>
        <span className="dash-kpi-bench">{kpi.benchmarkLabel}</span>
      </div>
      <svg
        className="spark"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${kpi.label} 趋势`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={kpi.color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={kpi.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke={kpi.color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
