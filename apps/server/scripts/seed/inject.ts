import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../../src/db/client.js";
import {
  dashboardLocalLocator,
  persistDashboardVideoAssetBytes,
} from "../../src/modules/dashboard/dashboard-asset-storage.js";
import { buildCumulativeSeries } from "./cumulative-series.js";
import type {
  DashboardSeedFixture,
  PublicationFixture,
  VideoFixture,
} from "./fixture.js";

/**
 * Writes the full dashboard chain for a fixture directly to the DB, bypassing
 * the generation pipeline:
 *   creative_workspace (mock) -> final_video_jobs (mock) ->
 *   dashboard_video_artifacts (soft-linked) ->
 *   external_kol_publications -> N backdated external_kol_metrics snapshots.
 *
 * All ids are deterministic `mock_*` so re-runs can refresh the mock rows and
 * placeholder video files. Use resetMockSeed() before re-seeding changed
 * totals/days to remove old publication and metric rows cleanly.
 */

const MOCK_PREFIX = "mock";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export const DASHBOARD_SEED_PLACEHOLDER_VIDEO = {
  path: path.resolve(scriptDir, "../../../static/placehold.mp4"),
  durationSec: 15,
  width: 720,
  height: 1280,
} as const;

const videoJobId = (videoKey: string) => `${MOCK_PREFIX}_fv_${videoKey}`;
const dashboardArtifactId = (videoKey: string) =>
  `${MOCK_PREFIX}_dash_${videoKey}`;
const publicationRowId = (videoKey: string, pubKey: string) =>
  `${MOCK_PREFIX}_pub_${videoKey}_${pubKey}`;
const metricRowId = (videoKey: string, pubKey: string, day: number) =>
  `${MOCK_PREFIX}_met_${videoKey}_${pubKey}_d${day}`;

export interface InjectSummary {
  workspaceId: string;
  videos: number;
  publications: number;
  metricSnapshots: number;
  dashboardArtifactIds: string[];
}

interface SeedVideoParameters {
  durationSec: number;
  width: number;
  height: number;
}

let placeholderVideoBody: Uint8Array | undefined;

async function readPlaceholderVideo(): Promise<Uint8Array> {
  placeholderVideoBody ??= await readFile(DASHBOARD_SEED_PLACEHOLDER_VIDEO.path);
  return placeholderVideoBody;
}

function seedVideoParameters(video: VideoFixture): SeedVideoParameters {
  return {
    durationSec: video.durationSec ?? DASHBOARD_SEED_PLACEHOLDER_VIDEO.durationSec,
    width: video.width ?? DASHBOARD_SEED_PLACEHOLDER_VIDEO.width,
    height: video.height ?? DASHBOARD_SEED_PLACEHOLDER_VIDEO.height,
  };
}

function dashboardVideoUrl(artifactId: string) {
  return `/api/dashboard/videos/${artifactId}/file`;
}

async function ensureWorkspace(workspaceId: string) {
  await db.db2.pool().query(
    `insert into creative_workspace
       (id, current_script_id, status, trace_file, local_path)
     values ($1, $2, $3, $4, null)
     on conflict (id) do nothing`,
    [workspaceId, `${MOCK_PREFIX}-script`, "READY", `${MOCK_PREFIX}-trace.jsonl`],
  );
}

async function ensureFinalVideoJob(
  workspaceId: string,
  video: VideoFixture,
  completedAtISO: string,
): Promise<string> {
  const id = videoJobId(video.key);
  const parameters = seedVideoParameters(video);
  const compiledManifest = {
    schemaVersion: "final-video-manifest",
    creativeAttribution: {
      schemaVersion: "creative-attribution",
      creativeFactors: video.creativeFactors,
    },
  };
  await db.db2.pool().query(
    `insert into final_video_jobs
       (id, workspace_id, shot_set_id, status, source_shot_video_ids,
        source_video_script_artifact_ids, local_path, local_url, duration_sec,
        width, height, compiled_manifest, compiled_manifest_hash, ffmpeg_log,
        error_message, idempotency_key, completed_at)
     values ($1,$2,null,'SUCCEEDED',$3,$4,$5,$6,$7,$8,$9,$10,$11,null,null,$12,$13)
     on conflict (id) do update set
       workspace_id = excluded.workspace_id,
       status = excluded.status,
       source_shot_video_ids = excluded.source_shot_video_ids,
       source_video_script_artifact_ids = excluded.source_video_script_artifact_ids,
       local_path = excluded.local_path,
       local_url = excluded.local_url,
       duration_sec = excluded.duration_sec,
       width = excluded.width,
       height = excluded.height,
       compiled_manifest = excluded.compiled_manifest,
       compiled_manifest_hash = excluded.compiled_manifest_hash,
       ffmpeg_log = excluded.ffmpeg_log,
       error_message = excluded.error_message,
       idempotency_key = excluded.idempotency_key,
       completed_at = excluded.completed_at,
       updated_at = now()`,
    [
      id,
      workspaceId,
      [],
      [],
      `final/${id}/final.mp4`,
      `/api/workspaces/${workspaceId}/final-videos/${id}/file`,
      parameters.durationSec,
      parameters.width,
      parameters.height,
      JSON.stringify(compiledManifest),
      `sha256:${id}`,
      `${id}:mock`,
      completedAtISO,
    ],
  );
  return id;
}

async function ensureDashboardArtifact(
  workspaceId: string,
  video: VideoFixture,
  jobId: string,
  importedAtISO: string,
): Promise<string> {
  const id = dashboardArtifactId(video.key);
  const localUrl = dashboardVideoUrl(id);
  const parameters = seedVideoParameters(video);
  await db.db2.pool().query(
    `insert into dashboard_video_artifacts
       (id, workspace_id, final_video_job_id, name, local_url, duration_sec,
        width, height, creative_factors, imported_at, storage_kind,
        storage_bucket, video_object_key, metadata_object_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'LOCAL',null,null,null)
     on conflict (id) do update set
       workspace_id = excluded.workspace_id,
       final_video_job_id = excluded.final_video_job_id,
       name = excluded.name,
       local_url = excluded.local_url,
       duration_sec = excluded.duration_sec,
       width = excluded.width,
       height = excluded.height,
       creative_factors = excluded.creative_factors,
       imported_at = excluded.imported_at,
       storage_kind = 'LOCAL',
       storage_bucket = null,
       video_object_key = null,
       metadata_object_key = null,
       updated_at = now()`,
    [
      id,
      workspaceId,
      jobId,
      video.name,
      localUrl,
      parameters.durationSec,
      parameters.width,
      parameters.height,
      JSON.stringify(video.creativeFactors),
      importedAtISO,
    ],
  );
  await persistDashboardVideoAssetBytes({
    artifactId: id,
    locator: dashboardLocalLocator(id),
    videoBody: await readPlaceholderVideo(),
    metadata: (locator) => ({
      schemaVersion: "dashboard-video-metadata",
      id,
      workspaceId,
      finalVideoJobId: jobId,
      name: video.name,
      localUrl,
      importedAt: importedAtISO,
      ...parameters,
      creativeFactors: video.creativeFactors,
      storage: {
        kind: locator.storageKind,
        bucket: locator.storageBucket,
        videoObjectKey: locator.videoObjectKey,
        metadataObjectKey: locator.metadataObjectKey,
        localAssetDir: locator.localAssetDir,
      },
      source: {
        placeholderVideoPath: DASHBOARD_SEED_PLACEHOLDER_VIDEO.path,
      },
    }),
  });
  return id;
}

async function ensurePublicationWithMetrics(
  workspaceId: string,
  jobId: string,
  videoKey: string,
  pub: PublicationFixture,
): Promise<number> {
  const pubId = publicationRowId(videoKey, pub.key);
  await db.db2.pool().query(
    `insert into external_kol_publications
       (id, workspace_id, job_id, platform, account_name, publish_url,
        published_at)
     values ($1,$2,$3,$4,$5,$6,$7::timestamptz)
     on conflict (id) do nothing`,
    [
      pubId,
      workspaceId,
      jobId,
      pub.platform,
      pub.accountName,
      pub.publishUrl ?? null,
      pub.publishedAt,
    ],
  );

  const series = buildCumulativeSeries(pub.finalTotals, pub.days, pub.publishedAt);
  for (let day = 0; day < series.length; day++) {
    const snapshot = series[day];
    if (!snapshot) {
      throw new Error(`Missing metric snapshot for ${videoKey}/${pub.key} day ${day}`);
    }
    await db.db2.pool().query(
      `insert into external_kol_metrics
         (id, publication_id, impressions, clicks, conversions, spend_cents,
          gmv_cents, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$8::timestamptz)
       on conflict (id) do nothing`,
      [
        metricRowId(videoKey, pub.key, day),
        pubId,
        snapshot.impressions,
        snapshot.clicks,
        snapshot.conversions,
        snapshot.spendCents,
        snapshot.gmvCents,
        snapshot.createdAtISO,
      ],
    );
  }
  return series.length;
}

function earliestPublishedAt(video: VideoFixture): string {
  const earliest = [...video.publications]
    .map((pub) => pub.publishedAt)
    .sort()[0];
  if (!earliest) {
    throw new Error(`Video fixture "${video.key}" must include a publication`);
  }
  return earliest;
}

export async function injectDashboardSeed(
  fixture: DashboardSeedFixture,
  opts: { workspaceId?: string } = {},
): Promise<InjectSummary> {
  const workspaceId = opts.workspaceId ?? fixture.workspace.id;
  await ensureWorkspace(workspaceId);

  let publications = 0;
  let metricSnapshots = 0;
  const dashboardArtifactIds: string[] = [];

  for (const video of fixture.videos) {
    const anchorISO = earliestPublishedAt(video);
    const jobId = await ensureFinalVideoJob(workspaceId, video, anchorISO);
    const dashId = await ensureDashboardArtifact(
      workspaceId,
      video,
      jobId,
      anchorISO,
    );
    dashboardArtifactIds.push(dashId);
    for (const pub of video.publications) {
      metricSnapshots += await ensurePublicationWithMetrics(
        workspaceId,
        jobId,
        video.key,
        pub,
      );
      publications += 1;
    }
  }

  return {
    workspaceId,
    videos: fixture.videos.length,
    publications,
    metricSnapshots,
    dashboardArtifactIds,
  };
}

/** Deletes only this seeder's rows (id prefix `mock_`) in FK-safe order. */
export async function resetMockSeed(): Promise<void> {
  const pool = db.db2.pool();
  await pool.query(
    `delete from external_kol_metrics
     where publication_id in (
       select id from external_kol_publications where id like 'mock_pub_%'
     )`,
  );
  await pool.query(`delete from external_kol_publications where id like 'mock_pub_%'`);
  await pool.query(`delete from dashboard_video_artifacts where id like 'mock_dash_%'`);
  await pool.query(`delete from final_video_jobs where id like 'mock_fv_%'`);
}
