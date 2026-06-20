import { DashboardAdvisor } from "./DashboardAdvisor.js";
import { DashboardCard } from "./DashboardCard.js";
import { DashboardChannelCompare } from "./DashboardChannelCompare.js";
import { DashboardComboMatrix } from "./DashboardComboMatrix.js";
import { DashboardSegmented } from "./DashboardControls.js";
import { DashboardFilterBar } from "./DashboardFilterBar.js";
import { DashboardFunnel } from "./DashboardFunnel.js";
import { DashboardMetricCards } from "./DashboardMetricCards.js";
import { DashboardScopeBar } from "./DashboardScopeBar.js";
import type { ChannelMetric } from "./dashboardTypes.js";
import type { DataDashboardViewModel } from "./useDataDashboardViewModel.js";

const CHANNEL_METRIC_OPTIONS: { value: ChannelMetric; label: string }[] = [
  { value: "roas", label: "ROAS" },
  { value: "cvr", label: "CVR" },
  { value: "ctr", label: "CTR" },
  { value: "complete", label: "完播率" },
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
      <div className="dash-video-switcher">
        <span>
          当前诊断视频来自数据面板视频库，共 {vm.dashboardVideos.length} 条
        </span>
        <button
          type="button"
          className="dash-hbtn"
          onClick={() => vm.setActiveView("videos")}
        >
          切换视频
        </button>
      </div>
      <DashboardScopeBar snapshot={snapshot} video={videoContext} channel={vm.channel} />
      <DashboardMetricCards kpis={vm.kpis} />

      <div className="dash-grid-main">
        <div className="dash-col-left">
          <div ref={vm.matrixRef}>
            <DashboardCard
              title="适用人群 × 推销手法 · 效果矩阵"
              badge="A"
              accent
              info="推荐引擎按发布记录聚合：每个人群 × 推销手法组合的真实投放表现"
            >
              <DashboardComboMatrix
                recommendation={vm.recommendation}
                loading={vm.recommendationLoading}
                selectedFactors={videoContext.creativeFactors}
              />
            </DashboardCard>
          </div>

          <DashboardCard
            title="转化漏斗"
            badge="B"
            demo
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
              badge="C"
              demo
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
        </div>

        <DashboardAdvisor
          snapshot={snapshot}
          video={videoContext}
          recommendation={vm.recommendation}
          recommendationLoading={vm.recommendationLoading}
          recommendationError={vm.recommendationError}
          weightMode={vm.weightMode}
          onWeightModeChange={vm.setWeightMode}
        />
      </div>
    </>
  );
}
