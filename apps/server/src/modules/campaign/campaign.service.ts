import { nanoid } from "nanoid";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import type {
  CreateCampaignPublicationRequest,
  RecordCampaignMetricsRequest,
} from "./campaign.schema.js";

export interface CampaignMetrics {
  id: string;
  publicationId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spendCents: number;
  gmvCents: number;
  ctr: number | null;
  cvr: number | null;
  roas: number | null;
  createdAt: string;
  updatedAt: string;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export interface CampaignPublication {
  id: string;
  workspaceId: string;
  jobId: string | null;
  platform: string;
  accountName: string;
  publishUrl: string | null;
  publishedAt: string;
  latestMetrics: CampaignMetrics | null;
  createdAt: string;
  updatedAt: string;
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function toMetrics(row: Record<string, unknown>): CampaignMetrics {
  const impressions = Number(row.impressions);
  const clicks = Number(row.clicks);
  const conversions = Number(row.conversions);
  const spendCents = Number(row.spend_cents);
  const gmvCents = Number(row.gmv_cents);
  return {
    id: String(row.id),
    publicationId: String(row.publication_id),
    impressions,
    clicks,
    conversions,
    spendCents,
    gmvCents,
    ctr: ratio(clicks, impressions),
    cvr: ratio(conversions, clicks),
    roas: ratio(gmvCents, spendCents),
    createdAt: iso(row.created_at as Date | string),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

function toPublication(row: Record<string, unknown>): CampaignPublication {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    jobId: (row.job_id as string | null) ?? null,
    platform: String(row.platform),
    accountName: String(row.account_name),
    publishUrl: (row.publish_url as string | null) ?? null,
    publishedAt: iso(row.published_at as Date | string),
    latestMetrics: row.metrics_id
      ? toMetrics({
          id: row.metrics_id,
          publication_id: row.id,
          impressions: row.metrics_impressions,
          clicks: row.metrics_clicks,
          conversions: row.metrics_conversions,
          spend_cents: row.metrics_spend_cents,
          gmv_cents: row.metrics_gmv_cents,
          created_at: row.metrics_created_at,
          updated_at: row.metrics_updated_at,
        })
      : null,
    createdAt: iso(row.created_at as Date | string),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

async function ensureFinalVideoInWorkspace(workspaceId: string, jobId?: string) {
  if (!jobId) return null;
  const job = await db.db2.getFinalVideoJob(jobId);
  if (job.workspaceId !== workspaceId) {
    throw new HttpError(
      400,
      "FINAL_VIDEO_WORKSPACE_MISMATCH",
      "jobId does not belong to workspace",
    );
  }
  return job;
}

const publicationSelect = `
  select p.*,
    m.id as metrics_id,
    m.impressions as metrics_impressions,
    m.clicks as metrics_clicks,
    m.conversions as metrics_conversions,
    m.spend_cents as metrics_spend_cents,
    m.gmv_cents as metrics_gmv_cents,
    m.created_at as metrics_created_at,
    m.updated_at as metrics_updated_at
  from external_kol_publications p
  left join lateral (
    select *
    from external_kol_metrics
    where publication_id = p.id
    order by created_at desc
    limit 1
  ) m on true
`;

export const campaignService = {
  async createPublication(
    workspaceId: string,
    input: CreateCampaignPublicationRequest,
  ) {
    await db.getWorkspace(workspaceId);
    await ensureFinalVideoInWorkspace(workspaceId, input.jobId);
    const pool = db.db2.pool();
    const id = nanoid();
    await pool.query(
      `insert into external_kol_publications
        (id, workspace_id, job_id, platform, account_name, publish_url,
         published_at)
       values ($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now()))`,
      [
        id,
        workspaceId,
        input.jobId ?? null,
        input.platform,
        input.accountName,
        input.publishUrl ?? null,
        input.publishedAt ?? null,
      ],
    );
    return { data: await this.getPublicationData(workspaceId, id) };
  },

  async listPublications(workspaceId: string) {
    await db.getWorkspace(workspaceId);
    const result = await db.db2.pool().query(
      `${publicationSelect}
       where p.workspace_id = $1
       order by p.created_at desc
       limit 100`,
      [workspaceId],
    );
    return { data: result.rows.map(toPublication) };
  },

  async getPublication(workspaceId: string, publicationId: string) {
    return { data: await this.getPublicationData(workspaceId, publicationId) };
  },

  async recordMetrics(
    workspaceId: string,
    publicationId: string,
    input: RecordCampaignMetricsRequest,
  ) {
    await this.getPublicationData(workspaceId, publicationId);
    const result = await db.db2.pool().query(
      `insert into external_kol_metrics
        (id, publication_id, impressions, clicks, conversions, spend_cents,
         gmv_cents)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning *`,
      [
        nanoid(),
        publicationId,
        input.impressions,
        input.clicks,
        input.conversions,
        input.spendCents,
        input.gmvCents,
      ],
    );
    return { data: toMetrics(result.rows[0]) };
  },

  async getPublicationData(workspaceId: string, publicationId: string) {
    await db.getWorkspace(workspaceId);
    const result = await db.db2.pool().query(
      `${publicationSelect}
       where p.workspace_id = $1 and p.id = $2`,
      [workspaceId, publicationId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError("CampaignPublication");
    }
    return toPublication(row);
  },
};
