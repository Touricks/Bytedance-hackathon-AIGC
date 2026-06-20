import type { CreativeWorkspace } from "@aigc-video/shared";
import { db, type WorkspaceStorageBindingRow } from "../../db/client.js";

type CreateWorkspaceInput = Omit<
  CreativeWorkspace,
  "createdAt" | "updatedAt" | "lastSeenAt" | "localPath" | "displayName"
> & { displayName?: string | null; localPath?: string | null };

export const workspaceRepository = {
  createWorkspace(input: CreateWorkspaceInput) {
    return db.createWorkspace(input);
  },

  listWorkspaces() {
    return db.listWorkspaces();
  },

  getWorkspace(workspaceId: string) {
    return db.getWorkspace(workspaceId);
  },

  updateWorkspaceDisplayName(
    workspaceId: string,
    displayName: string | null,
  ) {
    return db.updateWorkspace(workspaceId, { displayName });
  },

  getActiveStorage(
    workspaceId: string,
  ): Promise<WorkspaceStorageBindingRow | null> {
    return db.getActiveWorkspaceStorage(workspaceId);
  },

  bindS3Storage(input: {
    workspaceId: string;
    bucket: string;
    prefix: string;
    region?: string | null;
    endpoint?: string | null;
  }) {
    return db.bindWorkspaceS3Storage(input);
  },

  async hasActiveGenerationWork(workspaceId: string) {
    const result = await db.db2.pool().query<{ busy: boolean }>(
      `select exists (
         select 1 from generation_jobs
         where workspace_id = $1 and status in ('PENDING', 'RUNNING', 'RETRYING')
         union all
         select 1 from final_video_jobs
         where workspace_id = $1 and status in ('PENDING', 'RUNNING')
         union all
         select 1 from one_click_final_video_jobs
         where workspace_id = $1 and status in ('PENDING', 'RUNNING', 'WAITING')
         union all
         select 1 from workspace_module_runs
         where workspace_id = $1 and status in ('PENDING', 'RUNNING')
       ) as busy`,
      [workspaceId],
    );
    return Boolean(result.rows[0]?.busy);
  },

  async deleteWorkspaceCascade(workspaceId: string) {
    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      await client.query(
        `delete from external_kol_metrics
         where publication_id in (
           select id from external_kol_publications where workspace_id = $1
         )`,
        [workspaceId],
      );
      await client.query(
        `delete from external_kol_publications where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(
        `delete from shot_image_auto_selection_jobs where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(
        `delete from one_click_final_video_jobs where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(`delete from workspace_module_runs where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(`delete from generation_jobs where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(`delete from trace_events where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(`delete from final_video_jobs where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(
        `delete from video_select_artifacts where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(
        `delete from video_candidates where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(
        `delete from video_generation_batches where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(
        `delete from video_script_artifacts
         where shot_id in (
           select id from storyboard_shots where workspace_id = $1
         )`,
        [workspaceId],
      );
      await client.query(
        `delete from image_select_artifacts where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(
        `delete from image_candidates where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(
        `delete from image_generation_batches where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(
        `delete from image_prompt_artifacts
         where shot_id in (
           select id from storyboard_shots where workspace_id = $1
         )`,
        [workspaceId],
      );
      await client.query(
        `delete from shot_asset_refs
         where shot_id in (
           select id from storyboard_shots where workspace_id = $1
         )`,
        [workspaceId],
      );
      await client.query(
        `delete from shot_prompt_requirements where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(`delete from storyboard_shots where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(`delete from shot_sets where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(`delete from shot_prompt_artifacts where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(`delete from storyboard_artifacts where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(`delete from product_brief_artifacts where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(`delete from material_intake_artifacts where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(
        `delete from prompt_requirements_artifacts where workspace_id = $1`,
        [workspaceId],
      );
      await client.query(`delete from workspace_artifact where workspace_id = $1`, [
        workspaceId,
      ]);
      await client.query(
        `delete from shot_asset_refs
         where asset_id in (
           select id from asset where metadata->>'workspaceId' = $1
         )`,
        [workspaceId],
      );
      await client.query(
        `delete from asset where source = 'upload' and metadata->>'workspaceId' = $1`,
        [workspaceId],
      );
      await client.query(`delete from creative_workspace where id = $1`, [
        workspaceId,
      ]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },
};
