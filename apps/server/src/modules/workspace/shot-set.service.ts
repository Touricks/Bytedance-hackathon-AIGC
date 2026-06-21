import path from "node:path";
import { stat } from "node:fs/promises";
import { nanoid } from "nanoid";
import {
  assertShotPromptMatchesStoryboard,
  shotPromptArtifactSchema,
  storyboardArtifactSchema,
  validateP0StoryboardScript,
} from "@aigc-video/shared";
import type { PoolClient } from "pg";
import { HttpError, NotFoundError } from "../../common/errors.js";
import { db } from "../../db/client.js";
import { compareSourceFingerprint } from "./upstream-drift.service.js";
import { workspaceModuleRunService } from "./workspace-module-run.service.js";

interface ShotPromptShot {
  index?: number;
  startSec?: number;
  endSec?: number;
  providerPrompt?: string;
  referenceAssetRefs?: string[];
  voiceover?: string;
  shotImage?: unknown;
  shotVideo?: unknown;
}

interface ShotPromptData {
  shots?: ShotPromptShot[];
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonbParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

function shotSetView(
  row: Record<string, unknown>,
  currentShotPromptArtifactId?: string | null,
) {
  const sourceFingerprint =
    row.source_fingerprint && typeof row.source_fingerprint === "object"
      ? row.source_fingerprint
      : {};
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotPromptArtifactId: String(row.shot_prompt_artifact_id),
    status: String(row.status),
    sourceFingerprint,
    upstream: compareSourceFingerprint(sourceFingerprint, {
      shotPromptArtifactId: currentShotPromptArtifactId,
    }),
    shotCount:
      typeof row.shot_count === "undefined" || row.shot_count === null
        ? undefined
        : Number(row.shot_count),
    createdAt: toIsoString(row.created_at),
    archivedAt: row.archived_at ? toIsoString(row.archived_at) : null,
  };
}

function shotView(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotSetId: String(row.shot_set_id),
    orderIndex: Number(row.order_index),
    title: String(row.title),
    objective: typeof row.objective === "string" ? row.objective : null,
    defaultDurationSec:
      row.default_duration_sec === null ? null : Number(row.default_duration_sec),
    status: String(row.status),
    activeImagePromptArtifactId:
      typeof row.active_image_prompt_artifact_id === "string"
        ? row.active_image_prompt_artifact_id
        : null,
    selectedImageId:
      typeof row.selected_image_id === "string" ? row.selected_image_id : null,
    activeVideoScriptArtifactId:
      typeof row.active_video_script_artifact_id === "string"
        ? row.active_video_script_artifact_id
        : null,
    selectedVideoId:
      typeof row.selected_video_id === "string" ? row.selected_video_id : null,
    requirements: {
      shotImage: row.shot_image ?? {},
      shotVideo: row.shot_video ?? {},
      sourceShotPromptArtifactId: String(row.shot_prompt_artifact_id),
    },
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return value === null || typeof value === "undefined" ? null : Number(value);
}

function shotSetHistoryShotView(row: Record<string, unknown>) {
  const imageCandidateId = nullableString(row.image_candidate_id);
  const videoCandidateId = nullableString(row.video_candidate_id);
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    shotSetId: String(row.shot_set_id),
    orderIndex: Number(row.order_index),
    title: String(row.title),
    objective: nullableString(row.objective),
    defaultDurationSec: nullableNumber(row.default_duration_sec),
    status: String(row.status),
    requirements: {
      shotImage: row.shot_image ?? {},
      shotVideo: row.shot_video ?? {},
      sourceShotPromptArtifactId: String(row.shot_prompt_artifact_id),
    },
    selectedImage: imageCandidateId
      ? {
          candidateId: imageCandidateId,
          batchId: nullableString(row.image_generation_batch_id),
          url: nullableString(row.image_url),
          width: nullableNumber(row.image_width),
          height: nullableNumber(row.image_height),
          status: nullableString(row.image_status),
        }
      : null,
    selectedVideo: videoCandidateId
      ? {
          candidateId: videoCandidateId,
          batchId: nullableString(row.video_generation_batch_id),
          url: nullableString(row.video_url),
          thumbnailUrl: nullableString(row.video_thumbnail_url),
          durationSec: nullableNumber(row.video_duration_sec),
          width: nullableNumber(row.video_width),
          height: nullableNumber(row.video_height),
          status: nullableString(row.video_status),
        }
      : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function getCurrentApprovedShotPrompt(
  workspaceId: string,
  artifactId?: string,
) {
  const params = artifactId ? [workspaceId, artifactId] : [workspaceId];
  const result = await db.db2.pool().query(
    artifactId
      ? `select *
         from shot_prompt_artifacts
         where workspace_id = $1 and id = $2 and status = 'approved'
         limit 1`
      : `select *
         from shot_prompt_artifacts
         where workspace_id = $1 and status = 'approved' and is_current = true
         order by approved_at desc, created_at desc, id desc
         limit 1`,
    params,
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(
      400,
      "NO_CURRENT_APPROVED_ARTIFACT",
      "Current approved shotprompt is required",
    );
  }
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    data: row.data as ShotPromptData,
    sourceFingerprint:
      row.source_fingerprint && typeof row.source_fingerprint === "object"
        ? row.source_fingerprint
        : {},
  };
}

async function getCurrentApprovedShotPromptId(workspaceId: string) {
  const result = await db.db2.pool().query(
    `select id
     from shot_prompt_artifacts
     where workspace_id = $1 and status = 'approved' and is_current = true
     order by approved_at desc, created_at desc, id desc
     limit 1`,
    [workspaceId],
  );
  return typeof result.rows[0]?.id === "string" ? result.rows[0].id : null;
}

async function getCurrentApprovedStoryboard(workspaceId: string) {
  const result = await db.db2.pool().query(
    `select data
     from storyboard_artifacts
     where workspace_id = $1
       and status = 'approved'
       and is_current = true
     order by approved_at desc, created_at desc, id desc
     limit 1`,
    [workspaceId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(
      400,
      "NO_CURRENT_APPROVED_ARTIFACT",
      "Current approved storyboard is required",
    );
  }
  return storyboardArtifactSchema.parse(row.data);
}

function assertShotPromptShots(data: ShotPromptData): ShotPromptShot[] {
  if (!Array.isArray(data.shots) || data.shots.length === 0) {
    throw new HttpError(400, "INVALID_SHOTPROMPT", "Shotprompt must contain shots");
  }
  return data.shots;
}

function assertP0StoryboardBoundary(storyboard: ReturnType<typeof storyboardArtifactSchema.parse>) {
  const result = validateP0StoryboardScript(storyboard);
  if (result.valid) return;
  throw new HttpError(
    400,
    "UPSTREAM_STORYBOARD_NOT_P0",
    `当前生效的分镜脚本不是三镜版本，请先批准三镜分镜脚本，再应用分镜。${result.issues
      .map((issue) => issue.message)
      .join(" ")}`,
  );
}

async function ensureMaterialAsset(input: {
  client: PoolClient;
  workspaceId: string;
  ref: string;
  localPath?: string | null;
}) {
  const existing = await input.client.query(
    `select id
     from asset
     where metadata->>'workspaceId' = $1
       and metadata->>'ref' = $2
     order by created_at desc, id desc
     limit 1`,
    [input.workspaceId, input.ref],
  );
  if (existing.rows[0]?.id) return String(existing.rows[0].id);

  const filename = path.basename(input.ref);
  if (filename !== input.ref || filename === "." || filename === "..") {
    throw new HttpError(
      400,
      "INVALID_MATERIAL_REF",
      "Shot reference asset ref must be a workspace material filename",
    );
  }
  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/png";
  const metadata: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    ref: input.ref,
  };
  if (input.localPath) {
    const storagePath = path.join(
      input.localPath,
      ".daireel",
      "materials",
      filename,
    );
    try {
      const fileStats = await stat(storagePath);
      Object.assign(metadata, {
        storagePath,
        contentType,
        mimeType: contentType,
        sizeBytes: fileStats.size,
      });
    } catch {
      // The material may be external or uploaded later; keep the stable URL fallback.
    }
  }

  const id = nanoid();
  await input.client.query(
    `insert into asset (id, type, url, source, metadata)
     values ($1, 'product_image', $2, 'upload', $3)`,
    [
      id,
      `/api/workspaces/${input.workspaceId}/materials/${encodeURIComponent(input.ref)}`,
      jsonbParam(metadata),
    ],
  );
  return id;
}

export const shotSetService = {
  async getActiveShotSet(workspaceId: string) {
    const [result, currentShotPromptArtifactId] = await Promise.all([
      db.db2.pool().query(
        `select ss.*,
                count(s.id)::integer as shot_count
         from shot_sets ss
         left join storyboard_shots s on s.shot_set_id = ss.id
         where ss.workspace_id = $1 and ss.status = 'active'
         group by ss.id
         order by created_at desc, id desc
         limit 1`,
        [workspaceId],
      ),
      getCurrentApprovedShotPromptId(workspaceId),
    ]);
    return result.rows[0]
      ? shotSetView(result.rows[0], currentShotPromptArtifactId)
      : null;
  },

  async listShotSets(workspaceId: string) {
    await db.getWorkspace(workspaceId);
    const [result, currentShotPromptArtifactId] = await Promise.all([
      db.db2.pool().query(
        `select ss.*,
                count(s.id)::integer as shot_count
         from shot_sets ss
         left join storyboard_shots s on s.shot_set_id = ss.id
         where ss.workspace_id = $1
           and ss.status = 'active'
         group by ss.id
         order by ss.created_at desc, ss.id desc`,
        [workspaceId],
      ),
      getCurrentApprovedShotPromptId(workspaceId),
    ]);
    return result.rows.map((row) =>
      shotSetView(row, currentShotPromptArtifactId),
    );
  },

  async listShotSetHistory(workspaceId: string) {
    await db.getWorkspace(workspaceId);
    const [setsResult, currentShotPromptArtifactId] = await Promise.all([
      db.db2.pool().query(
        `select ss.*,
                count(s.id)::integer as shot_count
         from shot_sets ss
         left join storyboard_shots s on s.shot_set_id = ss.id
         where ss.workspace_id = $1
         group by ss.id
         order by ss.created_at desc, ss.id desc`,
        [workspaceId],
      ),
      getCurrentApprovedShotPromptId(workspaceId),
    ]);
    const shotSetIds = setsResult.rows.map((row) => String(row.id));
    if (shotSetIds.length === 0) return [];

    const shotsResult = await db.db2.pool().query(
      `select s.*,
              r.shot_image,
              r.shot_video,
              r.shot_prompt_artifact_id,
              img.image_candidate_id,
              img.image_generation_batch_id,
              ic.image_url,
              ic.width as image_width,
              ic.height as image_height,
              ic.status as image_status,
              vid.video_candidate_id,
              vid.video_generation_batch_id,
              vc.video_url,
              vc.thumbnail_url as video_thumbnail_url,
              vc.duration_sec as video_duration_sec,
              vc.width as video_width,
              vc.height as video_height,
              vc.status as video_status
       from storyboard_shots s
       left join shot_prompt_requirements r on r.shot_id = s.id
       left join image_select_artifacts img on img.shot_id = s.id
       left join image_candidates ic on ic.id = img.image_candidate_id
       left join video_select_artifacts vid on vid.shot_id = s.id
       left join video_candidates vc on vc.id = vid.video_candidate_id
       where s.workspace_id = $1
         and s.shot_set_id = any($2::text[])
       order by s.shot_set_id, s.order_index asc, s.created_at asc`,
      [workspaceId, shotSetIds],
    );
    const shotsByShotSetId = new Map<
      string,
      ReturnType<typeof shotSetHistoryShotView>[]
    >();
    for (const row of shotsResult.rows) {
      const shotSetId = String(row.shot_set_id);
      const shots = shotsByShotSetId.get(shotSetId) ?? [];
      shots.push(shotSetHistoryShotView(row));
      shotsByShotSetId.set(shotSetId, shots);
    }

    return setsResult.rows.map((row) => {
      const shots = shotsByShotSetId.get(String(row.id)) ?? [];
      return {
        ...shotSetView(row, currentShotPromptArtifactId),
        selectedImageCount: shots.filter((shot) => shot.selectedImage).length,
        selectedVideoCount: shots.filter((shot) => shot.selectedVideo).length,
        shots,
      };
    });
  },

  async apply(input: { workspaceId: string; shotPromptArtifactId?: string }) {
    const workspace = await db.getWorkspace(input.workspaceId);
    const binding = await db.getActiveWorkspaceStorage(input.workspaceId);
    const localPath = binding?.kind === "LOCAL" ? binding.localPath : null;
    const shotPrompt = await getCurrentApprovedShotPrompt(
      input.workspaceId,
      input.shotPromptArtifactId,
    );
    const storyboard = await getCurrentApprovedStoryboard(input.workspaceId);
    assertP0StoryboardBoundary(storyboard);
    const parsedShotPrompt = shotPromptArtifactSchema.parse(shotPrompt.data);
    try {
      assertShotPromptMatchesStoryboard(parsedShotPrompt, storyboard, {
        requireShotLayers: true,
      });
    } catch (error) {
      throw new HttpError(
        400,
        "INVALID_SHOTPROMPT",
        error instanceof Error ? error.message : "Shotprompt does not match current storyboard",
      );
    }
    const shots = assertShotPromptShots(shotPrompt.data);
    const sourceFingerprint = {
      ...shotPrompt.sourceFingerprint,
      shotPromptArtifactId: shotPrompt.id,
    };
    return workspaceModuleRunService.withRun({
      workspaceId: input.workspaceId,
      moduleId: "shot-set",
      operation: "apply",
      runtimeBuilder: "shot_set_apply",
      provider: null,
      sourceFingerprint,
      artifactId: (shotSet) => shotSet.id,
      run: async () => {
        const shotSetId = nanoid();
        const client = await db.db2.pool().connect();

        try {
          await client.query("begin");
          await client.query(
            `update shot_sets
             set status = 'archived',
                 archived_at = now()
             where workspace_id = $1 and status = 'active'`,
            [input.workspaceId],
          );
          const shotSetResult = await client.query(
            `insert into shot_sets
               (id, workspace_id, shot_prompt_artifact_id, status, source_fingerprint)
             values ($1, $2, $3, 'active', $4)
             returning *`,
            [
              shotSetId,
              input.workspaceId,
              shotPrompt.id,
              jsonbParam(sourceFingerprint),
            ],
          );

          for (const [position, shot] of shots.entries()) {
            const orderIndex = position;
            const startSec =
              typeof shot.startSec === "number" && Number.isFinite(shot.startSec)
                ? shot.startSec
                : 0;
            const endSec =
              typeof shot.endSec === "number" && Number.isFinite(shot.endSec)
                ? shot.endSec
                : startSec + 4;
            const prompt = shot.providerPrompt || `Shot ${orderIndex + 1}`;
            const shotId = nanoid();
            await client.query(
              `insert into storyboard_shots
                 (id, workspace_id, shot_set_id, script_id, order_index, title, objective,
                  default_duration_sec, status)
               values ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT')`,
              [
                shotId,
                input.workspaceId,
                shotSetId,
                workspace.currentScriptId,
                orderIndex,
                prompt.slice(0, 80) || `Shot ${orderIndex + 1}`,
                prompt,
                Math.max(1, endSec - startSec),
              ],
            );
            await client.query(
              `insert into shot_prompt_requirements
                 (id, workspace_id, shot_set_id, shot_id, shot_prompt_artifact_id,
                  shot_image, shot_video)
               values ($1, $2, $3, $4, $5, $6, $7)`,
              [
                nanoid(),
                input.workspaceId,
                shotSetId,
                shotId,
                shotPrompt.id,
                jsonbParam(shot.shotImage ?? {}),
                jsonbParam(shot.shotVideo ?? {}),
              ],
            );

            const refs = [...new Set(shot.referenceAssetRefs ?? [])];
            for (const [refIndex, ref] of refs.entries()) {
              const assetId = await ensureMaterialAsset({
                client,
                workspaceId: input.workspaceId,
                ref,
                localPath,
              });
              await client.query(
                `insert into shot_asset_refs
                   (id, shot_id, asset_id, role, weight, position)
                 values ($1, $2, $3, $4, $5, $6)
                 on conflict (shot_id, asset_id, role) do update
                 set weight = excluded.weight,
                     position = excluded.position`,
                [
                  nanoid(),
                  shotId,
                  assetId,
                  refIndex === 0 ? "product_identity" : "reference_scene",
                  refIndex === 0 ? 1 : 0.8,
                  refIndex,
                ],
              );
            }
          }

          await client.query("commit");
          return shotSetView(shotSetResult.rows[0]);
        } catch (error) {
          await client.query("rollback");
          throw error;
        } finally {
          client.release();
        }
      },
    });
  },

  async listShotSetShots(input: { workspaceId: string; shotSetId: string }) {
    await db.getWorkspace(input.workspaceId);
    const setResult = await db.db2.pool().query(
      `select id
       from shot_sets
       where workspace_id = $1 and id = $2
       limit 1`,
      [input.workspaceId, input.shotSetId],
    );
    if (!setResult.rows[0]) {
      throw new NotFoundError("ShotSet");
    }

    const result = await db.db2.pool().query(
      `select s.*, r.shot_image, r.shot_video, r.shot_prompt_artifact_id
       from storyboard_shots s
       left join shot_prompt_requirements r on r.shot_id = s.id
       where s.workspace_id = $1 and s.shot_set_id = $2
       order by s.order_index asc, s.created_at asc`,
      [input.workspaceId, input.shotSetId],
    );
    return result.rows.map(shotView);
  },

  async listActiveShots(workspaceId: string) {
    const active = await this.getActiveShotSet(workspaceId);
    if (!active) {
      throw new HttpError(
        400,
        "NO_ACTIVE_SHOT_SET",
        "Active shot set is required",
      );
    }
    return this.listShotSetShots({ workspaceId, shotSetId: active.id });
  },
};
