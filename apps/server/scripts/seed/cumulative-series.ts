/**
 * Pure generator for a publication's daily cumulative metric snapshots.
 *
 * Given the final cumulative totals and a day count, it backfills one snapshot
 * per day whose values grow monotonically from ~0 up to exactly `finalTotals`
 * on the last day. Deterministic: no Date.now()/Math.random() — the dates are
 * derived from `startDateISO`. Ratios (ctr/cvr/roas) are intentionally NOT
 * produced here; they are derived at read time from these raw counts.
 */

export interface MetricCounts {
  impressions: number;
  clicks: number;
  conversions: number;
  spendCents: number;
  gmvCents: number;
}

export interface MetricSnapshot extends MetricCounts {
  /** Backdated ISO timestamp for this snapshot's day. */
  createdAtISO: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const METRIC_KEYS: (keyof MetricCounts)[] = [
  "impressions",
  "clicks",
  "conversions",
  "spendCents",
  "gmvCents",
];

export function buildCumulativeSeries(
  finalTotals: MetricCounts,
  days: number,
  startDateISO: string,
): MetricSnapshot[] {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`days must be a positive integer, got ${days}`);
  }
  const startMs = new Date(startDateISO).getTime();
  if (Number.isNaN(startMs)) {
    throw new Error(`startDateISO is not a valid date: ${startDateISO}`);
  }

  const series: MetricSnapshot[] = [];
  for (let day = 0; day < days; day++) {
    // Linear cumulative growth: fraction goes 1/days .. days/days (== 1 on the
    // last day), so the series ends exactly at finalTotals.
    const fraction = (day + 1) / days;
    const createdAtISO = new Date(startMs + day * MS_PER_DAY).toISOString();
    const snapshot = { createdAtISO } as MetricSnapshot;
    for (const key of METRIC_KEYS) {
      snapshot[key] = Math.round(finalTotals[key] * fraction);
    }
    series.push(snapshot);
  }
  return series;
}
