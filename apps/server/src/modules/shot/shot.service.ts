import { nanoid } from "nanoid";
import { runStoryboardImagePromptAgent, runVideoShotScriptAgent } from "@aigc-video/ai";
import {
  materialIntakeArtifactSchema,
  productBriefArtifactSchema,
  shotPromptArtifactSchema,
} from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { config } from "../../common/config.js";
import { HttpError, NotFoundError } from "../../common/errors.js";
import {
  createImagePromptVersionAtomic,
  createVideoScriptVersionAtomic
} from "../artifact/artifact.versioning.js";
import {
  runVideoGenerationBatch,
} from "../generation/direct-generation.js";
import { generationService } from "../generation/generation.service.js";
import { traceService } from "../trace/trace.service.js";
import { getNextAction, type ShotStatus } from "./shot.state.js";

async function neighborImagesFor(workspaceId: string, shotId: string) {
  const shots = (await db.db2.listShotsByWorkspace(workspaceId)).sort(
    (a, b) => a.orderIndex - b.orderIndex
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
  const def =
    kind === "image" ? config.defaultImageBatchSize : config.defaultVideoBatchSize;
  const max = kind === "image" ? config.maxImageBatchSize : config.maxVideoBatchSize;
  const n = requested ?? def;
  if (n < 1 || n > max) {
    throw new HttpError(400, "COUNT_EXCEEDS_LIMIT", `count must be between 1 and ${max}`);
  }
  return n;
}

function assertShotInWorkspace(shot: { id: string; workspaceId: string }, workspaceId: string) {
  if (shot.workspaceId !== workspaceId) {
    throw new HttpError(404, "SHOT_NOT_FOUND", `Shot ${shot.id} is not in workspace ${workspaceId}`);
  }
}

async function getOptionalWorkspaceArtifact(workspaceId: string, artifactType: string) {
  try {
    return await db.getWorkspaceArtifact(workspaceId, artifactType);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

function refFromAssetRow(row: { url: string; metadata: unknown }) {
  const metadata = row.metadata as Record<string, unknown> | null;
  if (typeof metadata?.ref === "string") {
    return metadata.ref;
  }
  const match = /^\/api\/workspaces\/[^/]+\/materials\/(.+)$/.exec(row.url);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }
  return row.url.split("/").pop() ?? row.url;
}

async function listShotAssetRefs(shotId: string) {
  const result = await db.db2.pool().query(
    `select sar.asset_id, sar.role, sar.position, a.url, a.metadata
     from shot_asset_refs sar
     join asset a on a.id = sar.asset_id
     where sar.shot_id = $1
     order by sar.position asc, sar.created_at asc`,
    [shotId],
  );
  return result.rows.map((row) => ({
    assetId: String(row.asset_id),
    role: String(row.role),
    position: Number(row.position ?? 0),
    ref: refFromAssetRow({ url: String(row.url), metadata: row.metadata }),
    url: String(row.url),
    metadata: row.metadata as Record<string, unknown> | null,
  }));
}

async function selectedVideoForShot(shotId: string) {
  const result = await db.db2.pool().query(
    `select video_candidate_id, video_generation_batch_id
     from selected_shot_videos
     where shot_id = $1`,
    [shotId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    videoCandidateId: String(row.video_candidate_id),
    videoGenerationBatchId: String(row.video_generation_batch_id),
  };
}

async function latestBatchIdForArtifact(
  table: "image_generation_batches" | "video_generation_batches",
  artifactColumn: "image_prompt_artifact_id" | "video_script_artifact_id",
  artifactId: string,
) {
  const result = await db.db2.pool().query(
    `select id from ${table} where ${artifactColumn} = $1 order by created_at desc, id desc limit 1`,
    [artifactId],
  );
  return typeof result.rows[0]?.id === "string" ? result.rows[0].id : null;
}

async function hydratePromptContext(input: {
  workspaceId: string;
  shot: Awaited<ReturnType<typeof db.db2.getShot>>;
  kind: "image" | "video";
}) {
  const [briefArtifact, materialArtifact, shotPromptArtifact, shotAssetRefs, shots] =
    await Promise.all([
      getOptionalWorkspaceArtifact(input.workspaceId, "brief"),
      getOptionalWorkspaceArtifact(input.workspaceId, "assets"),
      getOptionalWorkspaceArtifact(input.workspaceId, "shotprompt"),
      listShotAssetRefs(input.shot.id),
      db.db2.listShotsByWorkspace(input.workspaceId),
    ]);

  const brief = briefArtifact ? productBriefArtifactSchema.parse(briefArtifact.data) : null;
  const material = materialArtifact
    ? materialIntakeArtifactSchema.parse(materialArtifact.data)
    : null;
  const shotPrompt = shotPromptArtifact
    ? shotPromptArtifactSchema.parse(shotPromptArtifact.data)
    : null;
  const shotPromptShot = shotPrompt?.shots.find(
    (shot) => shot.index === input.shot.orderIndex,
  );
  const materialDescriptions = new Map(
    material?.assets.map((asset) => [asset.ref, asset.description]) ?? [],
  );
  const referenceAssets = shotAssetRefs.map((asset) => ({
    id: asset.assetId,
    role: asset.role,
    ref: asset.ref,
    url: asset.url,
    summary: materialDescriptions.get(asset.ref) ?? asset.ref,
  }));
  const orderedShots = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  const shotIndex = orderedShots.findIndex((shot) => shot.id === input.shot.id);
  const previousShot = shotIndex > 0 ? orderedShots[shotIndex - 1] : null;
  const nextShot =
    shotIndex >= 0 && shotIndex < orderedShots.length - 1
      ? orderedShots[shotIndex + 1]
      : null;
  const previousPrompt =
    input.kind === "image"
      ? (await db.db2.listImagePromptArtifacts(input.shot.id))[0]
      : (await db.db2.listVideoScriptArtifacts(input.shot.id))[0];
  const currentSelectedImage = await db.db2.getSelectedImage(input.shot.id);
  const currentImageCandidate = currentSelectedImage
    ? await db.db2.getImageCandidate(currentSelectedImage.imageCandidateId)
    : null;
  const previousSelectedImage = previousShot
    ? await db.db2.getSelectedImage(previousShot.id)
    : null;
  const previousImageCandidate = previousSelectedImage
    ? await db.db2.getImageCandidate(previousSelectedImage.imageCandidateId)
    : null;
  const nextSelectedImage = nextShot ? await db.db2.getSelectedImage(nextShot.id) : null;
  const nextImageCandidate = nextSelectedImage
    ? await db.db2.getImageCandidate(nextSelectedImage.imageCandidateId)
    : null;
  const primaryRef = material?.primaryProductRef;
  const primaryAsset = primaryRef
    ? referenceAssets.find((asset) => asset.ref === primaryRef) ?? referenceAssets[0]
    : referenceAssets[0];
  const imageSceneAnchorUrl =
    shotIndex <= 0
      ? primaryAsset?.url ?? null
      : previousImageCandidate?.imageUrl ?? null;
  const sceneAnchorImageUrl =
    input.kind === "video"
      ? currentImageCandidate?.imageUrl ?? imageSceneAnchorUrl
      : imageSceneAnchorUrl;
  const summary = {
    approvedBriefArtifactId: briefArtifact?.id ?? null,
    materialIntakeArtifactId: materialArtifact?.id ?? null,
    shotPromptArtifactId: shotPromptArtifact?.id ?? null,
    referenceAssetRefs: referenceAssets.map((asset) => asset.ref),
    sceneAnchorImageUrl,
    previousPromptArtifactId: previousPrompt?.id ?? null,
  };

  return {
    brief,
    material,
    shotPrompt,
    shotPromptShot,
    referenceAssets,
    currentImageCandidate,
    previousImageCandidate,
    nextImageCandidate,
    previousShot,
    nextShot,
    shots: orderedShots,
    summary,
  };
}

function durationForVideoScript(shot: { defaultDurationSec: number | null }, requested?: number) {
  const value = requested ?? shot.defaultDurationSec ?? 4;
  return Math.min(8, Math.max(1, value));
}

async function allImagesSelected(workspaceId: string) {
  const shots = await db.db2.listShotsByWorkspace(workspaceId);
  return shots.length > 0 && shots.every((shot) => Boolean(shot.selectedImageId));
}

async function allVideosSelected(workspaceId: string) {
  const shots = await db.db2.listShotsByWorkspace(workspaceId);
  return shots.length > 0 && shots.every((shot) => Boolean(shot.selectedVideoId));
}

async function nextShotId(workspaceId: string, shotId: string) {
  const shots = (await db.db2.listShotsByWorkspace(workspaceId)).sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const index = shots.findIndex((shot) => shot.id === shotId);
  return index >= 0 ? shots[index + 1]?.id ?? null : null;
}

async function getImageCandidateMaybe(candidateId: string | null | undefined) {
  if (!candidateId) return null;
  try {
    return await db.db2.getImageCandidate(candidateId);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

function providerTemporaryUrl(row: { providerResponse: unknown; imageUrl?: string | null } | null | undefined) {
  const response = row?.providerResponse as Record<string, unknown> | null | undefined;
  return typeof response?.providerTemporaryUrl === "string"
    ? response.providerTemporaryUrl
    : row?.imageUrl ?? null;
}

export const shotWorkflowService = {
  resolveBatchCount,

  async listShots(workspaceId: string) {
    const shots = await db.db2.listShotsByWorkspace(workspaceId);
    const refs = await Promise.all(shots.map((shot) => listShotAssetRefs(shot.id)));
    return {
      data: shots.map((s, index) => ({
        ...s,
        referenceAssetRefs: (refs[index] ?? []).map((asset) => asset.ref),
        nextAction: getNextAction(s.status as ShotStatus)
      }))
    };
  },

  async getShot(shotId: string) {
    const shot = await db.db2.getShot(shotId);
    const refs = await listShotAssetRefs(shotId);
    return {
      data: {
        ...shot,
        referenceAssetRefs: refs.map((asset) => asset.ref),
        nextAction: getNextAction(shot.status as ShotStatus)
      }
    };
  },

  async workflowStatus(workspaceId: string) {
    const shots = await db.db2.listShotsByWorkspace(workspaceId);
    const enriched = await Promise.all(
      shots.map(async (s) => {
        const [imageBatch, videoBatch] = await Promise.all([
          db.db2.getLatestImageBatchForShot(s.id),
          db.db2.getLatestVideoBatchForShot(s.id)
        ]);
        return {
          shotId: s.id,
          orderIndex: s.orderIndex,
          status: s.status,
          nextAction: getNextAction(s.status as ShotStatus),
          activeImagePromptArtifactId: s.activeImagePromptArtifactId,
          selectedImageId: s.selectedImageId,
          activeVideoScriptArtifactId: s.activeVideoScriptArtifactId,
          selectedVideoId: s.selectedVideoId,
          activeImageBatchId: imageBatch?.id ?? null,
          activeVideoBatchId: videoBatch?.id ?? null
        };
      })
    );
    const canComposeFinalVideo =
      enriched.length > 0 && enriched.every((e) => e.status === "VIDEO_SELECTED");
    return { data: { workspaceId, shots: enriched, canComposeFinalVideo } };
  },

  async proposeImagePrompt(args: {
    workspaceId: string;
    shotId: string;
    userDirection?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    const hydrated = await hydratePromptContext({
      workspaceId: args.workspaceId,
      shot,
      kind: "image",
    });
    const referenceAssetIds = hydrated.referenceAssets.map((asset) => asset.id);
    const imageRef = hydrated.summary.sceneAnchorImageUrl;
    if (shot.orderIndex > 0 && !hydrated.previousImageCandidate?.imageUrl) {
      throw new HttpError(
        400,
        "NO_SCENE_ANCHOR",
        "Previous shot must have a selected image before proposing this image prompt",
      );
    }
    if (!imageRef) {
      throw new HttpError(
        400,
        "NO_SCENE_ANCHOR",
        "No product or previous-shot image is available as scene anchor",
      );
    }
    const imageRefProviderUrl =
      shot.orderIndex > 0 ? providerTemporaryUrl(hydrated.previousImageCandidate) : null;
    const count = resolveBatchCount("image");
    const aspectRatio = hydrated.shotPrompt?.aspectRatio ?? "9:16";
    const traceId = nanoid();

    await db.db2.updateShot(args.shotId, { status: "IMAGE_PROMPT_PROPOSING" });
    try {
      const result = await runStoryboardImagePromptAgent({
        payload: {
          productBrief: hydrated.brief ?? {},
          shot: {
            index: shot.orderIndex,
            objective:
              hydrated.shotPromptShot?.providerPrompt ?? shot.objective ?? shot.title,
            sceneDescription: hydrated.shotPromptShot?.providerPrompt ?? undefined,
            defaultDurationSec: shot.defaultDurationSec ?? undefined,
            productAssetRef: hydrated.shotPromptShot?.referenceAssetRefs[0],
            referenceAssetRefs: hydrated.shotPromptShot?.referenceAssetRefs ?? [],
            providerPromptFromShotPrompt: hydrated.shotPromptShot?.providerPrompt,
          },
          workspaceId: args.workspaceId,
          shotId: args.shotId,
          userDirection: args.userDirection,
          number: count,
          image_ref: imageRef,
          materialIntake: hydrated.material ?? {},
          previousImagePromptText:
            typeof hydrated.summary.previousPromptArtifactId === "string"
              ? (await db.db2.listImagePromptArtifacts(args.shotId))[0]?.promptText
              : undefined,
          referenceAssets: referenceAssetIds.map((id) => ({
            id,
            role:
              hydrated.referenceAssets.find((asset) => asset.id === id)?.role ??
              "product_identity",
            summary:
              hydrated.referenceAssets.find((asset) => asset.id === id)?.summary ??
              ""
          })),
          userHint: args.userDirection,
        },
        context: {
          workspaceId: args.workspaceId,
          shotId: args.shotId,
          traceId,
          runtimeMode: process.env.MODEL_MODE === "real" ? "real" : "mock"
        }
      });

      const artifact = await createImagePromptVersionAtomic({
        shotId: args.shotId,
        promptText: result.output.promptText,
        negativePrompt: result.output.negativePrompt ?? undefined,
        referenceAssetIds,
        promptJson: {
          ...result.output,
          context: {
            ...hydrated.summary,
            image_ref: imageRef,
            number: count,
          },
        },
        createdBy: "agent",
        agentName: "StoryboardImagePromptAgent",
        promptTemplateVersion: result.templateVersion
      });

      const enqueued = await generationService.createImageBatch({
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        imagePromptArtifactId: artifact.id,
        count,
        aspectRatio,
        idempotencyKey: `image:${artifact.id}:${traceId}`,
        providerRequest: {
          prompt: result.output.promptText,
          negativePrompt: result.output.negativePrompt ?? null,
          image_ref: imageRef,
          count,
          aspectRatio,
        },
        referenceImageUrls: imageRefProviderUrl ? [imageRefProviderUrl] : [],
      });
      const batchId =
        "batchId" in enqueued.data ? enqueued.data.batchId : enqueued.data.id;
      const batch =
        enqueued.batch ?? (await db.db2.getImageBatch(batchId));
      const candidates =
        enqueued.candidates ?? (await db.db2.listImageCandidatesByBatch(batchId));
      await db.db2.updateShot(args.shotId, {
        status: "IMAGE_GENERATING",
        activeImagePromptArtifactId: artifact.id
      });
      await traceService.record({
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        traceType: "agent_run",
        name: "image_prompt_proposed",
        outputPreview: result.output.promptText.slice(0, 200),
        metadata: {
          templateVersion: result.templateVersion,
          context: {
            ...hydrated.summary,
            image_ref: imageRef,
            number: count,
          },
          batchId: batch.id,
          candidates: candidates.map((candidate) => candidate.id),
        }
      });
      return {
        data: artifact,
        artifact,
        batch,
        candidates,
        usage: null,
        shotStatus: "IMAGE_GENERATING",
        nextAction: getNextAction("IMAGE_GENERATING"),
        traceId,
        context: {
          ...hydrated.summary,
          image_ref: imageRef,
          number: count,
        },
      };
    } catch (err) {
      await db.db2.updateShot(args.shotId, {
        status: "FAILED",
        lastError: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  },

  async listImagePrompts(shotId: string) {
    return { data: await db.db2.listImagePromptArtifacts(shotId) };
  },

  async selectImage(args: {
    workspaceId?: string;
    shotId: string;
    imageCandidateId: string;
    imageGenerationBatchId?: string;
    selectedBy?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    if (args.workspaceId) {
      assertShotInWorkspace(shot, args.workspaceId);
    }
    const candidate = await db.db2.getImageCandidate(args.imageCandidateId);
    if (
      candidate.shotId !== args.shotId ||
      candidate.workspaceId !== shot.workspaceId
    ) {
      throw new HttpError(400, "INVALID_CANDIDATE", "Candidate does not belong to this shot");
    }
    if (candidate.status !== "SUCCEEDED" || !candidate.imageUrl) {
      throw new HttpError(
        400,
        "CANNOT_SELECT_FAILED_CANDIDATE",
        "Only succeeded image candidates can be selected",
      );
    }
    const batch = await db.db2.getImageBatch(candidate.batchId);
    if (batch.status !== "SUCCEEDED") {
      throw new HttpError(
        409,
        "IMAGE_BATCH_INCOMPLETE",
        "Image batch must fully succeed before selecting a candidate",
      );
    }
    if (
      args.imageGenerationBatchId &&
      args.imageGenerationBatchId !== candidate.batchId
    ) {
      throw new HttpError(400, "INVALID_CANDIDATE", "Candidate does not match batch");
    }
    if (batch.shotId !== args.shotId || batch.workspaceId !== shot.workspaceId) {
      throw new HttpError(400, "INVALID_CANDIDATE", "Batch does not belong to this shot");
    }
    const latestBatch = await db.db2.getLatestImageBatchForShot(args.shotId);
    if (
      !latestBatch ||
      latestBatch.id !== candidate.batchId ||
      batch.imagePromptArtifactId !== shot.activeImagePromptArtifactId
    ) {
      throw new HttpError(
        409,
        "STALE_CANDIDATE",
        "Candidate is not from the active image round",
      );
    }

    await db.db2.upsertSelectedImage({
      shotId: args.shotId,
      imageCandidateId: args.imageCandidateId,
      imageGenerationBatchId: candidate.batchId
    });
    await db.db2.updateShot(args.shotId, {
      status: "IMAGE_SELECTED",
      selectedImageId: args.imageCandidateId
    });
    const selection = {
      shotId: args.shotId,
      selectedCandidateId: args.imageCandidateId,
      selectedImageUrl: candidate.imageUrl,
      nextShotId: await nextShotId(shot.workspaceId, args.shotId),
      allShotsImageSelected: await allImagesSelected(shot.workspaceId),
    };
    return {
      ...selection,
      data: selection,
      shotStatus: "IMAGE_SELECTED",
      nextAction: getNextAction("IMAGE_SELECTED")
    };
  },

  async proposeVideoScript(args: {
    workspaceId: string;
    shotId: string;
    userDirection?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    const shots = await db.db2.listShotsByWorkspace(args.workspaceId);
    const missingImageSelections = shots
      .filter((item) => !item.selectedImageId)
      .map((item) => item.id);
    if (missingImageSelections.length > 0) {
      throw new HttpError(
        400,
        "IMAGE_SELECTION_INCOMPLETE",
        `All shots must have selected images before video scripting: ${missingImageSelections.join(", ")}`,
      );
    }
    const selected = await db.db2.getSelectedImage(args.shotId);
    if (!selected) {
      throw new HttpError(
        400,
        "IMAGE_SELECTION_INCOMPLETE",
        "Cannot propose video script without a selected image",
      );
    }
    const selectedImage = await db.db2.getImageCandidate(selected.imageCandidateId);
    const hydrated = await hydratePromptContext({
      workspaceId: args.workspaceId,
      shot,
      kind: "video",
    });
    const frameNeighbors = await neighborImagesFor(args.workspaceId, args.shotId);
    const neighbors = { prev: undefined, next: frameNeighbors.next };
    const traceId = nanoid();
    const durationSec = durationForVideoScript(shot);
    const count = resolveBatchCount("video");
    const aspectRatio = hydrated.shotPrompt?.aspectRatio ?? "9:16";
    await db.db2.updateShot(args.shotId, { status: "VIDEO_SCRIPT_PROPOSING" });
    try {
      const result = await runVideoShotScriptAgent({
        payload: {
          productBrief: hydrated.brief ?? {},
          shot: {
            index: shot.orderIndex,
            objective:
              hydrated.shotPromptShot?.providerPrompt ?? shot.objective ?? shot.title,
            sceneDescription: hydrated.shotPromptShot?.providerPrompt ?? undefined,
            voiceover: hydrated.shotPromptShot?.voiceover ?? "",
            providerPromptFromShotPrompt: hydrated.shotPromptShot?.providerPrompt,
          },
          workspaceId: args.workspaceId,
          shotId: args.shotId,
          userDirection: args.userDirection,
          number: count,
          first_frame_url: selectedImage.imageUrl ?? "",
          last_frame_url: neighbors.next?.url ?? null,
          selectedImage: {
            id: selectedImage.id,
            summary: "",
            url: selectedImage.imageUrl ?? ""
          },
          neighborImages: neighbors,
          durationSec,
          userHint: args.userDirection,
          previousVideoScript:
            typeof hydrated.summary.previousPromptArtifactId === "string"
              ? (await db.db2.listVideoScriptArtifacts(args.shotId))[0]?.scriptJson
              : undefined,
        },
        context: {
          workspaceId: args.workspaceId,
          shotId: args.shotId,
          traceId,
          runtimeMode: process.env.MODEL_MODE === "real" ? "real" : "mock"
        }
      });

      const artifact = await createVideoScriptVersionAtomic({
        shotId: args.shotId,
        durationSec: result.output.durationSec,
        scriptJson: { ...result.output, context: hydrated.summary },
        providerPrompt: result.output.providerPrompt,
        basedOnImageCandidateId: selectedImage.id,
        basedOnPrevImageCandidateId: undefined,
        basedOnNextImageCandidateId: neighbors.next?.id,
        createdBy: "agent",
        agentName: "VideoShotScriptAgent",
        promptTemplateVersion: result.templateVersion
      });

      const batch = await db.db2.insertVideoBatch({
        id: "vbb_" + nanoid(10),
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        videoScriptArtifactId: artifact.id,
        status: "PENDING",
        requestedCount: count,
        succeededCount: 0,
        failedCount: 0,
        provider: "seedance",
        aspectRatio,
        providerRequest: {
          providerPrompt: result.output.providerPrompt,
          first_frame_url: selectedImage.imageUrl ?? null,
          last_frame_url: neighbors.next?.url ?? null,
          durationSec: result.output.durationSec,
          count,
          aspectRatio,
        },
        errorMessage: null,
        idempotencyKey: null,
      });
      await db.db2.updateShot(args.shotId, {
        status: "VIDEO_GENERATING",
        activeVideoScriptArtifactId: artifact.id
      });
      const generated = await runVideoGenerationBatch({
        batchId: batch.id,
        count,
        aspectRatio,
      });
      const finalStatus = generated.finalBatch.status === "FAILED" ? "FAILED" : "VIDEO_CANDIDATES_READY";
      await db.db2.updateShot(args.shotId, {
        status: finalStatus,
        activeVideoScriptArtifactId: artifact.id
      });
      await traceService.record({
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        traceType: "agent_run",
        name: "video_script_proposed",
        outputPreview: result.output.providerPrompt.slice(0, 200),
        metadata: {
          templateVersion: result.templateVersion,
          context: hydrated.summary,
          frames: {
            firstFrameCandidateId: selectedImage.id,
            lastFrameCandidateId: neighbors.next?.id ?? null,
            firstFrameUrl: selectedImage.imageUrl ?? null,
            lastFrameUrl: neighbors.next?.url ?? null,
          },
          batchId: batch.id,
          candidates: generated.candidates.map((candidate) => candidate.id),
        }
      });
      return {
        data: artifact,
        artifact,
        batch: generated.finalBatch,
        candidates: generated.candidates,
        shotStatus: finalStatus,
        nextAction: getNextAction(finalStatus),
        traceId,
        context: hydrated.summary,
        frames: {
          firstFrameCandidateId: selectedImage.id,
          lastFrameCandidateId: neighbors.next?.id ?? null,
          firstFrameUrl: selectedImage.imageUrl ?? null,
          lastFrameUrl: neighbors.next?.url ?? null,
        },
      };
    } catch (err) {
      await db.db2.updateShot(args.shotId, {
        status: "FAILED",
        lastError: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  },

  async listVideoScripts(shotId: string) {
    return { data: await db.db2.listVideoScriptArtifacts(shotId) };
  },

  async selectVideo(args: {
    workspaceId?: string;
    shotId: string;
    videoCandidateId: string;
    videoGenerationBatchId?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    if (args.workspaceId) {
      assertShotInWorkspace(shot, args.workspaceId);
    }
    const candidate = await db.db2.getVideoCandidate(args.videoCandidateId);
    if (
      candidate.shotId !== args.shotId ||
      candidate.workspaceId !== shot.workspaceId
    ) {
      throw new HttpError(400, "INVALID_CANDIDATE", "Candidate does not belong to this shot");
    }
    if (candidate.status !== "SUCCEEDED" || !candidate.videoUrl) {
      throw new HttpError(
        400,
        "CANNOT_SELECT_FAILED_CANDIDATE",
        "Only succeeded video candidates can be selected",
      );
    }
    const batch = await db.db2.getVideoBatch(candidate.batchId);
    if (
      args.videoGenerationBatchId &&
      args.videoGenerationBatchId !== candidate.batchId
    ) {
      throw new HttpError(400, "INVALID_CANDIDATE", "Candidate does not match batch");
    }
    if (batch.shotId !== args.shotId || batch.workspaceId !== shot.workspaceId) {
      throw new HttpError(400, "INVALID_CANDIDATE", "Batch does not belong to this shot");
    }
    const latestBatch = await db.db2.getLatestVideoBatchForShot(args.shotId);
    if (
      !latestBatch ||
      latestBatch.id !== candidate.batchId ||
      batch.videoScriptArtifactId !== shot.activeVideoScriptArtifactId
    ) {
      throw new HttpError(
        409,
        "STALE_CANDIDATE",
        "Candidate is not from the active video round",
      );
    }

    await db.db2.upsertSelectedVideo({
      shotId: args.shotId,
      videoCandidateId: args.videoCandidateId,
      videoGenerationBatchId: candidate.batchId,
    });
    await db.db2.updateShot(args.shotId, {
      status: "VIDEO_SELECTED",
      selectedVideoId: args.videoCandidateId
    });
    const selection = {
      shotId: args.shotId,
      selectedCandidateId: args.videoCandidateId,
      selectedVideoUrl: candidate.videoUrl,
      duration: shot.defaultDurationSec ?? candidate.durationSec ?? 0,
      allShotsVideoSelected: await allVideosSelected(shot.workspaceId),
    };
    return {
      ...selection,
      data: selection,
      shotStatus: "VIDEO_SELECTED",
      nextAction: getNextAction("VIDEO_SELECTED")
    };
  },

  async listImageRounds(args: { workspaceId: string; shotId: string }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    const [artifacts, selected, hydrated] = await Promise.all([
      db.db2.listImagePromptArtifacts(args.shotId),
      db.db2.getSelectedImage(args.shotId),
      hydratePromptContext({ workspaceId: args.workspaceId, shot, kind: "image" }),
    ]);
    const rounds = await Promise.all(
      artifacts.map(async (artifact) => {
        const batchId = await latestBatchIdForArtifact(
          "image_generation_batches",
          "image_prompt_artifact_id",
          artifact.id,
        );
        const batch = batchId ? await db.db2.getImageBatch(batchId) : null;
        const candidates = batch
          ? await db.db2.listImageCandidatesByBatch(batch.id)
          : [];
        const selectedCandidate = selected
          ? candidates.find((candidate) => candidate.id === selected.imageCandidateId)
          : undefined;
        const selection = selectedCandidate?.imageUrl
          ? {
              shotId: args.shotId,
              selectedCandidateId: selectedCandidate.id,
              selectedImageUrl: selectedCandidate.imageUrl,
              nextShotId: await nextShotId(args.workspaceId, args.shotId),
              allShotsImageSelected: await allImagesSelected(args.workspaceId),
            }
          : null;
        const promptJson = artifact.promptJson as { context?: unknown } | null;
        return {
          artifact,
          batch,
          candidates,
          selection,
          context: promptJson?.context ?? hydrated.summary,
        };
      }),
    );
    return { data: rounds };
  },

  async listVideoRounds(args: { workspaceId: string; shotId: string }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    const [artifacts, selected, hydrated] = await Promise.all([
      db.db2.listVideoScriptArtifacts(args.shotId),
      selectedVideoForShot(args.shotId),
      hydratePromptContext({ workspaceId: args.workspaceId, shot, kind: "video" }),
    ]);
    const rounds = await Promise.all(
      artifacts.map(async (artifact) => {
        const batchId = await latestBatchIdForArtifact(
          "video_generation_batches",
          "video_script_artifact_id",
          artifact.id,
        );
        const batch = batchId ? await db.db2.getVideoBatch(batchId) : null;
        const candidates = batch
          ? await db.db2.listVideoCandidatesByBatch(batch.id)
          : [];
        const selectedCandidate = selected
          ? candidates.find((candidate) => candidate.id === selected.videoCandidateId)
          : undefined;
        const selection = selectedCandidate?.videoUrl
          ? {
              shotId: args.shotId,
              selectedCandidateId: selectedCandidate.id,
              selectedVideoUrl: selectedCandidate.videoUrl,
              duration: shot.defaultDurationSec ?? selectedCandidate.durationSec ?? 0,
              allShotsVideoSelected: await allVideosSelected(args.workspaceId),
            }
          : null;
        const [firstFrame, lastFrame] = await Promise.all([
          getImageCandidateMaybe(artifact.basedOnImageCandidateId),
          getImageCandidateMaybe(artifact.basedOnNextImageCandidateId),
        ]);
        const scriptJson = artifact.scriptJson as { context?: unknown } | null;
        return {
          artifact,
          batch,
          candidates,
          selection,
          frames: {
            firstFrameUrl: firstFrame?.imageUrl ?? null,
            lastFrameUrl: lastFrame?.imageUrl ?? null,
            firstFrameCandidateId: firstFrame?.id ?? artifact.basedOnImageCandidateId,
            lastFrameCandidateId: lastFrame?.id ?? null,
          },
          context: scriptJson?.context ?? hydrated.summary,
        };
      }),
    );
    return { data: rounds };
  },

  async retry(args: {
    shotId: string;
    what: "image_batch" | "video_batch";
    idempotencyKey: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    if (args.what === "image_batch") {
      if (!shot.activeImagePromptArtifactId) {
        throw new HttpError(409, "NO_ACTIVE_IMAGE_PROMPT");
      }
      return await generationService.createImageBatch({
        workspaceId: shot.workspaceId,
        shotId: shot.id,
        imagePromptArtifactId: shot.activeImagePromptArtifactId,
        aspectRatio: "9:16",
        idempotencyKey: args.idempotencyKey
      });
    }
    if (!shot.activeVideoScriptArtifactId) {
      throw new HttpError(409, "NO_ACTIVE_VIDEO_SCRIPT");
    }
    return await generationService.createVideoBatch({
      workspaceId: shot.workspaceId,
      shotId: shot.id,
      videoScriptArtifactId: shot.activeVideoScriptArtifactId,
      aspectRatio: "9:16",
      idempotencyKey: args.idempotencyKey
    });
  }
};

export type ShotWorkflowService = typeof shotWorkflowService;
