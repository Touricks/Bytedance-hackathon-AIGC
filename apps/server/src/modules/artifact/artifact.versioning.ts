import { db } from "../../db/client.js";

export async function createImagePromptVersionAtomic(input: {
  shotId: string;
  promptText: string;
  negativePrompt?: string;
  referenceAssetIds: string[];
  promptJson?: unknown;
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
        (id, shot_id, version, status, prompt_text, negative_prompt, reference_asset_ids, prompt_json, created_by, agent_name, prompt_template_version, base_artifact_id)
       values ($1,$2,$3,'ACTIVE',$4,$5,$6,$7,$8,$9,$10,$11)
       returning *`,
      [
        `art_img_${cryptoRandom()}`,
        input.shotId,
        version,
        input.promptText,
        input.negativePrompt ?? null,
        input.referenceAssetIds,
        JSON.stringify(input.promptJson ?? {}),
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

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 12);
}
