import type { PoolClient } from "pg";
import { db } from "../../db/client.js";

export const staleRules = {
  async onImagePromptEdited(shotId: string, client: PoolClient) {
    await client.query(
      `update video_script_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [shotId],
    );
  },
  async onImageSelectionChanged(_shotId: string, _client: PoolClient) {
    // V2 selection is an explicit current choice and does not invalidate candidates.
  },
  async onVideoScriptReplaced(_shotId: string, _client: PoolClient) {
    // V2 keeps current selections until the user explicitly chooses a replacement.
  },
};

export async function getCurrentShotStatus(shotId: string) {
  const shot = await db.db2.getShot(shotId);
  return shot.status;
}
