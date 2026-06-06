import { nanoid } from "nanoid";
import { creativeFactorsSchema } from "@aigc-video/shared";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import type { FinalVideoJobRow } from "../../db/client.js";
import type { ImportDashboardVideoRequest } from "./dashboard-video-artifact.schema.js";

export interface DashboardVideoArtifact {
  id: string;
  workspaceId: string;
  finalVideoJobId: string | null;
  name: string;
  localUrl: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  creativeTags: unknown;
  creativeFactors: unknown;
  metadata: unknown;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function toArtifact(row: Record<string, unknown>): DashboardVideoArtifact {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    finalVideoJobId: (row.final_video_job_id as string | null) ?? null,
    name: String(row.name),
    localUrl: String(row.local_url),
    durationSec: row.duration_sec === null ? null : Number(row.duration_sec),
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    creativeTags: row.creative_tags ?? {},
    creativeFactors: row.creative_factors ?? null,
    metadata: row.metadata ?? {},
    importedAt: iso(row.imported_at as Date | string),
    createdAt: iso(row.created_at as Date | string),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

function creativeTagsFromFinalVideoJob(job: FinalVideoJobRow) {
  if (!isRecord(job.compiledManifest)) return {};
  const tags = job.compiledManifest.creativeTags;
  return isRecord(tags) ? tags : {};
}

function creativeFactorsFromTags(tags: unknown) {
  if (!isRecord(tags)) return null;
  const parsed = creativeFactorsSchema.safeParse(tags.creativeFactors);
  return parsed.success ? parsed.data : null;
}

async function ensureImportableFinalVideo(
  workspaceId: string,
  finalVideoJobId: string,
) {
  const job = await db.db2.getFinalVideoJob(finalVideoJobId);
  if (job.workspaceId !== workspaceId) {
    throw new HttpError(
      400,
      "FINAL_VIDEO_WORKSPACE_MISMATCH",
      "finalVideoJobId does not belong to workspace",
    );
  }
  if (job.status !== "SUCCEEDED" || !job.localUrl) {
    throw new HttpError(
      409,
      "FINAL_VIDEO_NOT_READY",
      "Only completed final videos can be imported into the dashboard",
    );
  }
  return job;
}

export const dashboardVideoArtifactService = {
  async importFinalVideo(
    workspaceId: string,
    input: ImportDashboardVideoRequest,
  ) {
    await db.getWorkspace(workspaceId);
    const job = await ensureImportableFinalVideo(workspaceId, input.finalVideoJobId);
    const creativeTags = creativeTagsFromFinalVideoJob(job);
    const creativeFactors = creativeFactorsFromTags(creativeTags);
    const id = nanoid();
    const result = await db.db2.pool().query(
      `insert into dashboard_video_artifacts
        (id, workspace_id, final_video_job_id, name, local_url, duration_sec,
         width, height, creative_tags, creative_factors, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning *`,
      [
        id,
        workspaceId,
        input.finalVideoJobId,
        input.name,
        job.localUrl,
        job.durationSec,
        job.width,
        job.height,
        JSON.stringify(creativeTags),
        creativeFactors ? JSON.stringify(creativeFactors) : null,
        JSON.stringify({
          compiledManifestHash: job.compiledManifestHash,
          finalVideoCompletedAt: job.completedAt,
          sourceShotVideoIds: job.sourceShotVideoIds,
          sourceVideoScriptArtifactIds: job.sourceVideoScriptArtifactIds,
        }),
      ],
    );
    return { data: toArtifact(result.rows[0]) };
  },

  async list(workspaceId: string) {
    await db.getWorkspace(workspaceId);
    const result = await db.db2.pool().query(
      `select *
       from dashboard_video_artifacts
       where workspace_id = $1
       order by imported_at desc, created_at desc
       limit 100`,
      [workspaceId],
    );
    return { data: result.rows.map(toArtifact) };
  },

  async get(workspaceId: string, artifactId: string) {
    await db.getWorkspace(workspaceId);
    const result = await db.db2.pool().query(
      `select *
       from dashboard_video_artifacts
       where workspace_id = $1 and id = $2`,
      [workspaceId, artifactId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError("DashboardVideoArtifact");
    return { data: toArtifact(row) };
  },
};
