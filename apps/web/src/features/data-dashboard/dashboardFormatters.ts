import type {
  Audience,
  CreativeFactors,
  DealType,
  ProductCategory,
  Strategy,
} from "@aigc-video/shared";
import type {
  ChannelMetric,
  DashboardAnalyticsSnapshot,
  DashboardMetricTab,
  DashboardStrategyMatrixRow,
  DashboardVideoSeed,
  StrategyMetric,
} from "./dashboardTypes.js";

export const channelMetricLabels: Record<ChannelMetric, string> = {
  roas: "ROAS",
  cvr: "CVR",
  ctr: "CTR",
  complete: "完播率",
};

export const strategyMetricLabels: Record<StrategyMetric, string> = {
  roas: "ROAS",
  cvr: "CVR",
  ctr: "CTR",
};

/** Accent color per channel-compare metric (matches the design chart palette). */
export const channelMetricColor: Record<ChannelMetric, string> = {
  roas: "#6457E8",
  cvr: "#16B8A6",
  ctr: "#3E8BF7",
  complete: "#F59E0B",
};

/** KPI card metadata: sparkline color + delta unit (pp for %, none for ROAS/GMV). */
export const kpiMeta: Record<DashboardMetricTab, { color: string; unit: string }> = {
  ctr: { color: "#3E8BF7", unit: "pp" },
  retain3s: { color: "#16B8A6", unit: "pp" },
  complete: { color: "#F59E0B", unit: "pp" },
  cvr: { color: "#F1556C", unit: "pp" },
  roas: { color: "#6457E8", unit: "" },
  gmv: { color: "#1FAE6B", unit: "" },
};

export function metricDisplay(metric: ChannelMetric, value: number) {
  if (metric === "roas") return value.toFixed(2);
  return `${value}%`;
}

export function matrixMetricDisplay(metric: StrategyMetric, value: number) {
  if (metric === "roas") return value.toFixed(2);
  return `${value.toFixed(2)}%`;
}

/** KPI big number: ROAS keeps 2 decimals, GMV uses currency, percentages append %. */
export function kpiDisplay(key: DashboardMetricTab, value: number) {
  if (key === "roas") return value.toFixed(2);
  if (key === "gmv") return `¥${fmtNum(value)}`;
  return `${value}%`;
}

export interface DeltaView {
  up: boolean;
  tone: "good" | "bad";
  text: string;
}

/**
 * Delta vs benchmark. `invert` flips the good/bad polarity for metrics where a
 * higher value is worse. Mirrors the design's `<Delta>` primitive.
 */
export function formatDelta(value: number, unit = "pp", invert = false): DeltaView {
  const rounded = Math.round(value * 100) / 100;
  const up = rounded >= 0;
  const good = invert ? !up : up;
  return { up, tone: good ? "good" : "bad", text: `${Math.abs(rounded)}${unit}` };
}

export function formatKpiDelta(key: DashboardMetricTab, value: number): DeltaView {
  if (key === "gmv") {
    const delta = formatDelta(value, "");
    return { ...delta, text: `¥${fmtNum(Math.abs(value))}` };
  }
  return formatDelta(value, kpiMeta[key].unit);
}

export interface SparklineGeometry {
  path: string;
  area: string;
}

/** Build the line + area-fill SVG paths for a KPI sparkline (ported from the design). */
export function buildSparkline(data: number[], w = 150, h = 32): SparklineGeometry {
  if (!data || data.length === 0) return { path: "", area: "" };
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const step = w / Math.max(1, data.length - 1);
  const points = data.map((value, index) => {
    const x = index * step;
    const y = h - 4 - ((value - min) / rng) * (h - 8);
    return [x, y] as const;
  });
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return { path, area };
}

/** Format large counts/GMV like the design's `fmtNum`. */
export function fmtNum(value: number) {
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(value >= 1e6 ? 0 : 1)}万`;
  return value.toLocaleString();
}

export interface MatrixScale {
  lo: number;
  hi: number;
  best: { strategy: Strategy; channelId: string; value: number } | null;
}

/** Global min/max + best cell across the matrix for the selected metric (heatmap scale). */
export function computeMatrixScale(
  rows: DashboardStrategyMatrixRow[],
  channelIds: string[],
  metric: StrategyMetric,
): MatrixScale {
  let lo = Infinity;
  let hi = -Infinity;
  let best: MatrixScale["best"] = null;
  for (const row of rows) {
    for (const channelId of channelIds) {
      const value = row.metricsByChannel[channelId]?.[metric];
      if (value == null) continue;
      if (value < lo) lo = value;
      if (value > hi) hi = value;
      if (!best || value > best.value) {
        best = { strategy: row.strategy, channelId, value };
      }
    }
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  return { lo, hi, best };
}

/** Normalize a value to 0..1 within a matrix scale. */
export function matrixNorm(value: number, scale: MatrixScale) {
  return (value - scale.lo) / (scale.hi - scale.lo || 1);
}

/** Perceptual heatmap fill: light lavender (low) → deep indigo (high). */
export function heatmapColor(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  const l = 96 - clamped * 52;
  const chroma = 0.02 + clamped * 0.16;
  return `oklch(${l}% ${chroma.toFixed(3)} 276)`;
}

/** Text color that stays legible against the heatmap fill. */
export function heatmapTextColor(t: number) {
  return t > 0.55 ? "#fff" : "#3a3550";
}

export function selectedItem<T extends { id: string }>(
  items: T[],
  id: string,
  label: string,
): T {
  const item = items.find((candidate) => candidate.id === id) ?? items[0];
  if (!item) throw new Error(`${label} data is empty`);
  return item;
}

export function factorLabels(
  snapshot: DashboardAnalyticsSnapshot,
  factors: CreativeFactors,
) {
  const productCategory = snapshot.factorCatalog.productCategories[
    factors.productCategory as ProductCategory
  ] ?? {
    label: "未归类商品类目",
    description: String(factors.productCategory ?? "unknown"),
  };
  const dealType = snapshot.factorCatalog.dealTypes[factors.dealType as DealType] ?? {
    label: "未归类成交类型",
    description: String(factors.dealType ?? "unknown"),
  };
  const audience = snapshot.factorCatalog.audiences[factors.audience as Audience] ?? {
    label: "未归类人群",
    description: String(factors.audience ?? "unknown"),
  };
  const strategy = snapshot.factorCatalog.strategies[factors.strategy as Strategy] ?? {
    label: "未归类推销手法",
    description: String(factors.strategy ?? "unknown"),
    flow: "暂无可用链路说明。",
  };
  return {
    productCategory,
    dealType,
    audience,
    strategy,
  };
}

export function currentVideo(snapshot: DashboardAnalyticsSnapshot): DashboardVideoSeed {
  return selectedItem(snapshot.videos, snapshot.filters.selectedVideoId, "video");
}

export function formatSeconds(seconds: number | null) {
  return typeof seconds === "number" ? `${seconds}s` : "--";
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
