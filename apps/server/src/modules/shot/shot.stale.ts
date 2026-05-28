import type { PoolClient } from "pg";
import { db } from "../../db/client.js";

export const staleRules = {
  async onImagePromptEdited(shotId: string, client: PoolClient) {
    await client.query(
      `update video_script_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [shotId],
    );
  },
  async onImageSelectionChanged(shotId: string, client: PoolClient) {
    await client.query(
      `update video_script_artifacts set status='STALE' where shot_id=$1 and status='ACTIVE'`,
      [shotId],
    );
    await client.query(`delete from selected_shot_videos where shot_id=$1`, [shotId]);
  },
  async onVideoScriptReplaced(shotId: string, client: PoolClient) {
    // The new version is already inserted as ACTIVE; the previous active row is moved to STALE
    // by the versioning helper. selected_shot_videos pointing to candidates from that old script
    // are dropped.
    await client.query(`delete from selected_shot_videos where shot_id=$1`, [shotId]);
  },
};

export async function getCurrentShotStatus(shotId: string) {
  const shot = await db.db2.getShot(shotId);
  return shot.status;
}
