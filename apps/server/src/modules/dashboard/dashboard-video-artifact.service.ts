import type { PoolClient } from "pg";
import { nanoid } from "nanoid";
import {
  type CreativeFactors,
  creativeFactorsSchema,
  dashboardVideoMetadataSchema,
} from "@aigc-video/shared";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import type { FinalVideoJobRow } from "../../db/client.js";
import { getWorkspaceStorageAdapter } from "../workspace/storage/workspace-storage-resolver.js";
import type { DashboardAssetLocator } from "./dashboard-asset-storage.js";
import {
  persistDashboardVideoAsset,
  streamDashboardVideoAsset,
} from "./dashboard-asset-storage.js";
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
  creativeFactors: CreativeFactors;
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
    creativeFactors: creativeFactorsSchema.parse(row.creative_factors),
    importedAt: iso(row.imported_at as Date | string),
    createdAt: iso(row.created_at as Date | string),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

function creativeFactorsFromFinalVideoJob(job: FinalVideoJobRow): CreativeFactors {
  const manifest = job.compiledManifest;
  const attribution = isRecord(manifest) ? manifest.creativeAttribution : undefined;
  const raw = isRecord(attribution) ? attribution.creativeFactors : undefined;
  const parsed = creativeFactorsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(
      409,
      "FINAL_VIDEO_MISSING_CREATIVE_FACTORS",
      "Final video has no resolved creative factors and cannot be imported into the dashboard",
    );
  }
  return parsed.data;
}

function dashboardVideoUrl(artifactId: string) {
  return `/api/dashboard/videos/${artifactId}/file`;
}

function dashboardMetadata(input: {
  artifactId: string;
  workspaceId: string;
  job: FinalVideoJobRow;
  name: string;
  localUrl: string;
  importedAt: string;
  creativeFactors: CreativeFactors;
  locator: DashboardAssetLocator;
}) {
  return dashboardVideoMetadataSchema.parse({
    schemaVersion: "dashboard-video-metadata",
    id: input.artifactId,
    workspaceId: input.workspaceId,
    finalVideoJobId: input.job.id,
    name: input.name,
    localUrl: input.localUrl,
    importedAt: input.importedAt,
    durationSec: input.job.durationSec,
    width: input.job.width,
    height: input.job.height,
    creativeFactors: input.creativeFactors,
    storage: {
      kind: input.locator.storageKind,
      bucket: input.locator.storageBucket,
      videoObjectKey: input.locator.videoObjectKey,
      metadataObjectKey: input.locator.metadataObjectKey,
      localAssetDir: input.locator.localAssetDir,
    },
    source: {
      finalVideoLocalPath: input.job.localPath,
      finalVideoLocalUrl: input.job.localUrl,
      finalVideoCompletedAt: input.job.completedAt,
      compiledManifestHash: input.job.compiledManifestHash,
      sourceShotVideoIds: input.job.sourceShotVideoIds,
      sourceVideoScriptArtifactIds: input.job.sourceVideoScriptArtifactIds,
    },
  });
}

async function persistDashboardAsset(input: {
  artifactId: string;
  workspaceId: string;
  job: FinalVideoJobRow;
  name: string;
  localUrl: string;
  importedAt: string;
  creativeFactors: CreativeFactors;
}) {
  if (!input.job.localPath) {
    throw new HttpError(
      409,
      "FINAL_VIDEO_NOT_READY",
      "Only completed final videos can be imported into the dashboard",
    );
  }
  const storage = await getWorkspaceStorageAdapter(input.workspaceId);
  return persistDashboardVideoAsset({
    artifactId: input.artifactId,
    sourceStorage: storage,
    sourceRelativePath: input.job.localPath,
    metadata: (locator) => dashboardMetadata({ ...input, locator }),
  });
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
  if (job.status !== "SUCCEEDED" || !job.localUrl || !job.localPath) {
    throw new HttpError(
      409,
      "FINAL_VIDEO_NOT_READY",
      "Only completed final videos can be imported into the dashboard",
    );
  }
  return job;
}

async function findExistingImport(
  client: PoolClient,
  finalVideoJobId: string,
) {
  const result = await client.query(
    `select *
     from dashboard_video_artifacts
     where final_video_job_id = $1
     order by imported_at asc, created_at asc
     limit 1`,
    [finalVideoJobId],
  );
  const row = result.rows[0];
  return row ? toArtifact(row) : null;
}

export const dashboardVideoArtifactService = {
  async importFinalVideo(
    workspaceId: string,
    input: ImportDashboardVideoRequest,
  ) {
    await db.getWorkspace(workspaceId);
    const job = await ensureImportableFinalVideo(workspaceId, input.finalVideoJobId);
    const creativeFactors = creativeFactorsFromFinalVideoJob(job);
    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      await client.query(
        `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`dashboard-video-import:${input.finalVideoJobId}`],
      );

      const existing = await findExistingImport(client, input.finalVideoJobId);
      if (existing) {
        await client.query("commit");
        return { data: existing };
      }

      const id = nanoid();
      const localUrl = dashboardVideoUrl(id);
      const importedAt = new Date().toISOString();
      const locator = await persistDashboardAsset({
        artifactId: id,
        workspaceId,
        job,
        name: input.name,
        localUrl,
        importedAt,
        creativeFactors,
      });
      const result = await client.query(
        `insert into dashboard_video_artifacts
          (id, workspace_id, final_video_job_id, name, local_url, duration_sec,
           width, height, creative_factors, imported_at, storage_kind,
           storage_bucket, video_object_key, metadata_object_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         returning *`,
        [
          id,
          workspaceId,
          input.finalVideoJobId,
          input.name,
          localUrl,
          job.durationSec,
          job.width,
          job.height,
          JSON.stringify(creativeFactors),
          importedAt,
          locator.storageKind,
          locator.storageBucket,
          locator.videoObjectKey,
          locator.metadataObjectKey,
        ],
      );
      await client.query("commit");
      return { data: toArtifact(result.rows[0]) };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async listAll() {
    const result = await db.db2.pool().query(
      `select *
       from dashboard_video_artifacts
       order by imported_at desc, created_at desc
       limit 100`,
    );
    return { data: result.rows.map(toArtifact) };
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

  async streamVideo(artifactId: string, options: { rangeHeader?: string } = {}) {
    const result = await db.db2.pool().query(
      `select id, storage_kind, storage_bucket, video_object_key
       from dashboard_video_artifacts where id = $1`,
      [artifactId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError("DashboardVideoArtifact");
    return streamDashboardVideoAsset(row, options);
  },
};
