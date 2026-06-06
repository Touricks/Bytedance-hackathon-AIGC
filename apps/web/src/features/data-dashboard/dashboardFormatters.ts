import type { CreativeFactors } from "@aigc-video/shared";
import type {
  ChannelMetric,
  DashboardAnalyticsSnapshot,
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

export function metricDisplay(metric: ChannelMetric, value: number) {
  if (metric === "roas") return value.toFixed(2);
  return `${value}%`;
}

export function matrixMetricDisplay(metric: StrategyMetric, value: number) {
  if (metric === "roas") return value.toFixed(2);
  return `${value}%`;
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
  return {
    productType: snapshot.factorCatalog.productTypes[factors.productType],
    audience: snapshot.factorCatalog.audiences[factors.audience],
    strategy: snapshot.factorCatalog.strategies[factors.strategy],
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
