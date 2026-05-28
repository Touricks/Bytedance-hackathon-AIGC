import { nanoid } from "nanoid";
import {
  runStoryboardImagePromptAgent,
  runVideoShotScriptAgent,
} from "@aigc-video/ai";
import { db } from "../../db/client.js";
import { config } from "../../common/config.js";
import { HttpError } from "../../common/errors.js";
import {
  createImagePromptVersionAtomic,
  createVideoScriptVersionAtomic,
} from "../artifact/artifact.versioning.js";
import { traceService } from "../trace/trace.service.js";
import { getNextAction, type ShotStatus } from "./shot.state.js";
import { staleRules } from "./shot.stale.js";

async function neighborImagesFor(workspaceId: string, shotId: string) {
  const shots = (await db.db2.listShotsByWorkspace(workspaceId)).sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const idx = shots.findIndex((s) => s.id === shotId);
  const prev = idx > 0 ? shots[idx - 1] : undefined;
  const next = idx >= 0 && idx < shots.length - 1 ? shots[idx + 1] : undefined;
  async function pick(id: string | null) {
    if (!id) return undefined;
    const sel = await db.db2.getSelectedImage(id);
    if (!sel) return undefined;
    const cand = await db.db2.getImageCandidate(sel.imageCandidateId);
    if (!cand?.imageUrl) return undefined;
    return { id: cand.id, url: cand.imageUrl, summary: "" };
  }
  return { prev: await pick(prev?.id ?? null), next: await pick(next?.id ?? null) };
}

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

  async proposeVideoScript(args: {
    workspaceId: string;
    shotId: string;
    durationSec: number;
    useNeighborFrames: boolean;
    userHint?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    const selected = await db.db2.getSelectedImage(args.shotId);
    if (!selected) {
      throw new HttpError(
        409,
        "NO_SELECTED_IMAGE",
        "Cannot propose video script without a selected image",
      );
    }
    const selectedImage = await db.db2.getImageCandidate(selected.imageCandidateId);
    const neighbors = args.useNeighborFrames
      ? await neighborImagesFor(args.workspaceId, args.shotId)
      : { prev: undefined, next: undefined };
    const traceId = nanoid();
    await db.db2.updateShot(args.shotId, { status: "VIDEO_SCRIPT_PROPOSING" });
    try {
      const result = await runVideoShotScriptAgent({
        payload: {
          productBrief: {},
          shot: {
            index: shot.orderIndex,
            objective: shot.objective ?? shot.title,
          },
          selectedImage: {
            id: selectedImage.id,
            summary: "",
            url: selectedImage.imageUrl ?? "",
          },
          neighborImages: neighbors,
          durationSec: args.durationSec,
          userHint: args.userHint,
        },
        context: {
          workspaceId: args.workspaceId,
          shotId: args.shotId,
          traceId,
          runtimeMode: process.env.MODEL_MODE === "real" ? "real" : "mock",
        },
      });

      const artifact = await createVideoScriptVersionAtomic({
        shotId: args.shotId,
        durationSec: result.output.durationSec,
        scriptJson: result.output,
        providerPrompt: result.output.providerPrompt,
        basedOnImageCandidateId: selectedImage.id,
        basedOnPrevImageCandidateId: neighbors.prev?.id,
        basedOnNextImageCandidateId: neighbors.next?.id,
        createdBy: "agent",
        agentName: "VideoShotScriptAgent",
        promptTemplateVersion: result.templateVersion,
      });

      await db.db2.updateShot(args.shotId, {
        status: "VIDEO_SCRIPT_READY",
        activeVideoScriptArtifactId: artifact.id,
      });
      await traceService.record({
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        traceType: "agent_run",
        name: "video_script_proposed",
        outputPreview: result.output.providerPrompt.slice(0, 200),
        metadata: { templateVersion: result.templateVersion },
      });
      return {
        data: artifact,
        shotStatus: "VIDEO_SCRIPT_READY",
        nextAction: getNextAction("VIDEO_SCRIPT_READY"),
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

  async patchVideoScript(args: {
    shotId: string;
    scriptId: string;
    baseVersion: number;
    durationSec: number;
    scriptJson: unknown;
    providerPrompt: string;
  }) {
    const prior = await db.db2.getVideoScriptArtifact(args.scriptId);
    if (prior.version !== args.baseVersion) {
      throw new HttpError(
        409,
        "STALE_BASE_VERSION",
        "baseVersion does not match active script",
      );
    }
    const artifact = await createVideoScriptVersionAtomic({
      shotId: args.shotId,
      durationSec: args.durationSec,
      scriptJson: args.scriptJson,
      providerPrompt: args.providerPrompt,
      basedOnImageCandidateId: prior.basedOnImageCandidateId,
      basedOnPrevImageCandidateId: prior.basedOnPrevImageCandidateId ?? undefined,
      basedOnNextImageCandidateId: prior.basedOnNextImageCandidateId ?? undefined,
      createdBy: "user",
      baseArtifactId: args.scriptId,
    });
    await db.db2.updateShot(args.shotId, {
      status: "VIDEO_SCRIPT_EDITED",
      activeVideoScriptArtifactId: artifact.id,
    });
    return {
      data: artifact,
      shotStatus: "VIDEO_SCRIPT_EDITED",
      nextAction: getNextAction("VIDEO_SCRIPT_EDITED"),
    };
  },

  async listVideoScripts(shotId: string) {
    return { data: await db.db2.listVideoScriptArtifacts(shotId) };
  },

  async selectVideo(args: {
    shotId: string;
    videoCandidateId: string;
    videoGenerationBatchId: string;
  }) {
    await db.db2.upsertSelectedVideo(args);
    await db.db2.updateShot(args.shotId, {
      status: "VIDEO_SELECTED",
      selectedVideoId: args.videoCandidateId,
    });
    return {
      data: { shotId: args.shotId, selectedVideoId: args.videoCandidateId },
      shotStatus: "VIDEO_SELECTED",
      nextAction: getNextAction("VIDEO_SELECTED"),
    };
  },
};

export type ShotWorkflowService = typeof shotWorkflowService;
