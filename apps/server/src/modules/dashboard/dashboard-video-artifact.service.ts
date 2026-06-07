import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { creativeFactorsSchema } from "@aigc-video/shared";
import { config } from "../../common/config.js";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import type { FinalVideoJobRow } from "../../db/client.js";
import { getWorkspaceStorageAdapter } from "../workspace/storage/workspace-storage-resolver.js";
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

function isInsideDirectory(filePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, filePath);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isNodeNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function dashboardArtifactDir(artifactId: string) {
  const rootPath = path.resolve(config.dashboardAssetDir);
  const dir = path.resolve(rootPath, artifactId);
  if (!isInsideDirectory(dir, rootPath)) {
    throw new HttpError(
      400,
      "INVALID_DASHBOARD_ARTIFACT_ID",
      "Dashboard artifact id must stay inside the dashboard asset root",
    );
  }
  return dir;
}

function dashboardArtifactVideoPath(artifactId: string) {
  return path.join(dashboardArtifactDir(artifactId), "video.mp4");
}

function dashboardArtifactMetadataPath(artifactId: string) {
  return path.join(dashboardArtifactDir(artifactId), "metadata.json");
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
  creativeTags: Record<string, unknown>;
  creativeFactors: unknown;
}) {
  return {
    schemaVersion: "dashboard-video-artifact.v1",
    id: input.artifactId,
    workspaceId: input.workspaceId,
    finalVideoJobId: input.job.id,
    name: input.name,
    localUrl: input.localUrl,
    importedAt: input.importedAt,
    durationSec: input.job.durationSec,
    width: input.job.width,
    height: input.job.height,
    creativeTags: input.creativeTags,
    creativeFactors: input.creativeFactors,
    source: {
      finalVideoLocalPath: input.job.localPath,
      finalVideoLocalUrl: input.job.localUrl,
      finalVideoCompletedAt: input.job.completedAt,
      compiledManifestHash: input.job.compiledManifestHash,
      sourceShotVideoIds: input.job.sourceShotVideoIds,
      sourceVideoScriptArtifactIds: input.job.sourceVideoScriptArtifactIds,
    },
  };
}

async function persistDashboardAsset(input: {
  artifactId: string;
  workspaceId: string;
  job: FinalVideoJobRow;
  name: string;
  localUrl: string;
  importedAt: string;
  creativeTags: Record<string, unknown>;
  creativeFactors: unknown;
}) {
  if (!input.job.localPath) {
    throw new HttpError(
      409,
      "FINAL_VIDEO_NOT_READY",
      "Only completed final videos can be imported into the dashboard",
    );
  }
  const storage = await getWorkspaceStorageAdapter(input.workspaceId);
  const assetDir = dashboardArtifactDir(input.artifactId);
  await mkdir(assetDir, { recursive: true });
  await writeFile(
    dashboardArtifactVideoPath(input.artifactId),
    await storage.readObject(input.job.localPath),
  );
  await writeFile(
    dashboardArtifactMetadataPath(input.artifactId),
    `${JSON.stringify(dashboardMetadata(input), null, 2)}\n`,
  );
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
    const localUrl = dashboardVideoUrl(id);
    const importedAt = new Date().toISOString();
    await persistDashboardAsset({
      artifactId: id,
      workspaceId,
      job,
      name: input.name,
      localUrl,
      importedAt,
      creativeTags,
      creativeFactors,
    });
    const result = await db.db2.pool().query(
      `insert into dashboard_video_artifacts
        (id, workspace_id, final_video_job_id, name, local_url, duration_sec,
         width, height, creative_tags, creative_factors, metadata, imported_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        JSON.stringify(creativeTags),
        creativeFactors ? JSON.stringify(creativeFactors) : null,
        JSON.stringify({
          compiledManifestHash: job.compiledManifestHash,
          finalVideoCompletedAt: job.completedAt,
          sourceShotVideoIds: job.sourceShotVideoIds,
          sourceVideoScriptArtifactIds: job.sourceVideoScriptArtifactIds,
          dashboardAssetDir: config.dashboardAssetDir,
        }),
        importedAt,
      ],
    );
    return { data: toArtifact(result.rows[0]) };
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

  async streamVideo(artifactId: string) {
    const result = await db.db2.pool().query(
      `select id from dashboard_video_artifacts where id = $1`,
      [artifactId],
    );
    if (!result.rows[0]) throw new NotFoundError("DashboardVideoArtifact");
    const videoPath = dashboardArtifactVideoPath(artifactId);
    try {
      await stat(videoPath);
    } catch (error) {
      if (isNodeNotFoundError(error)) throw new NotFoundError("DashboardVideoFile");
      throw error;
    }
    return createReadStream(videoPath);
  },
};
