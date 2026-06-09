import { Fragment } from "react";
import {
  computeMatrixScale,
  heatmapColor,
  heatmapTextColor,
  matrixMetricDisplay,
  matrixNorm,
  strategyMetricLabels,
} from "./dashboardFormatters.js";
import type {
  DashboardAnalyticsSnapshot,
  DashboardChannel,
  StrategyMetric,
} from "./dashboardTypes.js";

/**
 * 推销手法 × 量化渠道 effectiveness heatmap — ported from the design `StrategyMatrix`.
 * Highlights the current channel column, current/recommended strategy rows, and
 * stars the single best cell across the matrix for the selected metric.
 */
export function DashboardStrategyMatrix({
  snapshot,
  channels,
  metric,
  currentChannelId,
}: {
  snapshot: DashboardAnalyticsSnapshot;
  channels: DashboardChannel[];
  metric: StrategyMetric;
  currentChannelId: string;
}) {
  const rows = snapshot.strategyMatrix.rows;
  const channelIds = channels.map((channel) => channel.id);
  const scale = computeMatrixScale(rows, channelIds, metric);
  const bestChannel = scale.best
    ? channels.find((channel) => channel.id === scale.best!.channelId)
    : undefined;
  const bestStrategyLabel = scale.best
    ? snapshot.factorCatalog.strategies[scale.best.strategy].label
    : "";

  return (
    <div className="dash-mtx">
      <div
        className="dash-mtx-grid"
        style={{ gridTemplateColumns: `132px repeat(${channels.length}, 1fr)` }}
      >
        <div className="dash-mtx-corner">推销手法 \ 渠道</div>
        {channels.map((channel) => (
          <div
            key={channel.id}
            className={"dash-mtx-chhead" + (channel.id === currentChannelId ? " is-cur" : "")}
          >
            <b>{channel.name.replace(" / 商城", "")}</b>
            <span>{channel.tier}</span>
          </div>
        ))}

        {rows.map((row) => {
          const strategy = snapshot.factorCatalog.strategies[row.strategy];
          return (
            <Fragment key={row.strategy}>
              <div
                className={
                  "dash-mtx-rowhead" +
                  (row.isCurrent ? " is-cur" : "") +
                  (row.isRecommended ? " is-rec" : "")
                }
                title={strategy.flow}
              >
                <b>{strategy.label}</b>
                {row.isRecommended ? <span className="dash-mtx-flag rec">荐</span> : null}
                {row.isCurrent ? <span className="dash-mtx-flag cur">现</span> : null}
                <i className="dash-mtx-samples">n={row.samples}</i>
              </div>
              {channels.map((channel) => {
                const value = row.metricsByChannel[channel.id]?.[metric];
                if (value == null) {
                  return (
                    <div key={channel.id} className="dash-mtx-cell">
                      --
                    </div>
                  );
                }
                const t = matrixNorm(value, scale);
                const isBest =
                  scale.best?.strategy === row.strategy && scale.best?.channelId === channel.id;
                return (
                  <div
                    key={channel.id}
                    className={
                      "dash-mtx-cell" +
                      (isBest ? " is-best" : "") +
                      (channel.id === currentChannelId ? " col-cur" : "")
                    }
                    style={{ background: heatmapColor(t), color: heatmapTextColor(t) }}
                  >
                    {matrixMetricDisplay(metric, value)}
                    {isBest ? <span className="dash-mtx-star">★</span> : null}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      <div className="dash-mtx-legend">
        <span className="dash-mtx-scale">
          <i>低</i>
          <span className="dash-mtx-grad" />
          <i>高 {strategyMetricLabels[metric]}</i>
        </span>
        {scale.best && bestChannel ? (
          <span className="dash-mtx-best-note">
            ★ 最优组合：{bestStrategyLabel} × {bestChannel.name}（
            {matrixMetricDisplay(metric, scale.best.value)}）
          </span>
        ) : null}
      </div>
    </div>
  );
}
