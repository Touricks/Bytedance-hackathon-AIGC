import type { Audience, CreativeFactors, ProductType, Strategy } from "@aigc-video/shared";

export type DashboardMetricKey =
  | "ctr"
  | "retain3s"
  | "complete"
  | "cvr"
  | "roas"
  | "gmv"
  | "funnel";

export type DashboardMetricTab = Exclude<DashboardMetricKey, "gmv" | "funnel">;
export type ChannelMetric = "roas" | "cvr" | "ctr" | "complete";
export type StrategyMetric = "roas" | "cvr" | "ctr";

export interface FactorOption {
  label: string;
  description: string;
}

export interface StrategyOption extends FactorOption {
  flow: string;
}

export interface DashboardFactorCatalog {
  productTypes: Record<ProductType, FactorOption>;
  audiences: Record<Audience, FactorOption>;
  strategies: Record<Strategy, StrategyOption>;
}

export interface DashboardVideoSeed {
  id: string;
  name: string;
  filename: string;
  model: string;
  duration: string;
  publishedAt: string;
  audienceText: string;
  creativeFactors: CreativeFactors;
  template: {
    name: string;
    status: "applied" | "customized" | "detached" | "none";
  };
}

export interface DashboardKpi {
  key: DashboardMetricTab;
  label: string;
  value: number;
  displayValue: string;
  deltaDisplay: string;
  benchmarkLabel: string;
  sparkline: number[];
}

export interface DashboardFunnelStep {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  totalRate: number;
  stepRate: number | null;
}

export interface DashboardChannel {
  id: string;
  name: string;
  platform: string;
  tier: string;
  isBest: boolean;
  metrics: {
    ctr: number;
    retain3s: number;
    complete: number;
    cvr: number;
    roas: number;
    gmv: number;
  };
}

export interface DashboardStrategyMatrixRow {
  strategy: Strategy;
  samples: number;
  isCurrent?: boolean;
  isRecommended?: boolean;
  metricsByChannel: Record<string, Pick<DashboardChannel["metrics"], StrategyMetric>>;
}

export interface DashboardDiagnosis {
  level: "high" | "medium";
  metric: string;
  tag: string;
  title: string;
  body: string;
  lift?: string;
}

export interface DashboardStrategyRecommendation {
  currentStrategy: Strategy;
  suggestedStrategy: Strategy;
  suggestedTemplateName: string;
  lift: string;
  reasons: string[];
  rankForCurrentChannel: Array<{
    strategy: Strategy;
    roas: number;
    isBest?: boolean;
    isCurrent?: boolean;
  }>;
}

export interface DashboardAssistantPreset {
  question: string;
  answer: string;
  chips: string[];
}

export interface DashboardAnalyticsSnapshot {
  schemaVersion: "dashboard-analytics-seed.v1";
  fieldGuide: {
    purpose: string;
    sections: Record<string, string> & { kpis: string };
    metricFields: Record<string, string>;
    videoFields: Record<string, string>;
  };
  meta: {
    updatedLabel: string;
    metricSourceNote: string;
    syntheticMetricKeys: DashboardMetricKey[];
  };
  user: { id: string; displayName: string };
  videos: DashboardVideoSeed[];
  factorCatalog: DashboardFactorCatalog;
  filters: {
    selectedVideoId: string;
    selectedPlatform: string;
    selectedChannelId: string;
    selectedRange: string;
    selectedGoal: string;
    platforms: string[];
    ranges: string[];
    goals: string[];
  };
  kpis: DashboardKpi[];
  funnel: DashboardFunnelStep[];
  channels: DashboardChannel[];
  strategyMatrix: {
    metricTabs: StrategyMetric[];
    selectedMetric: StrategyMetric;
    rows: DashboardStrategyMatrixRow[];
  };
  diagnosis: DashboardDiagnosis[];
  strategyRecommendation: DashboardStrategyRecommendation;
  assistantPresets: DashboardAssistantPreset[];
}
