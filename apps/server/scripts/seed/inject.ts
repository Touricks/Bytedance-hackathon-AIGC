import { db } from "../../src/db/client.js";
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
 * All ids are deterministic `mock_*` so re-runs are idempotent (inserts use
 * `on conflict do nothing`). Use resetMockSeed() before re-seeding changed
 * totals/days, since conflicting rows are otherwise left untouched.
 */

const MOCK_PREFIX = "mock";

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
  const existing = await db.db2
    .pool()
    .query(`select 1 from final_video_jobs where id = $1`, [id]);
  if (existing.rows.length > 0) return id;
  await db.db2.insertFinalVideoJob({
    id,
    workspaceId,
    shotSetId: null,
    status: "SUCCEEDED",
    sourceShotVideoIds: [],
    sourceVideoScriptArtifactIds: [],
    localPath: `final/${id}/final.mp4`,
    localUrl: `/api/workspaces/${workspaceId}/final-videos/${id}/file`,
    durationSec: video.durationSec ?? 15,
    width: video.width ?? 1080,
    height: video.height ?? 1920,
    compiledManifest: {
      schemaVersion: "final-video-manifest",
      creativeAttribution: {
        schemaVersion: "creative-attribution",
        creativeFactors: video.creativeFactors,
      },
    },
    compiledManifestHash: `sha256:${id}`,
    ffmpegLog: null,
    errorMessage: null,
    idempotencyKey: `${id}:mock`,
    completedAt: completedAtISO,
  });
  return id;
}

async function ensureDashboardArtifact(
  workspaceId: string,
  video: VideoFixture,
  jobId: string,
  importedAtISO: string,
): Promise<string> {
  const id = dashboardArtifactId(video.key);
  await db.db2.pool().query(
    `insert into dashboard_video_artifacts
       (id, workspace_id, final_video_job_id, name, local_url, duration_sec,
        width, height, creative_factors, imported_at, storage_kind,
        storage_bucket, video_object_key, metadata_object_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'LOCAL',null,null,null)
     on conflict (id) do nothing`,
    [
      id,
      workspaceId,
      jobId,
      video.name,
      `/api/dashboard/videos/${id}/file`,
      video.durationSec ?? 15,
      video.width ?? 1080,
      video.height ?? 1920,
      JSON.stringify(video.creativeFactors),
      importedAtISO,
    ],
  );
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
  return [...video.publications]
    .map((pub) => pub.publishedAt)
    .sort()[0];
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
