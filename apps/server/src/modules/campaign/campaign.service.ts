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
  ctr: number | null;
  capturedAt: string;
  source: string;
  metadata: unknown;
  createdAt: string;
}

export interface CampaignPublication {
  id: string;
  workspaceId: string;
  finalVideoJobId: string | null;
  platform: string;
  channelName: string;
  kolName: string | null;
  publishUrl: string | null;
  status: "planned" | "published" | "failed" | "archived";
  notes: string | null;
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
  return {
    id: String(row.id),
    publicationId: String(row.publication_id),
    impressions,
    clicks,
    conversions: Number(row.conversions),
    spendCents: Number(row.spend_cents),
    ctr: impressions > 0 ? clicks / impressions : null,
    capturedAt: iso(row.captured_at as Date | string),
    source: String(row.source),
    metadata: row.metadata,
    createdAt: iso(row.created_at as Date | string),
  };
}

function toPublication(row: Record<string, unknown>): CampaignPublication {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    finalVideoJobId: (row.final_video_job_id as string | null) ?? null,
    platform: String(row.platform),
    channelName: String(row.channel_name),
    kolName: (row.kol_name as string | null) ?? null,
    publishUrl: (row.publish_url as string | null) ?? null,
    status: row.status as CampaignPublication["status"],
    notes: (row.notes as string | null) ?? null,
    latestMetrics: row.metrics_id
      ? toMetrics({
          id: row.metrics_id,
          publication_id: row.id,
          impressions: row.metrics_impressions,
          clicks: row.metrics_clicks,
          conversions: row.metrics_conversions,
          spend_cents: row.metrics_spend_cents,
          captured_at: row.metrics_captured_at,
          source: row.metrics_source,
          metadata: row.metrics_metadata,
          created_at: row.metrics_created_at,
        })
      : null,
    createdAt: iso(row.created_at as Date | string),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

async function ensureFinalVideoInWorkspace(
  workspaceId: string,
  finalVideoJobId?: string,
) {
  if (!finalVideoJobId) return;
  const job = await db.db2.getFinalVideoJob(finalVideoJobId);
  if (job.workspaceId !== workspaceId) {
    throw new HttpError(
      400,
      "FINAL_VIDEO_WORKSPACE_MISMATCH",
      "finalVideoJobId does not belong to workspace",
    );
  }
}

const publicationSelect = `
  select p.*,
    m.id as metrics_id,
    m.impressions as metrics_impressions,
    m.clicks as metrics_clicks,
    m.conversions as metrics_conversions,
    m.spend_cents as metrics_spend_cents,
    m.captured_at as metrics_captured_at,
    m.source as metrics_source,
    m.metadata as metrics_metadata,
    m.created_at as metrics_created_at
  from campaign_publications p
  left join lateral (
    select *
    from campaign_publication_metrics
    where publication_id = p.id
    order by captured_at desc, created_at desc
    limit 1
  ) m on true
`;

export const campaignService = {
  async createPublication(
    workspaceId: string,
    input: CreateCampaignPublicationRequest,
  ) {
    await db.getWorkspace(workspaceId);
    await ensureFinalVideoInWorkspace(workspaceId, input.finalVideoJobId);
    const pool = db.db2.pool();
    const id = nanoid();
    await pool.query(
      `insert into campaign_publications
        (id, workspace_id, final_video_job_id, platform, channel_name, kol_name,
         publish_url, status, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        workspaceId,
        input.finalVideoJobId ?? null,
        input.platform,
        input.channelName,
        input.kolName ?? null,
        input.publishUrl ?? null,
        input.status,
        input.notes ?? null,
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
      `insert into campaign_publication_metrics
        (id, publication_id, impressions, clicks, conversions, spend_cents,
         captured_at, source, metadata)
       values ($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now()),$8,$9)
       returning *`,
      [
        nanoid(),
        publicationId,
        input.impressions,
        input.clicks,
        input.conversions,
        input.spendCents,
        input.capturedAt ?? null,
        input.source,
        JSON.stringify(input.metadata),
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
