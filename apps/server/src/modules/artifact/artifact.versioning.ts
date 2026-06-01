import { db } from "../../db/client.js";

export async function createImagePromptVersionAtomic(input: {
  shotId: string;
  promptText: string;
  negativePrompt?: string;
  referenceAssetIds: string[];
  promptJson?: unknown;
  sourceFingerprint?: unknown;
  promptAssembly?: unknown;
  createdBy: "agent" | "user" | "system";
  agentName?: string;
  promptTemplateVersion?: string;
  baseArtifactId?: string;
}) {
  const pool = db.db2.pool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update image_prompt_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [input.shotId],
    );
    const versionRow = await client.query(
      `select coalesce(max(version), 0) as max_version from image_prompt_artifacts where shot_id=$1`,
      [input.shotId],
    );
    const version = Number(versionRow.rows[0].max_version) + 1;
    const insert = await client.query(
      `insert into image_prompt_artifacts
        (id, shot_id, version, status, prompt_text, negative_prompt, reference_asset_ids,
         prompt_json, source_fingerprint, prompt_assembly, created_by, agent_name,
         prompt_template_version, base_artifact_id)
       values ($1,$2,$3,'ACTIVE',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [
        `art_img_${cryptoRandom()}`,
        input.shotId,
        version,
        input.promptText,
        input.negativePrompt ?? null,
        input.referenceAssetIds,
        JSON.stringify(input.promptJson ?? {}),
        JSON.stringify(input.sourceFingerprint ?? {}),
        JSON.stringify(input.promptAssembly ?? {}),
        input.createdBy,
        input.agentName ?? null,
        input.promptTemplateVersion ?? null,
        input.baseArtifactId ?? null,
      ],
    );
    await client.query(
      `update storyboard_shots set active_image_prompt_artifact_id=$1, updated_at=now() where id=$2`,
      [insert.rows[0].id, input.shotId],
    );
    await client.query("commit");
    return insert.rows[0];
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function createVideoScriptVersionAtomic(input: {
  shotId: string;
  durationSec: number;
  scriptJson: unknown;
  providerPrompt: string;
  basedOnImageCandidateId: string;
  basedOnPrevImageCandidateId?: string;
  basedOnNextImageCandidateId?: string;
  sourceFingerprint?: unknown;
  promptAssembly?: unknown;
  createdBy: "agent" | "user" | "system";
  agentName?: string;
  promptTemplateVersion?: string;
  baseArtifactId?: string;
}) {
  const pool = db.db2.pool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update video_script_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [input.shotId],
    );
    const versionRow = await client.query(
      `select coalesce(max(version), 0) as max_version from video_script_artifacts where shot_id=$1`,
      [input.shotId],
    );
    const version = Number(versionRow.rows[0].max_version) + 1;
    const insert = await client.query(
      `insert into video_script_artifacts
        (id, shot_id, version, status, duration_sec, script_json, provider_prompt,
         based_on_image_candidate_id, based_on_prev_image_candidate_id, based_on_next_image_candidate_id,
         source_fingerprint, prompt_assembly, created_by, agent_name,
         prompt_template_version, base_artifact_id)
       values ($1,$2,$3,'ACTIVE',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       returning *`,
      [
        `art_vid_${cryptoRandom()}`,
        input.shotId,
        version,
        input.durationSec,
        JSON.stringify(input.scriptJson),
        input.providerPrompt,
        input.basedOnImageCandidateId,
        input.basedOnPrevImageCandidateId ?? null,
        input.basedOnNextImageCandidateId ?? null,
        JSON.stringify(input.sourceFingerprint ?? {}),
        JSON.stringify(input.promptAssembly ?? {}),
        input.createdBy,
        input.agentName ?? null,
        input.promptTemplateVersion ?? null,
        input.baseArtifactId ?? null,
      ],
    );
    await client.query(
      `update storyboard_shots set active_video_script_artifact_id=$1, updated_at=now() where id=$2`,
      [insert.rows[0].id, input.shotId],
    );
    await client.query("commit");
    return insert.rows[0];
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 12);
}
