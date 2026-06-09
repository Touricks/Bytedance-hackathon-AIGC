import { DashboardAdvisor } from "./DashboardAdvisor.js";
import { DashboardCard } from "./DashboardCard.js";
import { DashboardChannelCompare } from "./DashboardChannelCompare.js";
import { DashboardSegmented } from "./DashboardControls.js";
import { DashboardFilterBar } from "./DashboardFilterBar.js";
import { DashboardFunnel } from "./DashboardFunnel.js";
import { DashboardMetricCards } from "./DashboardMetricCards.js";
import { DashboardScopeBar } from "./DashboardScopeBar.js";
import { DashboardStrategyMatrix } from "./DashboardStrategyMatrix.js";
import type { ChannelMetric, StrategyMetric } from "./dashboardTypes.js";
import type { DataDashboardViewModel } from "./useDataDashboardViewModel.js";

const CHANNEL_METRIC_OPTIONS: { value: ChannelMetric; label: string }[] = [
  { value: "roas", label: "ROAS" },
  { value: "cvr", label: "CVR" },
  { value: "ctr", label: "CTR" },
  { value: "complete", label: "完播率" },
];

const STRATEGY_METRIC_OPTIONS: { value: StrategyMetric; label: string }[] = [
  { value: "roas", label: "ROAS" },
  { value: "cvr", label: "CVR" },
  { value: "ctr", label: "CTR" },
];

export function DashboardOverview({ vm }: { vm: DataDashboardViewModel }) {
  const { snapshot } = vm;
  const videoContext = vm.dashboardVideoContext;

  if (!videoContext) {
    return (
      <>
        <DashboardFilterBar vm={vm} />
        <DashboardCard
          title="选择数据面板视频"
          badge="V"
          info="分析诊断会基于已导入成片展示当前视频上下文"
        >
          <div className="dash-empty-panel">
            <strong>暂无选中视频</strong>
            <span>请先从视频列表选择一条已导入成片。</span>
            <button
              type="button"
              className="dash-hbtn dash-empty-action"
              onClick={() => vm.setActiveView("videos")}
            >
              前往视频列表
            </button>
          </div>
        </DashboardCard>
      </>
    );
  }

  return (
    <>
      <DashboardFilterBar vm={vm} />
      <DashboardScopeBar snapshot={snapshot} video={videoContext} channel={vm.channel} />
      <DashboardMetricCards kpis={vm.kpis} />

      <div className="dash-grid-main">
        <div className="dash-col-left">
          <DashboardCard
            title="转化漏斗"
            badge="A"
            info="曝光 → 点击 → 到商品页 → 加购 → 下单"
            right={
              <span className="dash-ov-conv">
                整体转化 <b>{vm.channel.metrics.cvr}%</b>
              </span>
            }
          >
            <DashboardFunnel steps={snapshot.funnel} />
          </DashboardCard>

          <div ref={vm.channelRef}>
            <DashboardCard
              title="多渠道对比 · 同一条视频"
              badge="B"
              info="同一条视频在不同 KOL / 平台渠道的分发表现"
              right={
                <DashboardSegmented
                  options={CHANNEL_METRIC_OPTIONS}
                  value={vm.channelMetric}
                  onChange={vm.setChannelMetric}
                />
              }
            >
              <DashboardChannelCompare
                channels={snapshot.channels}
                metric={vm.channelMetric}
                channelId={vm.channelId}
                onPick={vm.setChannel}
              />
            </DashboardCard>
          </div>

          <div ref={vm.matrixRef}>
            <DashboardCard
              title="推销手法 × 量化渠道 · 效果矩阵"
              badge="C"
              info="按发布记录聚合：每种推销手法在各渠道的表现"
              right={
                <DashboardSegmented
                  options={STRATEGY_METRIC_OPTIONS}
                  value={vm.strategyMetric}
                  onChange={vm.setStrategyMetric}
                />
              }
            >
              <DashboardStrategyMatrix
                snapshot={snapshot}
                channels={snapshot.channels}
                metric={vm.strategyMetric}
                currentChannelId={vm.channelId}
              />
            </DashboardCard>
          </div>
        </div>

        <DashboardAdvisor snapshot={snapshot} video={videoContext} />
      </div>
    </>
  );
}
