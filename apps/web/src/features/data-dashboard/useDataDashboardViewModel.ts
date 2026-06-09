import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listGlobalDashboardVideoArtifacts,
  listDashboardVideoArtifacts,
  type DashboardVideoArtifact,
} from "../../lib/api/dashboardVideoArtifacts.js";
import {
  getGroupRecommendation,
  type GroupRecommendation,
  type RecommendationMeta,
  type RecommendationWeights,
} from "../../lib/api/dashboardRecommendations.js";
import type {
  ChannelMetric,
  DashboardAnalyticsSnapshot,
  DashboardChannel,
  DashboardMetricTab,
  DashboardView,
  DashboardVideoContext,
  DashboardVideoSeed,
  StrategyMetric,
  WeightMode,
} from "./dashboardTypes.js";
import {
  factorLabels,
  formatDateTime,
  formatKpiDelta,
  formatSeconds,
  kpiDisplay,
  kpiMeta,
  selectedItem,
  type DeltaView,
} from "./dashboardFormatters.js";

/**
 * Engine query weights for a weighting posture. 效率优先 leans on ROAS; 规模优先
 * leans on GMV. The engine renormalizes these so they need not sum to 1.
 */
export function weightsFor(mode: WeightMode): RecommendationWeights {
  return mode === "gmv"
    ? { roasWeight: 0.4, gmvWeight: 0.6 }
    : { roasWeight: 0.8, gmvWeight: 0.2 };
}

/**
 * The group endpoint returns 404 when a (商品一级类目 × 商品成交类型) group has no
 * 投放 data. fetchJson surfaces that as `... failed: 404 ...`; treat it as an
 * empty result (no recommendation) rather than an error.
 */
export function isGroupNotFoundError(error: unknown): boolean {
  return error instanceof Error && / failed: 404\b/.test(error.message);
}

export interface DashboardKpiView {
  key: DashboardMetricTab;
  label: string;
  displayValue: string;
  delta: DeltaView;
  benchmarkLabel: string;
  color: string;
  sparkline: number[];
}

type DashboardTemplateStatus = DashboardVideoContext["template"]["status"];

function importedVideoTemplate(): DashboardVideoContext["template"] {
  return { name: "未绑定创作预设", status: "none" as DashboardTemplateStatus };
}

export function dashboardVideoContextFromArtifact(
  snapshot: DashboardAnalyticsSnapshot,
  video: DashboardVideoArtifact,
): DashboardVideoContext {
  const labels = factorLabels(snapshot, video.creativeFactors);
  return {
    id: video.id,
    name: video.name,
    filename: video.name,
    model: "数据面板导入",
    duration: formatSeconds(video.durationSec),
    publishedAt: formatDateTime(video.importedAt),
    audienceText: labels.audience.label,
    creativeFactors: video.creativeFactors,
    template: importedVideoTemplate(),
    localUrl: video.localUrl,
  };
}

/**
 * Derive the KPI cards for a given channel: the value comes from the selected
 * channel's metrics and the delta is measured against the best (`isBest`)
 * channel — so picking a channel re-drives the KPI cards.
 */
export function deriveDashboardKpis(
  snapshot: DashboardAnalyticsSnapshot,
  channel: DashboardChannel,
): DashboardKpiView[] {
  const benchmarkChannel =
    snapshot.channels.find((item) => item.isBest) ?? snapshot.channels[0];
  return snapshot.kpis.map((kpi) => {
    const value = channel.metrics[kpi.key];
    const benchmark = benchmarkChannel ? benchmarkChannel.metrics[kpi.key] : value;
    const meta = kpiMeta[kpi.key];
    return {
      key: kpi.key,
      label: kpi.label,
      displayValue: kpiDisplay(kpi.key, value),
      delta: formatKpiDelta(kpi.key, value - benchmark),
      benchmarkLabel: kpi.benchmarkLabel,
      color: meta.color,
      sparkline: kpi.sparkline,
    };
  });
}

export interface DataDashboardViewModel {
  snapshot: DashboardAnalyticsSnapshot;
  activeView: DashboardView;
  setActiveView: (view: DashboardView) => void;
  selectedVideoId: string;
  platform: string;
  channelId: string;
  range: string;
  goal: string;
  channelMetric: ChannelMetric;
  strategyMetric: StrategyMetric;
  video: DashboardVideoSeed;
  channel: DashboardChannel;
  kpis: DashboardKpiView[];
  dashboardVideos: DashboardVideoArtifact[];
  selectedDashboardVideoId: string | null;
  selectedDashboardVideo: DashboardVideoArtifact | null;
  dashboardVideoContext: DashboardVideoContext | null;
  weightMode: WeightMode;
  setWeightMode: (mode: WeightMode) => void;
  recommendation: GroupRecommendation | null;
  recommendationMeta: RecommendationMeta | null;
  recommendationLoading: boolean;
  recommendationError: string | null;
  chatOpen: boolean;
  toast: string | null;
  channelRef: React.RefObject<HTMLDivElement | null>;
  matrixRef: React.RefObject<HTMLDivElement | null>;
  setVideo: (id: string) => void;
  setPlatform: (platform: string) => void;
  setChannel: (id: string) => void;
  setRange: (range: string) => void;
  setGoal: (goal: string) => void;
  setChannelMetric: (metric: ChannelMetric) => void;
  setStrategyMetric: (metric: StrategyMetric) => void;
  selectDashboardVideo: (id: string) => void;
  setChatOpen: (open: boolean) => void;
  fireToast: (message: string) => void;
  refreshDashboardVideos: () => Promise<void>;
  handleAssistantAction: (action: string) => void;
}

export interface UseDataDashboardViewModelParams {
  snapshot: DashboardAnalyticsSnapshot;
  workspaceId?: string;
  initialView?: DashboardView;
  initialDashboardVideos?: DashboardVideoArtifact[];
  initialSelectedDashboardVideoId?: string | null;
  initialFinalVideoJobId?: string | null;
}

/**
 * Owns the dashboard's selection state and derives the per-channel KPI view so
 * that changing the active channel (filter dropdown or channel-row click)
 * re-drives the KPI cards and matrix highlight. Keeps panels presentational.
 */
export function useDataDashboardViewModel({
  snapshot,
  workspaceId,
  initialView = "diagnosis",
  initialDashboardVideos = [],
  initialSelectedDashboardVideoId = null,
  initialFinalVideoJobId = null,
}: UseDataDashboardViewModelParams): DataDashboardViewModel {
  const [activeView, setActiveView] = useState<DashboardView>(initialView);
  const [selectedVideoId, setSelectedVideoId] = useState(snapshot.filters.selectedVideoId);
  const [platform, setPlatform] = useState(snapshot.filters.selectedPlatform);
  const [channelId, setChannelId] = useState(snapshot.filters.selectedChannelId);
  const [range, setRange] = useState(snapshot.filters.selectedRange);
  const [goal, setGoal] = useState(snapshot.filters.selectedGoal);
  const [channelMetric, setChannelMetric] = useState<ChannelMetric>("roas");
  const [strategyMetric, setStrategyMetric] = useState<StrategyMetric>(
    snapshot.strategyMatrix.selectedMetric,
  );
  const [chatOpen, setChatOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [dashboardVideos, setDashboardVideos] = useState(initialDashboardVideos);
  const [selectedDashboardVideoId, setSelectedDashboardVideoId] = useState<string | null>(
    initialSelectedDashboardVideoId,
  );
  const [weightMode, setWeightMode] = useState<WeightMode>("roas");
  const [recommendation, setRecommendation] = useState<GroupRecommendation | null>(null);
  const [recommendationMeta, setRecommendationMeta] = useState<RecommendationMeta | null>(
    null,
  );
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<HTMLDivElement | null>(null);
  const matrixRef = useRef<HTMLDivElement | null>(null);

  const fireToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshDashboardVideos = useCallback(async () => {
    try {
      const response = workspaceId
        ? await listDashboardVideoArtifacts(workspaceId)
        : await listGlobalDashboardVideoArtifacts();
      setDashboardVideos(response.data);
      fireToast("数据面板视频已刷新");
    } catch {
      fireToast("数据面板视频刷新失败");
    }
  }, [fireToast, workspaceId]);

  useEffect(() => {
    if (initialDashboardVideos.length > 0) return;
    let cancelled = false;
    const listVideos = workspaceId
      ? listDashboardVideoArtifacts(workspaceId)
      : listGlobalDashboardVideoArtifacts();
    listVideos
      .then((response) => {
        if (!cancelled) setDashboardVideos(response.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceId, initialDashboardVideos.length]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const video = useMemo(
    () => selectedItem(snapshot.videos, selectedVideoId, "video"),
    [snapshot.videos, selectedVideoId],
  );
  const channel = useMemo(
    () => selectedItem(snapshot.channels, channelId, "channel"),
    [snapshot.channels, channelId],
  );

  const kpis = useMemo<DashboardKpiView[]>(
    () => deriveDashboardKpis(snapshot, channel),
    [snapshot, channel],
  );

  const selectedDashboardVideo = useMemo(
    () =>
      dashboardVideos.find((candidate) => candidate.id === selectedDashboardVideoId) ??
      dashboardVideos.find(
        (candidate) =>
          Boolean(initialFinalVideoJobId) &&
          candidate.finalVideoJobId === initialFinalVideoJobId,
      ) ??
      null,
    [dashboardVideos, initialFinalVideoJobId, selectedDashboardVideoId],
  );

  const dashboardVideoContext = useMemo(
    () =>
      selectedDashboardVideo
        ? dashboardVideoContextFromArtifact(snapshot, selectedDashboardVideo)
        : null,
    [snapshot, selectedDashboardVideo],
  );

  // Live 投放策略推荐: when a dashboard video is selected, fetch the engine's
  // recommendation for its (商品一级类目 × 商品成交类型) group. Re-keyed by the
  // group + weighting posture, so changing 效率/规模 优先 refetches. A 404 (group
  // has no data) is rendered as empty, not an error.
  const productCategory = selectedDashboardVideo?.creativeFactors.productCategory;
  const dealType = selectedDashboardVideo?.creativeFactors.dealType;
  useEffect(() => {
    if (!productCategory || !dealType) {
      setRecommendation(null);
      setRecommendationMeta(null);
      setRecommendationError(null);
      setRecommendationLoading(false);
      return;
    }
    let cancelled = false;
    setRecommendationLoading(true);
    setRecommendationError(null);
    getGroupRecommendation(productCategory, dealType, weightsFor(weightMode))
      .then((response) => {
        if (cancelled) return;
        setRecommendation(response.data);
        setRecommendationMeta(response.meta);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRecommendation(null);
        setRecommendationMeta(null);
        setRecommendationError(
          isGroupNotFoundError(error)
            ? null
            : error instanceof Error
              ? error.message
              : String(error),
        );
      })
      .finally(() => {
        if (!cancelled) setRecommendationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productCategory, dealType, weightMode]);

  const selectDashboardVideo = useCallback((id: string) => {
    setSelectedDashboardVideoId(id);
    setActiveView("diagnosis");
  }, []);

  const handleAssistantAction = useCallback((action: string) => {
    const target =
      action === "scroll-matrix"
        ? matrixRef.current
        : action === "scroll-channel"
          ? channelRef.current
          : null;
    if (!target || typeof window === "undefined") return;
    const top = target.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  return {
    snapshot,
    activeView,
    setActiveView,
    selectedVideoId,
    platform,
    channelId,
    range,
    goal,
    channelMetric,
    strategyMetric,
    video,
    channel,
    kpis,
    dashboardVideos,
    selectedDashboardVideoId: selectedDashboardVideo?.id ?? selectedDashboardVideoId,
    selectedDashboardVideo,
    dashboardVideoContext,
    weightMode,
    setWeightMode,
    recommendation,
    recommendationMeta,
    recommendationLoading,
    recommendationError,
    chatOpen,
    toast,
    channelRef,
    matrixRef,
    setVideo: setSelectedVideoId,
    setPlatform,
    setChannel: setChannelId,
    setRange,
    setGoal,
    setChannelMetric,
    setStrategyMetric,
    selectDashboardVideo,
    setChatOpen,
    fireToast,
    refreshDashboardVideos,
    handleAssistantAction,
  };
}
