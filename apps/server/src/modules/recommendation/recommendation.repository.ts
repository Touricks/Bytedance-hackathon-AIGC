import { creativeFactorsSchema } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import type { PerformanceRecord } from "./recommendation-engine.js";

/**
 * Loads one {@link PerformanceRecord} per external-KOL publication by joining
 * the dashboard video registry to its投放 metrics:
 *
 *   dashboard_video_artifacts (creative_factors)
 *     ──final_video_job_id ─→ external_kol_publications.job_id
 *     ──publication ────────→ latest external_kol_metrics snapshot
 *
 * `external_kol_metrics` are cumulative daily snapshots, so the row with the
 * greatest `created_at` per publication holds the final totals. Publications
 * whose video is not in the dashboard registry (no resolved creative factors)
 * are excluded — the engine groups on those four factors.
 */
const PERFORMANCE_SQL = `
  with latest as (
    select distinct on (m.publication_id)
      m.publication_id,
      m.impressions,
      m.clicks,
      m.conversions,
      m.spend_cents,
      m.gmv_cents
    from external_kol_metrics m
    order by m.publication_id, m.created_at desc
  )
  select
    d.creative_factors as creative_factors,
    p.id               as publication_id,
    p.platform         as platform,
    p.account_name     as account_name,
    l.impressions      as impressions,
    l.clicks           as clicks,
    l.conversions      as conversions,
    l.spend_cents      as spend_cents,
    l.gmv_cents        as gmv_cents
  from external_kol_publications p
  join dashboard_video_artifacts d on d.final_video_job_id = p.job_id
  join latest l on l.publication_id = p.id
  where p.job_id is not null
`;

interface PerformanceRow {
  creative_factors: unknown;
  publication_id: string;
  platform: string | null;
  account_name: string | null;
  impressions: string | number;
  clicks: string | number;
  conversions: string | number;
  spend_cents: string | number;
  gmv_cents: string | number;
}

function toRecord(row: PerformanceRow): PerformanceRecord | null {
  const parsed = creativeFactorsSchema.safeParse(row.creative_factors);
  if (!parsed.success) return null; // skip rows with malformed/legacy factors
  return {
    creativeFactors: parsed.data,
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    conversions: Number(row.conversions),
    spendCents: Number(row.spend_cents),
    gmvCents: Number(row.gmv_cents),
    publicationId: row.publication_id,
    platform: row.platform ?? undefined,
    accountName: row.account_name ?? undefined,
  };
}

export const recommendationRepository = {
  /** All analyzable publication performance records across every workspace. */
  async loadPerformanceRecords(): Promise<PerformanceRecord[]> {
    const result = await db.db2.pool().query<PerformanceRow>(PERFORMANCE_SQL);
    return result.rows
      .map(toRecord)
      .filter((record): record is PerformanceRecord => record !== null);
  },
};
