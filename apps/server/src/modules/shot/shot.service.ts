import { nanoid } from "nanoid";
import { runStoryboardImagePromptAgent } from "@aigc-video/ai";
import { db } from "../../db/client.js";
import { config } from "../../common/config.js";
import { HttpError } from "../../common/errors.js";
import { createImagePromptVersionAtomic } from "../artifact/artifact.versioning.js";
import { traceService } from "../trace/trace.service.js";
import { getNextAction, type ShotStatus } from "./shot.state.js";
import { staleRules } from "./shot.stale.js";

function resolveBatchCount(kind: "image" | "video", requested?: number): number {
  const def = kind === "image" ? config.defaultImageBatchSize : config.defaultVideoBatchSize;
  const max = kind === "image" ? config.maxImageBatchSize : config.maxVideoBatchSize;
  const n = requested ?? def;
  if (n < 1 || n > max) {
    throw new HttpError(400, "COUNT_EXCEEDS_LIMIT", `count must be between 1 and ${max}`);
  }
  return n;
}

export const shotWorkflowService = {
  resolveBatchCount,

  async listShots(workspaceId: string) {
    const shots = await db.db2.listShotsByWorkspace(workspaceId);
    return {
      data: shots.map((s) => ({
        ...s,
        nextAction: getNextAction(s.status as ShotStatus),
      })),
    };
  },

  async getShot(shotId: string) {
    const shot = await db.db2.getShot(shotId);
    return {
      data: { ...shot, nextAction: getNextAction(shot.status as ShotStatus) },
    };
  },

  async workflowStatus(workspaceId: string) {
    const shots = await db.db2.listShotsByWorkspace(workspaceId);
    const enriched = shots.map((s) => ({
      shotId: s.id,
      orderIndex: s.orderIndex,
      status: s.status,
      nextAction: getNextAction(s.status as ShotStatus),
      activeImagePromptArtifactId: s.activeImagePromptArtifactId,
      selectedImageId: s.selectedImageId,
      activeVideoScriptArtifactId: s.activeVideoScriptArtifactId,
      selectedVideoId: s.selectedVideoId,
    }));
    const canComposeFinalVideo =
      enriched.length > 0 && enriched.every((e) => e.status === "VIDEO_SELECTED");
    return { data: { workspaceId, shots: enriched, canComposeFinalVideo } };
  },

  async proposeImagePrompt(args: {
    workspaceId: string;
    shotId: string;
    referenceAssetIds: string[];
    userHint?: string;
    stylePresetId?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    const traceId = nanoid();

    await db.db2.updateShot(args.shotId, { status: "IMAGE_PROMPT_PROPOSING" });
    try {
      const result = await runStoryboardImagePromptAgent({
        payload: {
          productBrief: {},
          shot: {
            index: shot.orderIndex,
            objective: shot.objective ?? shot.title,
          },
          referenceAssets: args.referenceAssetIds.map((id) => ({
            id,
            role: "product_identity",
            summary: "",
          })),
          userHint: args.userHint,
          stylePresetId: args.stylePresetId,
        },
        context: {
          workspaceId: args.workspaceId,
          shotId: args.shotId,
          traceId,
          runtimeMode: process.env.MODEL_MODE === "real" ? "real" : "mock",
        },
      });

      const artifact = await createImagePromptVersionAtomic({
        shotId: args.shotId,
        promptText: result.output.promptText,
        negativePrompt: result.output.negativePrompt,
        referenceAssetIds: args.referenceAssetIds,
        promptJson: result.output,
        createdBy: "agent",
        agentName: "StoryboardImagePromptAgent",
        promptTemplateVersion: result.templateVersion,
      });

      await db.db2.updateShot(args.shotId, {
        status: "IMAGE_PROMPT_READY",
        activeImagePromptArtifactId: artifact.id,
      });
      await traceService.record({
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        traceType: "agent_run",
        name: "image_prompt_proposed",
        outputPreview: result.output.promptText.slice(0, 200),
        metadata: { templateVersion: result.templateVersion },
      });
      return {
        data: artifact,
        shotStatus: "IMAGE_PROMPT_READY",
        nextAction: getNextAction("IMAGE_PROMPT_READY"),
        traceId,
      };
    } catch (err) {
      await db.db2.updateShot(args.shotId, {
        status: "FAILED",
        lastError: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  async patchImagePrompt(args: {
    shotId: string;
    artifactId: string;
    promptText: string;
    negativePrompt?: string;
    referenceAssetIds: string[];
  }) {
    const pool = db.db2.pool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await staleRules.onImagePromptEdited(args.shotId, client);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    const artifact = await createImagePromptVersionAtomic({
      shotId: args.shotId,
      promptText: args.promptText,
      negativePrompt: args.negativePrompt,
      referenceAssetIds: args.referenceAssetIds,
      createdBy: "user",
      baseArtifactId: args.artifactId,
    });
    await db.db2.updateShot(args.shotId, {
      status: "IMAGE_PROMPT_EDITED",
      activeImagePromptArtifactId: artifact.id,
    });
    return {
      data: artifact,
      shotStatus: "IMAGE_PROMPT_EDITED",
      nextAction: getNextAction("IMAGE_PROMPT_EDITED"),
    };
  },

  async listImagePrompts(shotId: string) {
    return { data: await db.db2.listImagePromptArtifacts(shotId) };
  },

  async selectImage(args: {
    shotId: string;
    imageCandidateId: string;
    imageGenerationBatchId: string;
    selectedBy?: string;
  }) {
    const existing = await db.db2.getSelectedImage(args.shotId);
    const isChange = !existing || existing.imageCandidateId !== args.imageCandidateId;

    const pool = db.db2.pool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (isChange) await staleRules.onImageSelectionChanged(args.shotId, client);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    await db.db2.upsertSelectedImage({
      shotId: args.shotId,
      imageCandidateId: args.imageCandidateId,
      imageGenerationBatchId: args.imageGenerationBatchId,
    });
    await db.db2.updateShot(args.shotId, {
      status: "IMAGE_SELECTED",
      selectedImageId: args.imageCandidateId,
    });
    return {
      data: { shotId: args.shotId, selectedImageId: args.imageCandidateId },
      shotStatus: "IMAGE_SELECTED",
      nextAction: getNextAction("IMAGE_SELECTED"),
    };
  },
};

export type ShotWorkflowService = typeof shotWorkflowService;
