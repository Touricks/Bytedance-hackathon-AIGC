import { nanoid } from "nanoid";
import {
  materialIntakeArtifactSchema,
  productBriefArtifactSchema,
  shotPromptArtifactSchema
} from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { config } from "../../common/config.js";
import { HttpError, NotFoundError } from "../../common/errors.js";
import {
  createImagePromptVersionAtomic,
  createVideoScriptVersionAtomic
} from "../artifact/artifact.versioning.js";
import { buildSeedanceShotVideoPrompt } from "../generation/direct-generation.js";
import { generationService } from "../generation/generation.service.js";
import { seedanceVoiceProfileHash } from "../generation/voice-profile.js";
import { traceService } from "../trace/trace.service.js";
import { shotSetService } from "../workspace/shot-set.service.js";
import {
  compareSourceFingerprint,
  type UpstreamDrift
} from "../workspace/upstream-drift-v2.service.js";
import {
  assembleShotImagePrompt,
  assembleShotVideoScript,
  SHOT_IMAGE_ASSEMBLER_VERSION,
  SHOT_VIDEO_ASSEMBLER_VERSION
} from "./prompt-assembler.js";
import { getNextAction, type ShotStatus } from "./shot.state.js";
import { buildWorkflowShotRow } from "./shot.view.js";

type EditableShotAssetRefRole =
  | "product_identity"
  | "reference_style"
  | "reference_scene"
  | "first_frame_hint"
  | "other";

type EditableShotAssetRefInput = {
  assetId: string;
  role: EditableShotAssetRefRole;
  weight?: number;
};

async function listActiveShotsForWorkspace(workspaceId: string) {
  return (await shotSetService.listActiveShots(workspaceId)).sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
}

async function listWorkflowStatusShotsForWorkspace(workspaceId: string) {
  await db.getWorkspace(workspaceId);
  const active = await shotSetService.getActiveShotSet(workspaceId);
  if (!active) {
    return [];
  }
  return (await shotSetService.listShotSetShots({ workspaceId, shotSetId: active.id })).sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
}

async function assertShotInActiveShotSet(workspaceId: string, shotId: string) {
  const shots = await listActiveShotsForWorkspace(workspaceId);
  const shot = shots.find((item) => item.id === shotId);
  if (!shot) {
    throw new HttpError(
      400,
      "SHOT_NOT_IN_ACTIVE_SET",
      "Shot does not belong to the active shot set"
    );
  }
  return { shot, shots };
}

async function neighborImagesFor(workspaceId: string, shotId: string) {
  const shots = await listActiveShotsForWorkspace(workspaceId);
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
    kind === "image" ? config.defaultImageCandidates : config.defaultVideoCandidates;
  const max =
    kind === "image"
      ? config.maxImageCandidatesPerShot
      : config.maxVideoCandidatesPerShot;
  const n = requested ?? def;
  if (n < 1 || n > max) {
    throw new HttpError(400, "COUNT_EXCEEDS_LIMIT", `count must be between 1 and ${max}`);
  }
  return n;
}

function assertShotInWorkspace(
  shot: { id: string; workspaceId: string },
  workspaceId: string
) {
  if (shot.workspaceId !== workspaceId) {
    throw new HttpError(
      404,
      "SHOT_NOT_FOUND",
      `Shot ${shot.id} is not in workspace ${workspaceId}`
    );
  }
}

function promptArtifactView<T extends Record<string, unknown>>(artifact: T) {
  const promptAssembly = artifact.promptAssembly ?? artifact.prompt_assembly ?? {};
  const sourceFingerprint =
    artifact.sourceFingerprint ?? artifact.source_fingerprint ?? {};
  return {
    ...artifact,
    promptAssembly,
    sourceFingerprint,
    baseArtifactId: artifact.baseArtifactId ?? artifact.base_artifact_id ?? null,
    createdBy: artifact.createdBy ?? artifact.created_by,
    agentName: artifact.agentName ?? artifact.agent_name ?? null,
    promptTemplateVersion:
      artifact.promptTemplateVersion ?? artifact.prompt_template_version ?? null,
    referenceAssetIds:
      artifact.referenceAssetIds ?? artifact.reference_asset_ids ?? []
  };
}

const noUpstreamDrift: UpstreamDrift = {
  upstreamChanged: false,
  changedSources: []
};

type CurrentModuleArtifactTable =
  | "material_intake_artifacts"
  | "product_brief_artifacts"
  | "shot_prompt_artifacts";

type PromptContextShot = {
  id: string;
  workspaceId: string;
  orderIndex: number;
  title: string;
  objective: string | null;
  defaultDurationSec: number | null;
  activeImagePromptArtifactId?: string | null;
  activeVideoScriptArtifactId?: string | null;
};

async function getCurrentModuleArtifact(
  workspaceId: string,
  table: CurrentModuleArtifactTable
) {
  const result = await db.db2.pool().query(
    `select id, data
     from ${table}
     where workspace_id = $1
       and status = 'approved'
       and is_current = true
     order by approved_at desc, created_at desc, id desc
     limit 1`,
    [workspaceId]
  );
  const row = result.rows[0];
  return row ? { id: String(row.id), data: row.data } : null;
}

async function getShotPromptRequirement(shotId: string) {
  const result = await db.db2.pool().query(
    `select id, shot_prompt_artifact_id, shot_image, shot_video
     from shot_prompt_requirements
     where shot_id = $1
     limit 1`,
    [shotId]
  );
  const row = result.rows[0];
  return row
    ? {
        id: String(row.id),
        shotPromptArtifactId: String(row.shot_prompt_artifact_id),
        shotImage: row.shot_image,
        shotVideo: row.shot_video
      }
    : null;
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

function normalizeShotAssetRefRole(role: string): EditableShotAssetRefRole {
  switch (role) {
    case "product_identity":
    case "reference_style":
    case "reference_scene":
    case "first_frame_hint":
    case "other":
      return role;
    case "reference":
      return "reference_scene";
    default:
      return "other";
  }
}

async function listShotAssetRefs(shotId: string) {
  const result = await db.db2.pool().query(
    `select sar.id, sar.shot_id, sar.asset_id, sar.role, sar.weight, sar.position, a.url, a.metadata
     from shot_asset_refs sar
     join asset a on a.id = sar.asset_id
     where sar.shot_id = $1
     order by sar.position asc, sar.created_at asc`,
    [shotId]
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    shotId: String(row.shot_id),
    assetId: String(row.asset_id),
    role: normalizeShotAssetRefRole(String(row.role)),
    weight: Number(row.weight ?? 1),
    position: Number(row.position ?? 0),
    ref: refFromAssetRow({ url: String(row.url), metadata: row.metadata }),
    url: String(row.url),
    metadata: row.metadata as Record<string, unknown> | null
  }));
}

async function getEditableShotOrThrow(shotId: string) {
  const shot = await db.db2.getShot(shotId);
  const { shot: activeShot } = await assertShotInActiveShotSet(shot.workspaceId, shotId);
  return activeShot;
}

async function assertAssetEditableForShot(input: {
  workspaceId: string;
  assetId: string;
}) {
  const result = await db.db2.pool().query(
    `select id, metadata
     from asset
     where id = $1
     limit 1`,
    [input.assetId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(400, "INVALID_ASSET_REF", `Asset ${input.assetId} does not exist`);
  }
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
  const assetWorkspaceId =
    typeof metadata?.workspaceId === "string" ? metadata.workspaceId : null;
  if (assetWorkspaceId && assetWorkspaceId !== input.workspaceId) {
    throw new HttpError(
      400,
      "INVALID_ASSET_REF",
      `Asset ${input.assetId} does not belong to workspace ${input.workspaceId}`
    );
  }
}

async function selectedVideoForShot(shotId: string) {
  return await db.db2.getSelectedVideo(shotId);
}

async function latestBatchIdForArtifact(
  table: "image_generation_batches" | "video_generation_batches",
  artifactColumn: "image_prompt_artifact_id" | "video_script_artifact_id",
  artifactId: string
) {
  const result = await db.db2
    .pool()
    .query(
      `select id from ${table} where ${artifactColumn} = $1 order by created_at desc, id desc limit 1`,
      [artifactId]
    );
  return typeof result.rows[0]?.id === "string" ? result.rows[0].id : null;
}

async function hydratePromptContext(input: {
  workspaceId: string;
  shot: PromptContextShot;
  kind: "image" | "video";
}) {
  const [
    briefArtifact,
    materialArtifact,
    shotPromptArtifact,
    shotRequirement,
    shotAssetRefs,
    shots
  ] = await Promise.all([
    getCurrentModuleArtifact(input.workspaceId, "product_brief_artifacts"),
    getCurrentModuleArtifact(input.workspaceId, "material_intake_artifacts"),
    getCurrentModuleArtifact(input.workspaceId, "shot_prompt_artifacts"),
    getShotPromptRequirement(input.shot.id),
    listShotAssetRefs(input.shot.id),
    listActiveShotsForWorkspace(input.workspaceId)
  ]);

  const brief = briefArtifact
    ? productBriefArtifactSchema.parse(briefArtifact.data)
    : null;
  const material = materialArtifact
    ? materialIntakeArtifactSchema.parse(materialArtifact.data)
    : null;
  const shotPrompt = shotPromptArtifact
    ? shotPromptArtifactSchema.parse(shotPromptArtifact.data)
    : null;
  const materialDescriptions = new Map(
    material?.assets.map((asset) => [asset.ref, asset.description]) ?? []
  );
  const referenceAssets = shotAssetRefs.map((asset) => ({
    id: asset.assetId,
    role: asset.role,
    ref: asset.ref,
    url: asset.url,
    summary: materialDescriptions.get(asset.ref) ?? asset.ref
  }));
  const orderedShots = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  const shotIndex = orderedShots.findIndex((shot) => shot.id === input.shot.id);
  const previousShot = shotIndex > 0 ? orderedShots[shotIndex - 1] : null;
  const nextShot =
    shotIndex >= 0 && shotIndex < orderedShots.length - 1
      ? orderedShots[shotIndex + 1]
      : null;
  const shotPromptShotBase =
    shotIndex >= 0
      ? (shotPrompt?.shots[shotIndex] ??
        shotPrompt?.shots.find((shot) => shot.index === input.shot.orderIndex))
      : undefined;
  const shotPromptShot = shotPromptShotBase
    ? {
        ...shotPromptShotBase,
        shotImage: shotRequirement?.shotImage ?? {},
        shotVideo: shotRequirement?.shotVideo ?? {}
      }
    : undefined;
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
    ? (referenceAssets.find((asset) => asset.ref === primaryRef) ?? referenceAssets[0])
    : referenceAssets[0];
  const imageSceneAnchorUrl =
    shotIndex <= 0
      ? (primaryAsset?.url ?? null)
      : (previousImageCandidate?.imageUrl ?? null);
  const sceneAnchorImageUrl =
    input.kind === "video"
      ? (currentImageCandidate?.imageUrl ?? imageSceneAnchorUrl)
      : imageSceneAnchorUrl;
  const summary = {
    approvedBriefArtifactId: briefArtifact?.id ?? null,
    materialIntakeArtifactId: materialArtifact?.id ?? null,
    shotPromptArtifactId: shotPromptArtifact?.id ?? null,
    shotPromptRequirementsId: shotRequirement?.id ?? null,
    referenceAssetRefs: referenceAssets.map((asset) => asset.ref),
    sceneAnchorImageUrl,
    previousPromptArtifactId: previousPrompt?.id ?? null
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
    summary
  };
}

function currentImagePromptSources(
  hydrated: Awaited<ReturnType<typeof hydratePromptContext>>
) {
  return {
    approvedBriefArtifactId: hydrated.summary.approvedBriefArtifactId,
    materialIntakeArtifactId: hydrated.summary.materialIntakeArtifactId,
    shotPromptArtifactId: hydrated.summary.shotPromptArtifactId,
    shotPromptRequirementsId: hydrated.summary.shotPromptRequirementsId,
    shotGoal: hydrated.shotPromptShot?.providerPrompt ?? null,
    sceneAnchorImageUrl: hydrated.summary.sceneAnchorImageUrl
  };
}

function currentVideoScriptSources(
  hydrated: Awaited<ReturnType<typeof hydratePromptContext>>
) {
  return {
    approvedBriefArtifactId: hydrated.summary.approvedBriefArtifactId,
    materialIntakeArtifactId: hydrated.summary.materialIntakeArtifactId,
    shotPromptArtifactId: hydrated.summary.shotPromptArtifactId,
    shotPromptRequirementsId: hydrated.summary.shotPromptRequirementsId,
    shotGoal: hydrated.shotPromptShot?.providerPrompt ?? null,
    firstFrameCandidateId: hydrated.currentImageCandidate?.id ?? null,
    lastFrameCandidateId: hydrated.nextImageCandidate?.id ?? null,
    voiceProfileHash: hydrated.shotPrompt
      ? seedanceVoiceProfileHash(hydrated.shotPrompt.tts.voiceProfile)
      : null
  };
}

function mergeUpstreamDrift(items: UpstreamDrift[]): UpstreamDrift {
  const changedSources = [...new Set(items.flatMap((item) => item.changedSources))];
  return {
    upstreamChanged: items.some((item) => item.upstreamChanged),
    changedSources
  };
}

async function shotArtifactUpstreamDrift(args: {
  workspaceId: string;
  shot: PromptContextShot;
}) {
  const [imageHydrated, videoHydrated, imageArtifact, videoArtifact] = await Promise.all([
    hydratePromptContext({
      workspaceId: args.workspaceId,
      shot: args.shot,
      kind: "image"
    }),
    hydratePromptContext({
      workspaceId: args.workspaceId,
      shot: args.shot,
      kind: "video"
    }),
    args.shot.activeImagePromptArtifactId
      ? db.db2.getImagePromptArtifact(args.shot.activeImagePromptArtifactId).catch(() => null)
      : Promise.resolve(null),
    args.shot.activeVideoScriptArtifactId
      ? db.db2.getVideoScriptArtifact(args.shot.activeVideoScriptArtifactId).catch(() => null)
      : Promise.resolve(null)
  ]);
  const imagePromptUpstream = imageArtifact
    ? compareSourceFingerprint(
        imageArtifact.sourceFingerprint,
        currentImagePromptSources(imageHydrated)
      )
    : noUpstreamDrift;
  const videoScriptUpstream = videoArtifact
    ? compareSourceFingerprint(
        videoArtifact.sourceFingerprint,
        currentVideoScriptSources(videoHydrated)
      )
    : noUpstreamDrift;

  return {
    imagePromptUpstream,
    videoScriptUpstream,
    upstream: mergeUpstreamDrift([imagePromptUpstream, videoScriptUpstream])
  };
}

function durationForVideoScript(
  shot: { defaultDurationSec: number | null },
  requested?: number
) {
  const value = requested ?? shot.defaultDurationSec ?? 4;
  return Math.min(8, Math.max(4, value));
}

async function allImagesSelected(workspaceId: string) {
  const shots = await listActiveShotsForWorkspace(workspaceId);
  return shots.length > 0 && shots.every((shot) => Boolean(shot.selectedImageId));
}

async function allVideosSelected(workspaceId: string) {
  const shots = await listActiveShotsForWorkspace(workspaceId);
  return shots.length > 0 && shots.every((shot) => Boolean(shot.selectedVideoId));
}

async function nextShotId(workspaceId: string, shotId: string) {
  const shots = await listActiveShotsForWorkspace(workspaceId);
  const index = shots.findIndex((shot) => shot.id === shotId);
  return index >= 0 ? (shots[index + 1]?.id ?? null) : null;
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

function providerTemporaryUrl(
  row: { providerResponse: unknown; imageUrl?: string | null } | null | undefined
) {
  const response = row?.providerResponse as Record<string, unknown> | null | undefined;
  return typeof response?.providerTemporaryUrl === "string"
    ? response.providerTemporaryUrl
    : (row?.imageUrl ?? null);
}

function imageReferenceUrl(
  row: { providerResponse: unknown; imageUrl?: string | null } | null | undefined
) {
  return row?.imageUrl ?? providerTemporaryUrl(row);
}

function videoCandidateView(candidate: Awaited<ReturnType<typeof db.db2.getVideoCandidate>>) {
  const response =
    candidate.providerResponse && typeof candidate.providerResponse === "object"
      ? (candidate.providerResponse as Record<string, unknown>)
      : {};
  const providerTemporaryUrl =
    typeof response.providerTemporaryUrl === "string"
      ? response.providerTemporaryUrl
      : typeof response.videoUrl === "string"
        ? response.videoUrl
        : null;
  const previewVideoUrl = candidate.videoUrl ?? providerTemporaryUrl;
  const providerTaskId =
    typeof response.taskId === "string"
      ? response.taskId
      : typeof response.providerTaskId === "string"
        ? response.providerTaskId
        : null;
  const providerReadyAt =
    typeof response.providerReadyAt === "string" ? response.providerReadyAt : null;
  const persistStatus =
    candidate.status === "PERSISTING"
      ? "PERSISTING"
      : candidate.status === "SUCCEEDED" && candidate.videoUrl
        ? "SUCCEEDED"
        : candidate.status === "FAILED"
          ? "FAILED"
          : "PENDING";
  return {
    ...candidate,
    previewVideoUrl,
    providerTaskId,
    providerReadyAt,
    persistStatus
  };
}

function uniqueReferenceImageUrls(values: Array<string | null | undefined>) {
  return values.filter(
    (value, index, all): value is string =>
      Boolean(value) && all.indexOf(value) === index
  );
}

function shotGoalFor(
  shot: PromptContextShot,
  hydrated: Awaited<ReturnType<typeof hydratePromptContext>>,
) {
  return hydrated.shotPromptShot?.providerPrompt ?? shot.objective ?? shot.title;
}

function promptAssembly(moduleId: "image-prompt" | "video-script", mode: string) {
  const assemblerVersion =
    moduleId === "image-prompt"
      ? SHOT_IMAGE_ASSEMBLER_VERSION
      : SHOT_VIDEO_ASSEMBLER_VERSION;
  return {
    moduleId,
    assemblerVersion,
    mode,
    source: "server-deterministic-assembler",
  };
}

async function assertLatestImageFeedbackCandidate(input: {
  workspaceId: string;
  shotId: string;
  baseArtifactId: string;
  candidateId: string;
}) {
  const [candidate, latestBatch] = await Promise.all([
    db.db2.getImageCandidate(input.candidateId),
    db.db2.getLatestImageBatchForShot(input.shotId),
  ]);
  if (
    candidate.workspaceId !== input.workspaceId ||
    candidate.shotId !== input.shotId
  ) {
    throw new HttpError(400, "INVALID_FEEDBACK_CANDIDATE", "Feedback image candidate does not belong to this shot");
  }
  if (candidate.status !== "SUCCEEDED" || !candidate.imageUrl) {
    throw new HttpError(400, "INVALID_FEEDBACK_CANDIDATE", "Feedback image candidate must be a succeeded candidate");
  }
  if (!latestBatch || latestBatch.id !== candidate.batchId) {
    throw new HttpError(409, "STALE_FEEDBACK_CANDIDATE", "Feedback image candidate must come from the latest image round");
  }
  if (latestBatch.imagePromptArtifactId !== input.baseArtifactId) {
    throw new HttpError(409, "STALE_BASE_IMAGE_PROMPT", "Base image prompt must be the latest image round artifact");
  }
  return { candidate, batch: latestBatch };
}

async function assertLatestVideoFeedbackCandidate(input: {
  workspaceId: string;
  shotId: string;
  baseArtifactId: string;
  candidateId: string;
}) {
  const [candidate, latestBatch] = await Promise.all([
    db.db2.getVideoCandidate(input.candidateId),
    db.db2.getLatestVideoBatchForShot(input.shotId),
  ]);
  if (
    candidate.workspaceId !== input.workspaceId ||
    candidate.shotId !== input.shotId
  ) {
    throw new HttpError(400, "INVALID_FEEDBACK_CANDIDATE", "Feedback video candidate does not belong to this shot");
  }
  if (candidate.status !== "SUCCEEDED" || !candidate.videoUrl) {
    throw new HttpError(400, "INVALID_FEEDBACK_CANDIDATE", "Feedback video candidate must be a succeeded candidate");
  }
  if (!latestBatch || latestBatch.id !== candidate.batchId) {
    throw new HttpError(409, "STALE_FEEDBACK_CANDIDATE", "Feedback video candidate must come from the latest video round");
  }
  if (latestBatch.videoScriptArtifactId !== input.baseArtifactId) {
    throw new HttpError(409, "STALE_BASE_VIDEO_SCRIPT", "Base video script must be the latest video round artifact");
  }
  return { candidate, batch: latestBatch };
}

type ShotPromptRequirementContext = {
  shotImage: unknown;
  shotVideo: unknown;
  compiledText: string;
};

const SHOT_IMAGE_FIELD_ORDER = [
  "scene",
  "composition",
  "lighting",
  "productVisibility",
  "productVis",
  "referenceUsage",
  "style",
  "negative",
];

const SHOT_VIDEO_FIELD_ORDER = [
  "cameraMotion",
  "subjectMotion",
  "firstFrame",
  "firstFrameIntent",
  "lastFrame",
  "lastFrameIntent",
  "durationIntent",
  "continuity",
  "negative",
];

function stableRequirementValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未提供";
  if (typeof value === "string") return value.trim() || "未提供";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => stableRequirementValue(item)).join("；");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function orderedRequirementEntries(
  value: unknown,
  preferredOrder: string[],
): Array<[string, unknown]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [["value", value]];
  }
  const record = value as Record<string, unknown>;
  const preferred = preferredOrder
    .filter((key) => Object.prototype.hasOwnProperty.call(record, key))
    .map((key) => [key, record[key]] as [string, unknown]);
  const extras = Object.keys(record)
    .filter((key) => !preferredOrder.includes(key))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => [key, record[key]] as [string, unknown]);
  return [...preferred, ...extras];
}

function compileRequirementSection(
  title: string,
  value: unknown,
  preferredOrder: string[],
) {
  const entries = orderedRequirementEntries(value, preferredOrder);
  return [
    `${title}:`,
    ...entries.map(([key, fieldValue]) => `- ${key}: ${stableRequirementValue(fieldValue)}`),
  ].join("\n");
}

function compileShotPromptRequirements(shotPromptShot: {
  shotImage?: unknown;
  shotVideo?: unknown;
} | null | undefined): ShotPromptRequirementContext {
  const shotImage = shotPromptShot?.shotImage ?? {};
  const shotVideo = shotPromptShot?.shotVideo ?? {};
  const compiledText = [
    "上游分镜生成要求是本次分镜图 prompt 的权威输入。",
    compileRequirementSection("shotImage 静态关键帧要求", shotImage, SHOT_IMAGE_FIELD_ORDER),
    compileRequirementSection(
      "shotVideo 动态与连续性要求（需转译为静态关键帧约束）",
      shotVideo,
      SHOT_VIDEO_FIELD_ORDER,
    ),
  ].join("\n\n");
  return { shotImage, shotVideo, compiledText };
}

function imagePromptContextSnapshot(input: {
  sourceFingerprint: Record<string, unknown>;
  requirements: ShotPromptRequirementContext;
  userDirection?: string;
  baseArtifactId?: string;
}) {
  return {
    ...input.sourceFingerprint,
    ...(input.baseArtifactId ? { baseArtifactId: input.baseArtifactId } : {}),
    userDirection: input.userDirection?.trim() || null,
    shotImage: input.requirements.shotImage,
    shotVideo: input.requirements.shotVideo,
    compiledShotRequirements: input.requirements.compiledText,
  };
}

export const shotWorkflowService = {
  resolveBatchCount,

  async listShots(workspaceId: string) {
    const shots = await shotSetService.listActiveShots(workspaceId);
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
    const shot = await getEditableShotOrThrow(shotId);
    const refs = await listShotAssetRefs(shotId);
    return {
      data: {
        ...shot,
        referenceAssetRefs: refs.map((asset) => asset.ref),
        nextAction: getNextAction(shot.status as ShotStatus)
      }
    };
  },

  async listShotAssetRefs(shotId: string) {
    await getEditableShotOrThrow(shotId);
    return {
      data: await listShotAssetRefs(shotId),
    };
  },

  async replaceShotAssetRefs(input: {
    shotId: string;
    refs: EditableShotAssetRefInput[];
  }) {
    const shot = await getEditableShotOrThrow(input.shotId);
    for (const ref of input.refs) {
      await assertAssetEditableForShot({
        workspaceId: shot.workspaceId,
        assetId: ref.assetId,
      });
    }

    const client = await db.db2.pool().connect();
    try {
      await client.query("begin");
      await client.query("delete from shot_asset_refs where shot_id = $1", [input.shotId]);
      for (const [position, ref] of input.refs.entries()) {
        await client.query(
          `insert into shot_asset_refs
             (id, shot_id, asset_id, role, weight, position)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            nanoid(),
            input.shotId,
            ref.assetId,
            ref.role,
            ref.weight ?? 1,
            position,
          ]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return {
      data: await listShotAssetRefs(input.shotId),
    };
  },

  async workflowStatus(workspaceId: string) {
    const shots = await listWorkflowStatusShotsForWorkspace(workspaceId);
    const enriched = await Promise.all(
      shots.map(async (s) => {
        const [imageBatch, videoBatch, selectedImageCandidate, upstreamDrift] = await Promise.all([
          db.db2.getLatestImageBatchForShot(s.id),
          db.db2.getLatestVideoBatchForShot(s.id),
          s.selectedImageId
            ? db.db2.getImageCandidate(s.selectedImageId).catch(() => null)
            : Promise.resolve(null),
          shotArtifactUpstreamDrift({ workspaceId, shot: s })
        ]);
        return buildWorkflowShotRow(s, {
          activeImageBatchId: imageBatch?.id ?? null,
          activeVideoBatchId: videoBatch?.id ?? null,
          activeVideoBatchStatus: videoBatch?.status ?? null,
          selectedImageCandidate,
          upstream: upstreamDrift.upstream,
          videoUpstream: upstreamDrift.videoScriptUpstream
        });
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
    candidateCount?: number;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    await assertShotInActiveShotSet(args.workspaceId, args.shotId);
    const hydrated = await hydratePromptContext({
      workspaceId: args.workspaceId,
      shot,
      kind: "image"
    });
    const referenceAssetIds = hydrated.referenceAssets.map((asset) => asset.id);
    const imageRef = hydrated.summary.sceneAnchorImageUrl;
    if (shot.orderIndex > 0 && !hydrated.previousImageCandidate?.imageUrl) {
      throw new HttpError(
        400,
        "NO_SCENE_ANCHOR",
        "Previous shot must have a selected image before proposing this image prompt"
      );
    }
    if (!imageRef) {
      throw new HttpError(
        400,
        "NO_SCENE_ANCHOR",
        "No product or previous-shot image is available as scene anchor"
      );
    }
    const imageRefProviderUrl =
      shot.orderIndex > 0 ? imageReferenceUrl(hydrated.previousImageCandidate) : null;
    const count = resolveBatchCount("image", args.candidateCount);
    const aspectRatio = hydrated.shotPrompt?.aspectRatio ?? "9:16";
    const traceId = nanoid();
    const shotRequirements = compileShotPromptRequirements(hydrated.shotPromptShot);
    const shotGoal = shotGoalFor(shot, hydrated);
    const userDirection = args.userDirection?.trim() || undefined;
    const assembled = assembleShotImagePrompt({
      shotGoal,
      shotImage: shotRequirements.shotImage,
      userDirection,
      mode: "propose",
    });

    await db.db2.updateShot(args.shotId, { status: "IMAGE_PROMPT_PROPOSING" });
    try {
      const sourceFingerprint = {
        ...hydrated.summary,
        shotGoal,
        image_ref: imageRef,
        number: count,
        assemblerVersion: SHOT_IMAGE_ASSEMBLER_VERSION,
      };
      const contextSnapshot = imagePromptContextSnapshot({
        sourceFingerprint,
        requirements: shotRequirements,
        userDirection,
      });
      const artifact = await createImagePromptVersionAtomic({
        shotId: args.shotId,
        promptText: assembled.promptText,
        negativePrompt: assembled.negativePrompt || undefined,
        referenceAssetIds,
        sourceFingerprint,
        promptAssembly: promptAssembly("image-prompt", "propose"),
        promptJson: {
          ...assembled.promptJson,
          context: contextSnapshot
        },
        createdBy: "system",
        agentName: "DeterministicImagePromptAssembler",
        promptTemplateVersion: SHOT_IMAGE_ASSEMBLER_VERSION
      });
      const artifactView = promptArtifactView(artifact);

      const enqueued = await generationService.createImageBatch({
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        imagePromptArtifactId: artifact.id,
        count,
        aspectRatio,
        idempotencyKey: `image:${artifact.id}:${traceId}`,
        providerRequest: {
          prompt: assembled.promptText,
          negativePrompt: assembled.negativePrompt || null,
          image_ref: imageRef,
          referenceImageOrder: [
            ...hydrated.referenceAssets.map((asset) => ({
              role: "material_reference",
              assetId: asset.id,
              ref: asset.ref,
            })),
            ...(imageRefProviderUrl
              ? [{ role: "previous_shot_image", url: imageRefProviderUrl }]
              : []),
          ],
          count,
          aspectRatio,
          assemblerVersion: SHOT_IMAGE_ASSEMBLER_VERSION,
        },
        referenceImageUrlsAfterAssets: imageRefProviderUrl ? [imageRefProviderUrl] : []
      });
      const batchId =
        "batchId" in enqueued.data ? enqueued.data.batchId : enqueued.data.id;
      const batch = enqueued.batch ?? (await db.db2.getImageBatch(batchId));
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
        outputPreview: assembled.promptText.slice(0, 200),
        metadata: {
          templateVersion: SHOT_IMAGE_ASSEMBLER_VERSION,
          promptAssembly: promptAssembly("image-prompt", "propose"),
          context: contextSnapshot,
          batchId: batch.id,
          candidates: candidates.map((candidate) => candidate.id)
        }
      });
      return {
        data: artifactView,
        artifact: artifactView,
        batch,
        candidates,
        usage: null,
        shotStatus: "IMAGE_GENERATING",
        nextAction: getNextAction("IMAGE_GENERATING"),
        traceId,
        context: contextSnapshot
      };
    } catch (err) {
      await db.db2.updateShot(args.shotId, {
        status: "FAILED",
        lastError: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  },

  async regenerateImagePrompt(args: {
    workspaceId: string;
    shotId: string;
    baseArtifactId: string;
    feedbackImageCandidateId: string;
    userDirection: string;
    candidateCount?: number;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    await assertShotInActiveShotSet(args.workspaceId, args.shotId);
    const baseArtifact = await db.db2.getImagePromptArtifact(args.baseArtifactId);
    if (baseArtifact.shotId !== args.shotId) {
      throw new HttpError(
        400,
        "INVALID_BASE_IMAGE_PROMPT",
        "Base image prompt artifact does not belong to this shot"
      );
    }

    const hydrated = await hydratePromptContext({
      workspaceId: args.workspaceId,
      shot,
      kind: "image"
    });
    const imageRef = hydrated.summary.sceneAnchorImageUrl;
    if (shot.orderIndex > 0 && !hydrated.previousImageCandidate?.imageUrl) {
      throw new HttpError(
        400,
        "NO_SCENE_ANCHOR",
        "Previous shot must have a selected image before regenerating this image prompt"
      );
    }
    if (!imageRef) {
      throw new HttpError(
        400,
        "NO_SCENE_ANCHOR",
        "No product or previous-shot image is available as scene anchor"
      );
    }
    const userDirection = args.userDirection.trim();
    if (!userDirection) {
      throw new HttpError(400, "USER_DIRECTION_REQUIRED", "userDirection is required for image feedback regeneration");
    }
    const { candidate: feedbackImageCandidate } = await assertLatestImageFeedbackCandidate({
      workspaceId: args.workspaceId,
      shotId: args.shotId,
      baseArtifactId: baseArtifact.id,
      candidateId: args.feedbackImageCandidateId,
    });

    const traceId = nanoid();
    const count = resolveBatchCount("image", args.candidateCount);
    const aspectRatio = hydrated.shotPrompt?.aspectRatio ?? "9:16";
    const imageRefProviderUrl =
      shot.orderIndex > 0 ? imageReferenceUrl(hydrated.previousImageCandidate) : null;
    const feedbackImageRef = feedbackImageCandidate?.imageUrl ?? null;
    const feedbackImageProviderUrl = imageReferenceUrl(feedbackImageCandidate);
    const editedAt = new Date().toISOString();
    const referenceAssetIds = hydrated.referenceAssets.map((asset) => asset.id);
    const shotRequirements = compileShotPromptRequirements(hydrated.shotPromptShot);
    const shotGoal = shotGoalFor(shot, hydrated);
    const assembled = assembleShotImagePrompt({
      shotGoal,
      shotImage: shotRequirements.shotImage,
      userDirection,
      mode: "regenerate",
    });
    const sourceFingerprint = {
      ...hydrated.summary,
      ...(baseArtifact.sourceFingerprint && typeof baseArtifact.sourceFingerprint === "object"
        ? { baseSourceFingerprint: baseArtifact.sourceFingerprint }
        : {}),
      baseArtifactId: baseArtifact.id,
      userDirection,
      editedAt,
      shotGoal,
      image_ref: imageRef,
      feedbackImageRef,
      feedbackImageCandidateId: feedbackImageCandidate.id,
      number: count,
      assemblerVersion: SHOT_IMAGE_ASSEMBLER_VERSION,
    };
    const contextSnapshot = imagePromptContextSnapshot({
      sourceFingerprint,
      requirements: shotRequirements,
      userDirection,
      baseArtifactId: baseArtifact.id,
    });

    const artifact = await createImagePromptVersionAtomic({
      shotId: args.shotId,
      promptText: assembled.promptText,
      negativePrompt: assembled.negativePrompt || undefined,
      referenceAssetIds,
      sourceFingerprint,
      promptAssembly: promptAssembly("image-prompt", "user-feedback-regenerate"),
      promptJson: {
        ...assembled.promptJson,
        context: contextSnapshot,
      },
      createdBy: "user",
      agentName: "DeterministicImagePromptAssembler",
      promptTemplateVersion: SHOT_IMAGE_ASSEMBLER_VERSION,
      baseArtifactId: baseArtifact.id
    });
    const artifactView = promptArtifactView(artifact);

    const enqueued = await generationService.createImageBatch({
      workspaceId: args.workspaceId,
      shotId: args.shotId,
      imagePromptArtifactId: artifact.id,
      count,
      aspectRatio,
      idempotencyKey: `image-regenerate:${artifact.id}:${traceId}`,
      providerRequest: {
        prompt: assembled.promptText,
        negativePrompt: assembled.negativePrompt || null,
        image_ref: imageRef,
        feedbackImageRef,
        feedbackImageCandidateId: feedbackImageCandidate.id,
        referenceImageOrder: [
          { role: "feedback_image", candidateId: feedbackImageCandidate.id, url: feedbackImageRef },
          ...hydrated.referenceAssets.map((asset) => ({
            role: "material_reference",
            assetId: asset.id,
            ref: asset.ref,
          })),
          ...(imageRefProviderUrl
            ? [{ role: "previous_shot_image", url: imageRefProviderUrl }]
            : []),
        ],
        count,
        aspectRatio,
        source: "user-feedback-regenerate",
        baseArtifactId: baseArtifact.id,
        userDirection,
        assemblerVersion: SHOT_IMAGE_ASSEMBLER_VERSION,
      },
      referenceImageUrls: uniqueReferenceImageUrls([
        feedbackImageProviderUrl,
      ]),
      referenceImageUrlsAfterAssets: imageRefProviderUrl ? [imageRefProviderUrl] : [],
    });
    const batchId =
      "batchId" in enqueued.data ? enqueued.data.batchId : enqueued.data.id;
    const batch = enqueued.batch ?? (await db.db2.getImageBatch(batchId));
    const candidates =
      enqueued.candidates ?? (await db.db2.listImageCandidatesByBatch(batchId));
    await db.db2.updateShot(args.shotId, {
      status: "IMAGE_GENERATING",
      activeImagePromptArtifactId: artifact.id
    });
    await traceService.record({
      workspaceId: args.workspaceId,
      shotId: args.shotId,
      traceType: "user_action",
      name: "image_prompt_regenerated",
      outputPreview: assembled.promptText.slice(0, 200),
      metadata: {
        baseArtifactId: baseArtifact.id,
        newArtifactId: artifact.id,
        context: contextSnapshot,
        batchId: batch.id,
        candidates: candidates.map((candidate) => candidate.id)
      }
    });
    return {
      data: artifactView,
      artifact: artifactView,
      batch,
      candidates,
      shotStatus: "IMAGE_GENERATING",
      nextAction: getNextAction("IMAGE_GENERATING"),
      traceId,
      context: contextSnapshot
    };
  },

  async listImagePrompts(shotId: string) {
    await getEditableShotOrThrow(shotId);
    return { data: await db.db2.listImagePromptArtifacts(shotId) };
  },

  async selectImage(args: {
    workspaceId: string;
    shotId: string;
    imageCandidateId: string;
    imageGenerationBatchId?: string;
    selectedBy?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    await assertShotInActiveShotSet(args.workspaceId, args.shotId);
    const candidate = await db.db2.getImageCandidate(args.imageCandidateId);
    if (candidate.shotId !== args.shotId || candidate.workspaceId !== shot.workspaceId) {
      throw new HttpError(
        400,
        "INVALID_CANDIDATE",
        "Candidate does not belong to this shot"
      );
    }
    if (candidate.status !== "SUCCEEDED" || !candidate.imageUrl) {
      throw new HttpError(
        400,
        "CANNOT_SELECT_FAILED_CANDIDATE",
        "Only succeeded image candidates can be selected"
      );
    }
    const batch = await db.db2.getImageBatch(candidate.batchId);
    if (batch.status !== "SUCCEEDED" && batch.status !== "PARTIAL") {
      throw new HttpError(
        409,
        "IMAGE_BATCH_INCOMPLETE",
        "Image batch must have at least one succeeded candidate before selecting"
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
    await db.db2.upsertSelectedImage({
      shotId: args.shotId,
      imageCandidateId: args.imageCandidateId,
      imageGenerationBatchId: candidate.batchId,
      selectedBy: args.selectedBy ?? "user"
    });
    await db.db2.updateShot(args.shotId, {
      status: "IMAGE_SELECTED",
      selectedImageId: args.imageCandidateId
    });
    await traceService.record({
      workspaceId: shot.workspaceId,
      shotId: args.shotId,
      traceType: "user_action",
      name: "image_candidate_selected",
      outputPreview: candidate.imageUrl,
      metadata: {
        imageCandidateId: args.imageCandidateId,
        imageGenerationBatchId: candidate.batchId,
        selectedBy: args.selectedBy ?? "user"
      }
    });
    const selection = {
      shotId: args.shotId,
      selectedCandidateId: args.imageCandidateId,
      selectedImageUrl: candidate.imageUrl,
      nextShotId: await nextShotId(shot.workspaceId, args.shotId),
      allShotsImageSelected: await allImagesSelected(shot.workspaceId)
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
    candidateCount?: number;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    const { shots } = await assertShotInActiveShotSet(
      args.workspaceId,
      args.shotId
    );
    const missingImageSelections = shots
      .filter((item) => !item.selectedImageId)
      .map((item) => item.id);
    if (missingImageSelections.length > 0) {
      throw new HttpError(
        400,
        "IMAGE_SELECTION_INCOMPLETE",
        `All shots must have selected images before video scripting: ${missingImageSelections.join(", ")}`
      );
    }
    const selected = await db.db2.getSelectedImage(args.shotId);
    if (!selected) {
      throw new HttpError(
        400,
        "IMAGE_SELECTION_INCOMPLETE",
        "Cannot propose video script without a selected image"
      );
    }
    const selectedImage = await db.db2.getImageCandidate(selected.imageCandidateId);
    const hydrated = await hydratePromptContext({
      workspaceId: args.workspaceId,
      shot,
      kind: "video"
    });
    const frameNeighbors = await neighborImagesFor(args.workspaceId, args.shotId);
    const neighbors = { prev: undefined, next: frameNeighbors.next };
    const traceId = nanoid();
    const durationSec = durationForVideoScript(shot);
    const count = resolveBatchCount("video", args.candidateCount);
    const aspectRatio = hydrated.shotPrompt?.aspectRatio ?? "9:16";
    await db.db2.updateShot(args.shotId, { status: "VIDEO_SCRIPT_PROPOSING" });
    try {
      const shotGoal = shotGoalFor(shot, hydrated);
      const voiceProfile = hydrated.shotPrompt?.tts.voiceProfile;
      const assembled = assembleShotVideoScript({
        shotGoal,
        shotVideo: hydrated.shotPromptShot?.shotVideo ?? {},
        durationSec,
        voiceover: hydrated.shotPromptShot?.voiceover ?? "",
        voiceProfile,
        firstFrameCandidateId: selectedImage.id,
        firstFrameUrl: selectedImage.imageUrl ?? null,
        lastFrameCandidateId: neighbors.next?.id ?? null,
        lastFrameUrl: neighbors.next?.url ?? null,
        userDirection: args.userDirection,
        mode: "propose",
      });

      const sourceFingerprint = {
        ...hydrated.summary,
        shotGoal,
        firstFrameCandidateId: selectedImage.id,
        lastFrameCandidateId: neighbors.next?.id ?? null,
        voiceProfile: voiceProfile ?? null,
        voiceProfileHash: seedanceVoiceProfileHash(
          voiceProfile,
        ),
        voiceover: hydrated.shotPromptShot?.voiceover ?? "",
        number: count,
        assemblerVersion: SHOT_VIDEO_ASSEMBLER_VERSION,
      };
      const artifact = await createVideoScriptVersionAtomic({
        shotId: args.shotId,
        durationSec: assembled.durationSec,
        scriptJson: { ...assembled.scriptJson, context: sourceFingerprint },
        providerPrompt: assembled.providerPrompt,
        basedOnImageCandidateId: selectedImage.id,
        basedOnPrevImageCandidateId: undefined,
        basedOnNextImageCandidateId: neighbors.next?.id,
        sourceFingerprint,
        promptAssembly: promptAssembly("video-script", "propose"),
        createdBy: "system",
        agentName: "DeterministicVideoScriptAssembler",
        promptTemplateVersion: SHOT_VIDEO_ASSEMBLER_VERSION
      });
      const artifactView = promptArtifactView(artifact);

      // Async like the image pipeline: enqueue one job per video candidate and
      // return immediately with the PENDING batch. The shared worker's
      // concurrency + the VIDEO_PROVIDER_CONCURRENCY semaphore bound how
      // many Seedance calls run at once; the client polls `video-rounds` until
      // the shot reaches VIDEO_CANDIDATES_READY. (Was: synchronous inline
      // runVideoGenerationBatch fan-out that blew past the provider rate limit.)
      await db.db2.updateShot(args.shotId, {
        activeVideoScriptArtifactId: artifact.id
      });
      const enqueued = await generationService.createVideoBatch({
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        videoScriptArtifactId: artifact.id,
        count,
        aspectRatio,
        idempotencyKey: `video:${artifact.id}:${traceId}`,
        providerRequest: {
          prompt: buildSeedanceShotVideoPrompt({
            providerPrompt: assembled.providerPrompt,
            scriptJson: { ...assembled.scriptJson, context: sourceFingerprint },
          }),
          providerPrompt: assembled.providerPrompt,
          firstFrameCandidateId: selectedImage.id,
          firstFrameUrl: selectedImage.imageUrl ?? null,
          lastFrameCandidateId: neighbors.next?.id ?? null,
          lastFrameUrl: neighbors.next?.url ?? null,
          durationSec,
          count,
          aspectRatio,
          voiceover: hydrated.shotPromptShot?.voiceover ?? "",
          voiceProfileHash: sourceFingerprint.voiceProfileHash,
          assemblerVersion: SHOT_VIDEO_ASSEMBLER_VERSION,
        },
      });
      await traceService.record({
        workspaceId: args.workspaceId,
        shotId: args.shotId,
        traceType: "agent_run",
        name: "video_script_proposed",
        outputPreview: assembled.providerPrompt.slice(0, 200),
        metadata: {
          templateVersion: SHOT_VIDEO_ASSEMBLER_VERSION,
          promptAssembly: promptAssembly("video-script", "propose"),
          context: sourceFingerprint,
          frames: {
            firstFrameCandidateId: selectedImage.id,
            lastFrameCandidateId: neighbors.next?.id ?? null,
            firstFrameUrl: selectedImage.imageUrl ?? null,
            lastFrameUrl: neighbors.next?.url ?? null
          },
          batchId: enqueued.batch.id,
          requestedCount: count
        }
      });
      return {
        data: artifactView,
        artifact: artifactView,
        batch: enqueued.batch,
        candidates: enqueued.candidates,
        shotStatus: "VIDEO_GENERATING" as const,
        nextAction: getNextAction("VIDEO_GENERATING"),
        traceId,
        context: sourceFingerprint,
        frames: {
          firstFrameCandidateId: selectedImage.id,
          lastFrameCandidateId: neighbors.next?.id ?? null,
          firstFrameUrl: selectedImage.imageUrl ?? null,
          lastFrameUrl: neighbors.next?.url ?? null
        },
        poll: {
          videoRoundsUrl: `/api/workspaces/${args.workspaceId}/shots/${args.shotId}/video-rounds`,
          batchId: enqueued.batch.id
        }
      };
    } catch (err) {
      await db.db2.updateShot(args.shotId, {
        status: "FAILED",
        lastError: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  },

  async regenerateVideoScript(args: {
    workspaceId: string;
    shotId: string;
    baseArtifactId: string;
    feedbackVideoCandidateId: string;
    userDirection: string;
    candidateCount?: number;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    const { shots } = await assertShotInActiveShotSet(args.workspaceId, args.shotId);
    const userDirection = args.userDirection.trim();
    if (!userDirection) {
      throw new HttpError(400, "USER_DIRECTION_REQUIRED", "userDirection is required for video feedback regeneration");
    }
    const baseArtifact = await db.db2.getVideoScriptArtifact(args.baseArtifactId);
    if (baseArtifact.shotId !== args.shotId) {
      throw new HttpError(
        400,
        "INVALID_BASE_VIDEO_SCRIPT",
        "Base video script artifact does not belong to this shot"
      );
    }
    const { candidate: feedbackVideoCandidate } = await assertLatestVideoFeedbackCandidate({
      workspaceId: args.workspaceId,
      shotId: args.shotId,
      baseArtifactId: baseArtifact.id,
      candidateId: args.feedbackVideoCandidateId,
    });
    const missingImageSelections = shots
      .filter((item) => !item.selectedImageId)
      .map((item) => item.id);
    if (missingImageSelections.length > 0) {
      throw new HttpError(
        400,
        "IMAGE_SELECTION_INCOMPLETE",
        `All shots must have selected images before video scripting: ${missingImageSelections.join(", ")}`
      );
    }
    const selected = await db.db2.getSelectedImage(args.shotId);
    if (!selected) {
      throw new HttpError(
        400,
        "IMAGE_SELECTION_INCOMPLETE",
        "Cannot regenerate video script without a selected image"
      );
    }
    const selectedImage = await db.db2.getImageCandidate(selected.imageCandidateId);
    const hydrated = await hydratePromptContext({
      workspaceId: args.workspaceId,
      shot,
      kind: "video"
    });
    const frameNeighbors = await neighborImagesFor(args.workspaceId, args.shotId);
    const neighbors = { prev: undefined, next: frameNeighbors.next };
    const traceId = nanoid();
    const durationSec = durationForVideoScript(shot);
    const count = resolveBatchCount("video", args.candidateCount);
    const aspectRatio = hydrated.shotPrompt?.aspectRatio ?? "9:16";
    const shotGoal = shotGoalFor(shot, hydrated);
    const voiceProfile = hydrated.shotPrompt?.tts.voiceProfile;
    const assembled = assembleShotVideoScript({
      shotGoal,
      shotVideo: hydrated.shotPromptShot?.shotVideo ?? {},
      durationSec,
      voiceover: hydrated.shotPromptShot?.voiceover ?? "",
      voiceProfile,
      firstFrameCandidateId: selectedImage.id,
      firstFrameUrl: selectedImage.imageUrl ?? null,
      lastFrameCandidateId: neighbors.next?.id ?? null,
      lastFrameUrl: neighbors.next?.url ?? null,
      userDirection,
      feedbackVideoCandidateId: feedbackVideoCandidate.id,
      mode: "regenerate",
    });
    const sourceFingerprint = {
      ...hydrated.summary,
      ...(baseArtifact.sourceFingerprint && typeof baseArtifact.sourceFingerprint === "object"
        ? { baseSourceFingerprint: baseArtifact.sourceFingerprint }
        : {}),
      baseArtifactId: baseArtifact.id,
      userDirection,
      editedAt: new Date().toISOString(),
      shotGoal,
      firstFrameCandidateId: selectedImage.id,
      lastFrameCandidateId: neighbors.next?.id ?? null,
      voiceProfile: voiceProfile ?? null,
      voiceProfileHash: seedanceVoiceProfileHash(voiceProfile),
      voiceover: hydrated.shotPromptShot?.voiceover ?? "",
      feedbackVideoCandidateId: feedbackVideoCandidate.id,
      feedbackVideoUrl: feedbackVideoCandidate.videoUrl,
      number: count,
      assemblerVersion: SHOT_VIDEO_ASSEMBLER_VERSION,
    };
    const artifact = await createVideoScriptVersionAtomic({
      shotId: args.shotId,
      durationSec: assembled.durationSec,
      scriptJson: { ...assembled.scriptJson, context: sourceFingerprint },
      providerPrompt: assembled.providerPrompt,
      basedOnImageCandidateId: selectedImage.id,
      basedOnPrevImageCandidateId: undefined,
      basedOnNextImageCandidateId: neighbors.next?.id,
      sourceFingerprint,
      promptAssembly: promptAssembly("video-script", "user-feedback-regenerate"),
      createdBy: "user",
      agentName: "DeterministicVideoScriptAssembler",
      promptTemplateVersion: SHOT_VIDEO_ASSEMBLER_VERSION,
      baseArtifactId: baseArtifact.id,
    });
    const artifactView = promptArtifactView(artifact);
    await db.db2.updateShot(args.shotId, {
      activeVideoScriptArtifactId: artifact.id
    });
    const providerPrompt = buildSeedanceShotVideoPrompt({
      providerPrompt: assembled.providerPrompt,
      scriptJson: { ...assembled.scriptJson, context: sourceFingerprint },
    });
    const enqueued = await generationService.createVideoBatch({
      workspaceId: args.workspaceId,
      shotId: args.shotId,
      videoScriptArtifactId: artifact.id,
      count,
      aspectRatio,
      idempotencyKey: `video-regenerate:${artifact.id}:${traceId}`,
      providerRequest: {
        prompt: providerPrompt,
        providerPrompt: assembled.providerPrompt,
        firstFrameCandidateId: selectedImage.id,
        firstFrameUrl: selectedImage.imageUrl ?? null,
        lastFrameCandidateId: neighbors.next?.id ?? null,
        lastFrameUrl: neighbors.next?.url ?? null,
        durationSec,
        count,
        aspectRatio,
        voiceover: hydrated.shotPromptShot?.voiceover ?? "",
        voiceProfileHash: sourceFingerprint.voiceProfileHash,
        feedbackVideoCandidateId: feedbackVideoCandidate.id,
        feedbackVideoUrl: feedbackVideoCandidate.videoUrl,
        source: "user-feedback-regenerate",
        baseArtifactId: baseArtifact.id,
        userDirection,
        assemblerVersion: SHOT_VIDEO_ASSEMBLER_VERSION,
      },
    });
    await traceService.record({
      workspaceId: args.workspaceId,
      shotId: args.shotId,
      traceType: "user_action",
      name: "video_script_regenerated",
      outputPreview: assembled.providerPrompt.slice(0, 200),
      metadata: {
        baseArtifactId: baseArtifact.id,
        newArtifactId: artifact.id,
        context: sourceFingerprint,
        frames: {
          firstFrameCandidateId: selectedImage.id,
          lastFrameCandidateId: neighbors.next?.id ?? null,
          firstFrameUrl: selectedImage.imageUrl ?? null,
          lastFrameUrl: neighbors.next?.url ?? null
        },
        feedbackVideoCandidateId: feedbackVideoCandidate.id,
        batchId: enqueued.batch.id,
        requestedCount: count
      }
    });
    return {
      data: artifactView,
      artifact: artifactView,
      batch: enqueued.batch,
      candidates: enqueued.candidates,
      shotStatus: "VIDEO_GENERATING" as const,
      nextAction: getNextAction("VIDEO_GENERATING"),
      traceId,
      context: sourceFingerprint,
      frames: {
        firstFrameCandidateId: selectedImage.id,
        lastFrameCandidateId: neighbors.next?.id ?? null,
        firstFrameUrl: selectedImage.imageUrl ?? null,
        lastFrameUrl: neighbors.next?.url ?? null
      },
      poll: {
        videoRoundsUrl: `/api/workspaces/${args.workspaceId}/shots/${args.shotId}/video-rounds`,
        batchId: enqueued.batch.id
      }
    };
  },

  async listVideoScripts(shotId: string) {
    await getEditableShotOrThrow(shotId);
    return { data: await db.db2.listVideoScriptArtifacts(shotId) };
  },

  async selectVideo(args: {
    workspaceId: string;
    shotId: string;
    videoCandidateId: string;
    videoGenerationBatchId?: string;
    selectedBy?: string;
  }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    await assertShotInActiveShotSet(args.workspaceId, args.shotId);
    const candidate = await db.db2.getVideoCandidate(args.videoCandidateId);
    if (candidate.shotId !== args.shotId || candidate.workspaceId !== shot.workspaceId) {
      throw new HttpError(
        400,
        "INVALID_CANDIDATE",
        "Candidate does not belong to this shot"
      );
    }
    if (candidate.status !== "SUCCEEDED" || !candidate.videoUrl) {
      throw new HttpError(
        400,
        "CANNOT_SELECT_FAILED_CANDIDATE",
        "Only succeeded video candidates can be selected"
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
    await db.db2.upsertSelectedVideo({
      shotId: args.shotId,
      videoCandidateId: args.videoCandidateId,
      videoGenerationBatchId: candidate.batchId,
      selectedBy: args.selectedBy ?? "user"
    });
    await db.db2.updateShot(args.shotId, {
      status: "VIDEO_SELECTED",
      selectedVideoId: args.videoCandidateId
    });
    await traceService.record({
      workspaceId: shot.workspaceId,
      shotId: args.shotId,
      traceType: "user_action",
      name: "video_candidate_selected",
      outputPreview: candidate.videoUrl,
      metadata: {
        videoCandidateId: args.videoCandidateId,
        videoGenerationBatchId: candidate.batchId,
        selectedBy: args.selectedBy ?? "user"
      }
    });
    const selection = {
      shotId: args.shotId,
      selectedCandidateId: args.videoCandidateId,
      selectedVideoUrl: candidate.videoUrl,
      duration: shot.defaultDurationSec ?? candidate.durationSec ?? 0,
      allShotsVideoSelected: await allVideosSelected(shot.workspaceId)
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
    await assertShotInActiveShotSet(args.workspaceId, args.shotId);
    const [artifacts, selected, hydrated] = await Promise.all([
      db.db2.listImagePromptArtifacts(args.shotId),
      db.db2.getSelectedImage(args.shotId),
      hydratePromptContext({ workspaceId: args.workspaceId, shot, kind: "image" })
    ]);
    const currentSelectedCandidate = selected
      ? await getImageCandidateMaybe(selected.imageCandidateId)
      : null;
    const rounds = await Promise.all(
      artifacts.map(async (artifact) => {
        const batchId = await latestBatchIdForArtifact(
          "image_generation_batches",
          "image_prompt_artifact_id",
          artifact.id
        );
        const batch = batchId ? await db.db2.getImageBatch(batchId) : null;
        const candidates = batch ? await db.db2.listImageCandidatesByBatch(batch.id) : [];
        const selectedCandidate =
          (selected
            ? candidates.find((candidate) => candidate.id === selected.imageCandidateId)
            : undefined) ?? currentSelectedCandidate;
        const selection = selectedCandidate?.imageUrl
          ? {
              shotId: args.shotId,
              selectedCandidateId: selectedCandidate.id,
              selectedImageUrl: selectedCandidate.imageUrl,
              nextShotId: await nextShotId(args.workspaceId, args.shotId),
              allShotsImageSelected: await allImagesSelected(args.workspaceId)
            }
          : null;
        const promptJson = artifact.promptJson as { context?: unknown } | null;
        const upstream = compareSourceFingerprint(
          artifact.sourceFingerprint,
          currentImagePromptSources(hydrated)
        );
        return {
          artifact,
          batch,
          candidates,
          selection,
          upstream,
          context: promptJson?.context ?? hydrated.summary
        };
      })
    );
    return { data: rounds };
  },

  async listVideoRounds(args: { workspaceId: string; shotId: string }) {
    const shot = await db.db2.getShot(args.shotId);
    assertShotInWorkspace(shot, args.workspaceId);
    await assertShotInActiveShotSet(args.workspaceId, args.shotId);
    const [artifacts, selected, hydrated] = await Promise.all([
      db.db2.listVideoScriptArtifacts(args.shotId),
      selectedVideoForShot(args.shotId),
      hydratePromptContext({ workspaceId: args.workspaceId, shot, kind: "video" })
    ]);
    const rounds = await Promise.all(
      artifacts.map(async (artifact) => {
        const batchId = await latestBatchIdForArtifact(
          "video_generation_batches",
          "video_script_artifact_id",
          artifact.id
        );
        const batch = batchId ? await db.db2.getVideoBatch(batchId) : null;
        const candidates = batch ? await db.db2.listVideoCandidatesByBatch(batch.id) : [];
        const candidateViews = candidates.map(videoCandidateView);
        const selectedCandidate = selected
          ? candidates.find((candidate) => candidate.id === selected.videoCandidateId)
          : undefined;
        const selection = selectedCandidate?.videoUrl
          ? {
              shotId: args.shotId,
              selectedCandidateId: selectedCandidate.id,
              selectedVideoUrl: selectedCandidate.videoUrl,
              duration: shot.defaultDurationSec ?? selectedCandidate.durationSec ?? 0,
              allShotsVideoSelected: await allVideosSelected(args.workspaceId)
            }
          : null;
        const [firstFrame, lastFrame] = await Promise.all([
          getImageCandidateMaybe(artifact.basedOnImageCandidateId),
          getImageCandidateMaybe(artifact.basedOnNextImageCandidateId)
        ]);
        const scriptJson = artifact.scriptJson as { context?: unknown } | null;
        const upstream = compareSourceFingerprint(
          artifact.sourceFingerprint,
          currentVideoScriptSources(hydrated)
        );
        return {
          artifact,
          batch,
          candidates: candidateViews,
          selection,
          frames: {
            firstFrameUrl: firstFrame?.imageUrl ?? null,
            lastFrameUrl: lastFrame?.imageUrl ?? null,
            firstFrameCandidateId: firstFrame?.id ?? artifact.basedOnImageCandidateId,
            lastFrameCandidateId: lastFrame?.id ?? null
          },
          upstream,
          context: scriptJson?.context ?? hydrated.summary
        };
      })
    );
    return { data: rounds };
  },

  async retry(args: {
    shotId: string;
    what: "image_batch" | "video_batch";
    idempotencyKey: string;
  }) {
    const shot = await getEditableShotOrThrow(args.shotId);
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
