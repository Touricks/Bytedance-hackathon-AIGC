import { Fragment, useState } from "react";
import { fmtNum, heatmapColor, heatmapTextColor } from "./dashboardFormatters.js";
import { DashboardSegmented } from "./DashboardControls.js";
import type { ComboMatrixMetric } from "./dashboardTypes.js";
import type { CreativeFactors } from "@aigc-video/shared";
import type {
  ComboCell,
  GroupRecommendation,
} from "../../lib/api/dashboardRecommendations.js";

const METRIC_OPTIONS: { value: ComboMatrixMetric; label: string }[] = [
  { value: "roas", label: "ROAS" },
  { value: "gmv", label: "单视频GMV" },
  { value: "score", label: "综合评分" },
];

function metricValue(cell: ComboCell, metric: ComboMatrixMetric): number {
  if (metric === "gmv") return cell.gmvPerVideoCents;
  if (metric === "score") return cell.score;
  return cell.roas;
}

function metricDisplay(cell: ComboCell, metric: ComboMatrixMetric): string {
  if (metric === "gmv") return `¥${fmtNum(cell.gmvPerVideoCents / 100)}`;
  if (metric === "score") return cell.score.toFixed(2);
  return cell.roas.toFixed(2);
}

/** Normalize within the cells present for the selected metric (inline min/max). */
function norm(value: number, lo: number, hi: number): number {
  if (!(hi > lo)) return 1;
  return (value - lo) / (hi - lo);
}

/**
 * Live 适用人群 × 推销手法 effectiveness heatmap over the engine's group.cells —
 * replaces the static 推销手法 × 渠道 matrix. Rows are the audiences and columns
 * the strategies observed in the group; the best (rank 1) cell is starred and
 * the selected video's audience row / strategy column are highlighted.
 */
export function DashboardComboMatrix({
  recommendation,
  loading,
  selectedFactors,
}: {
  recommendation: GroupRecommendation | null;
  loading: boolean;
  selectedFactors: CreativeFactors;
}) {
  const [metric, setMetric] = useState<ComboMatrixMetric>("roas");

  if (loading) {
    return <p className="dash-srec-note">正在计算各组合效果…</p>;
  }
  if (!recommendation || recommendation.cells.length === 0) {
    return (
      <p className="dash-srec-note">
        该「商品一级类目 × 商品成交类型」分组暂无足够投放数据。
      </p>
    );
  }

  const cells = recommendation.cells;
  const byCombo = new Map<string, ComboCell>();
  for (const cell of cells) byCombo.set(`${cell.audience}::${cell.strategy}`, cell);

  // Distinct axes, preserving first-seen order.
  const audiences = dedupe(cells.map((c) => ({ value: c.audience, label: c.audienceLabel })));
  const strategies = dedupe(cells.map((c) => ({ value: c.strategy, label: c.strategyLabel })));

  const values = cells.map((c) => metricValue(c, metric));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // `cells` is non-empty (guarded above), so `best` is always defined.
  const best: ComboCell = cells.find((c) => c.rank === 1) ?? cells[0]!;

  return (
    <div className="dash-mtx">
      <div className="dash-mtx-toolbar">
        <DashboardSegmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
      </div>
      <div
        className="dash-mtx-grid"
        style={{ gridTemplateColumns: `132px repeat(${strategies.length}, 1fr)` }}
      >
        <div className="dash-mtx-corner">适用人群 \ 推销手法</div>
        {strategies.map((strategy) => (
          <div
            key={strategy.value}
            className={
              "dash-mtx-chhead" +
              (strategy.value === selectedFactors.strategy ? " is-cur" : "")
            }
          >
            <b>{strategy.label}</b>
          </div>
        ))}

        {audiences.map((audience) => (
          <Fragment key={audience.value}>
            <div
              className={
                "dash-mtx-rowhead" +
                (audience.value === selectedFactors.audience ? " is-cur" : "")
              }
            >
              <b>{audience.label}</b>
              {audience.value === selectedFactors.audience ? (
                <span className="dash-mtx-flag cur">现</span>
              ) : null}
            </div>
            {strategies.map((strategy) => {
              const cell = byCombo.get(`${audience.value}::${strategy.value}`);
              if (!cell) {
                return (
                  <div key={strategy.value} className="dash-mtx-cell">
                    --
                  </div>
                );
              }
              const t = norm(metricValue(cell, metric), lo, hi);
              const isBest = cell === best;
              const colCur = strategy.value === selectedFactors.strategy;
              return (
                <div
                  key={strategy.value}
                  className={
                    "dash-mtx-cell" +
                    (isBest ? " is-best" : "") +
                    (colCur ? " col-cur" : "")
                  }
                  style={{ background: heatmapColor(t), color: heatmapTextColor(t) }}
                  title={`样本 n=${cell.sampleCount}`}
                >
                  {metricDisplay(cell, metric)}
                  {isBest ? <span className="dash-mtx-star">★</span> : null}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="dash-mtx-legend">
        <span className="dash-mtx-scale">
          <i>低</i>
          <span className="dash-mtx-grad" />
          <i>高 {METRIC_OPTIONS.find((m) => m.value === metric)?.label}</i>
        </span>
        <span className="dash-mtx-best-note">
          ★ 最优组合：{best.audienceLabel} × {best.strategyLabel}（{metricDisplay(best, metric)}）
        </span>
      </div>
    </div>
  );
}

function dedupe<T extends { value: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.value)) continue;
    seen.add(item.value);
    out.push(item);
  }
  return out;
}
