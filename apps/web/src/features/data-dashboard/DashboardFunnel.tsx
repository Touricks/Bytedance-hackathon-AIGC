import type { DashboardFunnelStep } from "./dashboardTypes.js";

const FUNNEL_COLORS = [
  ["#7A68F2", "#6354E8"],
  ["#5681EE", "#3E63D6"],
  ["#2FA6CC", "#2F8FC4"],
  ["#1CC0A2", "#13A98C"],
  ["#F6A93B", "#F0892A"],
];
// Trapezoid half-widths for each stage boundary (6 boundaries for 5 stages).
const FUNNEL_F = [1, 0.8, 0.63, 0.49, 0.38, 0.3];

/** Custom SVG conversion funnel — ported from the design `FunnelChart`. */
export function DashboardFunnel({ steps }: { steps: DashboardFunnelStep[] }) {
  const W = 560;
  const H = 256;
  const top = 8;
  const gap = 7;
  const h = 44;
  const cx = 196;
  const maxHalf = 150;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      className="dash-funnel-svg"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="转化漏斗"
    >
      <defs>
        {FUNNEL_COLORS.map((pair, index) => (
          <linearGradient key={index} id={`dash-fg${index}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={pair[0]} />
            <stop offset="100%" stopColor={pair[1]} />
          </linearGradient>
        ))}
      </defs>
      {steps.slice(0, 5).map((step, index) => {
        const y = top + index * (h + gap);
        const topHalf = (FUNNEL_F[index] ?? 0) * maxHalf;
        const bottomHalf = (FUNNEL_F[index + 1] ?? 0) * maxHalf;
        const points = `${cx - topHalf},${y} ${cx + topHalf},${y} ${cx + bottomHalf},${y + h} ${cx - bottomHalf},${y + h}`;
        const midY = y + h / 2;
        return (
          <g key={step.key}>
            <polygon points={points} fill={`url(#dash-fg${index})`} />
            <text
              x={cx}
              y={midY - 4}
              textAnchor="middle"
              fill="#fff"
              fontSize="12.5"
              fontWeight="600"
              style={{ opacity: 0.92 }}
            >
              {step.label}
            </text>
            <text
              x={cx}
              y={midY + 13}
              textAnchor="middle"
              fill="#fff"
              fontSize="14"
              fontWeight="700"
              className="tabnum"
            >
              {step.displayValue}
            </text>
            <text
              x={W - 8}
              y={midY - 2}
              textAnchor="end"
              fill="#1E2230"
              fontSize="15"
              fontWeight="700"
              className="tabnum"
            >
              {step.totalRate}%
            </text>
            {step.stepRate != null ? (
              <text x={W - 8} y={midY + 14} textAnchor="end" fill="#9298AA" fontSize="11">
                步转 {step.stepRate}%
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
