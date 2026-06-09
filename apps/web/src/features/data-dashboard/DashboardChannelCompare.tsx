import {
  channelMetricColor,
  fmtNum,
  metricDisplay,
} from "./dashboardFormatters.js";
import type { ChannelMetric, DashboardChannel } from "./dashboardTypes.js";

type ChannelMetricsKey = keyof DashboardChannel["metrics"];

const COMPARE_COLUMNS: { key: ChannelMetricsKey; label: string; fmt: (value: number) => string }[] = [
  { key: "ctr", label: "CTR", fmt: (v) => `${v}%` },
  { key: "retain3s", label: "3s留存", fmt: (v) => `${v}%` },
  { key: "complete", label: "完播", fmt: (v) => `${v}%` },
  { key: "cvr", label: "CVR", fmt: (v) => `${v}%` },
  { key: "roas", label: "ROAS", fmt: (v) => v.toFixed(2) },
  { key: "gmv", label: "GMV", fmt: (v) => `¥${fmtNum(v)}` },
];

/**
 * Cross-channel comparison: gradient horizontal bars + a detail table whose
 * rows switch the dashboard scope on click — ported from the design.
 */
export function DashboardChannelCompare({
  channels,
  metric,
  channelId,
  onPick,
}: {
  channels: DashboardChannel[];
  metric: ChannelMetric;
  channelId: string;
  onPick: (id: string) => void;
}) {
  const maxValue = Math.max(...channels.map((channel) => channel.metrics[metric]));

  return (
    <div className="dash-ch-split">
      <div className="dash-ch-chart">
        <div className="dash-hbar">
          {channels.map((channel) => {
            const value = channel.metrics[metric];
            const pct = Math.max(6, (value / maxValue) * 100);
            return (
              <div className="dash-hbar-row" key={channel.id}>
                <div className="dash-hbar-label" title={channel.name}>
                  {channel.name}
                </div>
                <div className="dash-hbar-track">
                  <div
                    className="dash-hbar-fill"
                    style={{
                      width: `${pct}%`,
                      background: channel.isBest
                        ? channelMetricColor[metric]
                        : "linear-gradient(90deg,#D4D7E2,#C5C9D8)",
                      opacity: channel.isBest ? 1 : 0.9,
                    }}
                  />
                </div>
                <div
                  className="dash-hbar-val"
                  style={{ color: channel.isBest ? "#1E2230" : "#5B6173" }}
                >
                  {metricDisplay(metric, value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dash-ch-table">
        <div className="dash-ch-row dash-ch-head">
          <div className="dash-ch-name">渠道</div>
          {COMPARE_COLUMNS.map((column) => (
            <div key={column.key} className="dash-ch-cell">
              {column.label}
            </div>
          ))}
        </div>
        {channels.map((channel) => {
          const active = channel.id === channelId;
          return (
            <button
              type="button"
              key={channel.id}
              className={
                "dash-ch-row" + (active ? " is-active" : "") + (channel.isBest ? " is-best" : "")
              }
              onClick={() => onPick(channel.id)}
            >
              <div className="dash-ch-name">
                <span
                  className="dash-ch-dot"
                  style={{
                    background: channel.isBest ? "#1FAE6B" : active ? "#6457E8" : "#C9CCDA",
                  }}
                />
                <div className="dash-ch-name-txt">
                  <b>{channel.name}</b>
                  <span>
                    {channel.tier} · {channel.platform.replace("TikTok Shop · ", "TikTok ")}
                  </span>
                </div>
                {channel.isBest ? <span className="dash-ch-best">最佳</span> : null}
              </div>
              {COMPARE_COLUMNS.map((column) => (
                <div
                  key={column.key}
                  className={"dash-ch-cell" + (column.key === "roas" ? " ch-strong" : "")}
                >
                  {column.fmt(channel.metrics[column.key])}
                </div>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
