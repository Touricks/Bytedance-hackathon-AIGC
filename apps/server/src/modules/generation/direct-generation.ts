import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  generateImagesWithArk,
  generateVideoWithSeedance,
  isRealProviderMode,
  resolveImageProviderConfig,
  resolveVideoProviderConfig,
  type ArkImageResult,
  type SeedanceVideoResult,
} from "@aigc-video/ai";
import { db } from "../../db/client.js";
import { resolveAssetUrls } from "../material/asset-url-resolver.js";
import {
  recordProviderCallTrace,
  type ProviderCallTraceContext,
} from "../trace/provider-call-trace.js";
import { traceService } from "../trace/trace.service.js";
import { getWorkspaceStorageAdapter } from "../workspace/storage/workspace-storage-resolver.js";
import {
  persistGeneratedAsset,
  type GeneratedAssetPersister,
} from "./generated-asset-storage.js";
import { buildSeedanceVoiceProfilePrompt } from "./voice-profile.js";

type Adapter = typeof db.db2;

type ImageProvider = (args: {
  prompt: string;
  negativePrompt?: string | null;
  referenceImageUrls?: string[];
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
}) => Promise<ArkImageResult>;

type ReferenceImageSource =
  | "data_url"
  | "workspace_stable"
  | "https_provider_tos"
  | "public_https"
  | "asset_id"
  | "other";

type VideoProvider = (args: {
  imageUrl: string;
  lastFrameUrl?: string | null;
  prompt: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  generateAudio: boolean;
}) => Promise<SeedanceVideoResult>;

let imageProviderOverride: ImageProvider | undefined;
export function __setImageProviderForTests(p: ImageProvider | undefined) {
  imageProviderOverride = p;
}

let videoProviderOverride: VideoProvider | undefined;
export function __setVideoProviderForTests(p: VideoProvider | undefined) {
  videoProviderOverride = p;
}

let resolveAssetUrlsOverride: ((ids: string[]) => Promise<string[]>) | undefined;
export function __setAssetUrlResolverForTests(fn: ((ids: string[]) => Promise<string[]>) | undefined) {
  resolveAssetUrlsOverride = fn;
}

let generatedAssetPersisterOverride: GeneratedAssetPersister | undefined;
export function __setGeneratedAssetPersisterForTests(
  fn: GeneratedAssetPersister | undefined,
) {
  generatedAssetPersisterOverride = fn;
}

function errorMessage(error: unknown) {
  return String((error as Error).message ?? error);
}

function elapsedSince(startedAt: number | null) {
  return startedAt === null ? null : Math.max(0, Date.now() - startedAt);
}

async function recordImageProviderTrace(input: {
  trace?: ProviderCallTraceContext;
  batchId: string;
  candidateId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: "succeeded" | "failed";
  prompt: string;
  negativePrompt?: string | null;
  requestedCount: number;
  generatedCount: number;
  latencyMs?: number | null;
  error?: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  referenceImageCount: number;
  referenceImageSources?: string[] | null;
  stableUrl?: string | null;
  providerTemporaryUrl?: string | null;
}) {
  if (!input.trace) return;
  await recordProviderCallTrace({
    ...input.trace,
    batchId: input.batchId,
    candidateId: input.candidateId ?? null,
    mediaType: "image",
    provider: input.provider ?? "ark-seedream",
    model: input.model ?? null,
    status: input.status,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt ?? null,
    requestedCount: input.requestedCount,
    generatedCount: input.generatedCount,
    latencyMs: input.latencyMs ?? null,
    error: input.error,
    aspectRatio: input.aspectRatio,
    referenceImageCount: input.referenceImageCount,
    referenceImageSources: input.referenceImageSources ?? null,
    stableUrl: input.stableUrl ?? null,
    providerTemporaryUrl: input.providerTemporaryUrl ?? null,
  });
}

async function recordVideoProviderTrace(input: {
  trace?: ProviderCallTraceContext;
  batchId: string;
  candidateId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: "succeeded" | "failed";
  prompt: string;
  requestedCount: number;
  generatedCount: number;
  latencyMs?: number | null;
  error?: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  durationSec: number;
  generateAudio: boolean;
  firstFrameUrl: string;
  lastFrameUrl?: string | null;
  stableUrl?: string | null;
  providerTemporaryUrl?: string | null;
  providerTaskId?: string | null;
}) {
  if (!input.trace) return;
  await recordProviderCallTrace({
    ...input.trace,
    batchId: input.batchId,
    candidateId: input.candidateId ?? null,
    mediaType: "video",
    provider: input.provider ?? "seedance",
    model: input.model ?? null,
    status: input.status,
    prompt: input.prompt,
    requestedCount: input.requestedCount,
    generatedCount: input.generatedCount,
    latencyMs: input.latencyMs ?? null,
    error: input.error,
    aspectRatio: input.aspectRatio,
    durationSec: input.durationSec,
    generateAudio: input.generateAudio,
    firstFrameUrl: input.firstFrameUrl,
    lastFrameUrl: input.lastFrameUrl ?? null,
    stableUrl: input.stableUrl ?? null,
    providerTemporaryUrl: input.providerTemporaryUrl ?? null,
    providerTaskId: input.providerTaskId ?? null,
  });
}

async function recordVideoAssetPersistTrace(input: {
  trace?: ProviderCallTraceContext;
  name: "asset_persist_started" | "asset_persist_completed" | "asset_persist_failed";
  batchId: string;
  candidateId: string;
  providerTaskId?: string | null;
  providerTemporaryUrl?: string | null;
  stableUrl?: string | null;
  objectKey?: string | null;
  bytes?: number | null;
  latencyMs?: number | null;
  error?: string;
}) {
  if (!input.trace) return;
  await traceService.record({
    workspaceId: input.trace.workspaceId,
    shotId: input.trace.shotId,
    traceType: "job_event",
    name: input.name,
    metadata: {
      jobId: input.trace.jobId,
      batchId: input.batchId,
      candidateId: input.candidateId,
      attempt: input.trace.attempt,
      maxAttempts: input.trace.maxAttempts,
      providerTaskId: input.providerTaskId ?? null,
      providerTemporaryUrl: input.providerTemporaryUrl ?? null,
      stableUrl: input.stableUrl ?? null,
      objectKey: input.objectKey ?? null,
      bytes: input.bytes ?? null,
      latencyMs: input.latencyMs ?? null,
      error: input.error,
    },
  });
}

const mockImageDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAUklEQVR42u3PMQ0AAAgDMIRNCYqRhQQuviY10JrkVXpelYCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAZQHIEvEtQ7Jm2gAAAABJRU5ErkJggg==";

function mockImageResult(count: number): ArkImageResult {
  return {
    provider: "ark-seedream",
    model: "mock-seedream",
    created: Math.floor(Date.now() / 1000),
    candidates: Array.from({ length: count }, () => ({
      imageUrl: mockImageDataUrl,
      size: "64x64",
    })),
    candidateErrors: [],
    usage: {
      generatedImages: count,
      outputTokens: 0,
      totalTokens: 0,
    },
  };
}

function imageContentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/png";
}

function classifyReferenceImageSource(url: string): ReferenceImageSource {
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return "data_url";
  if (url.startsWith("asset://")) return "asset_id";
  if (url.startsWith("/api/workspaces/")) return "workspace_stable";
  if (/^https?:\/\//i.test(url)) {
    try {
      const host = new URL(url).host.toLowerCase();
      return /tos|volc|byte|ark|seedream|provider/.test(host)
        ? "https_provider_tos"
        : "public_https";
    } catch {
      return "public_https";
    }
  }
  return "other";
}

function workspaceMaterialRelativePath(workspaceId: string, url: string) {
  const match = new RegExp(
    `^/api/workspaces/${workspaceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/materials/(.+)$`,
  ).exec(url);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    if (decoded.startsWith("/") || decoded.includes("..")) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function prepareImageReferenceUrlsForProvider(input: {
  workspaceId: string;
  urls: string[];
  resolveWorkspaceLocalPath?: (workspaceId: string) => Promise<string>;
  readFile?: (filePath: string) => Promise<Buffer>;
}) {
  const sources = input.urls.map(classifyReferenceImageSource);
  let adapter: Awaited<ReturnType<typeof getWorkspaceStorageAdapter>> | null = null;
  const urls: string[] = [];
  for (const url of input.urls) {
    const relativePath = workspaceMaterialRelativePath(input.workspaceId, url);
    if (!relativePath) {
      urls.push(url);
      continue;
    }
    let bytes: Buffer;
    if (input.resolveWorkspaceLocalPath || input.readFile) {
      if (!input.resolveWorkspaceLocalPath) {
        throw new Error("WORKSPACE_IMAGE_REFERENCE_TEST_OVERRIDES_INCOMPLETE");
      }
      const workspaceLocalPath = await input.resolveWorkspaceLocalPath(
        input.workspaceId,
      );
      const materialRoot = path.resolve(workspaceLocalPath, ".daireel", "materials");
      const filePath = path.resolve(materialRoot, relativePath);
      if (!filePath.startsWith(materialRoot + path.sep)) {
        throw new Error("WORKSPACE_IMAGE_REFERENCE_OUTSIDE_STORAGE");
      }
      bytes = await (input.readFile ?? readFile)(filePath);
    } else {
      adapter ??= await getWorkspaceStorageAdapter(input.workspaceId);
      bytes = await adapter!.readObject(`materials/${relativePath}`);
    }
    urls.push(
      `data:${imageContentTypeForPath(relativePath)};base64,${bytes.toString("base64")}`,
    );
  }
  return { urls, sources };
}

async function defaultImageProvider(args: Parameters<ImageProvider>[0]): Promise<ArkImageResult> {
  if (!isRealProviderMode()) {
    return mockImageResult(args.count);
  }
  const cfg = resolveImageProviderConfig();
  if (!cfg) throw new Error("IMAGE provider not configured");
  return generateImagesWithArk(
    {
      prompt: args.prompt,
      negativePrompt: args.negativePrompt ?? undefined,
      referenceImageUrls: args.referenceImageUrls,
      count: args.count,
      aspectRatio: args.aspectRatio,
      watermark: false,
    },
    cfg,
  );
}

async function defaultVideoProvider(args: Parameters<VideoProvider>[0]): Promise<SeedanceVideoResult> {
  if (!isRealProviderMode()) {
    return {
      videoUrl: "data:video/mp4;base64,AAAA",
      provider: "mock",
      model: "mock-seedance",
      prompt: args.prompt,
      taskId: `mock-task-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: Math.floor(Date.now() / 1000),
    };
  }
  const cfg = resolveVideoProviderConfig();
  if (!cfg) throw new Error("VIDEO provider not configured");
  return generateVideoWithSeedance(
    {
      imageUrl: args.imageUrl,
      lastFrameUrl: args.lastFrameUrl ?? undefined,
      prompt: args.prompt,
      durationSec: args.durationSec,
      aspectRatio: args.aspectRatio,
      generateAudio: args.generateAudio,
    },
    { apiKey: cfg.apiKey, model: cfg.endpointId, baseURL: cfg.baseURL },
  );
}

export async function runImageGenerationBatch(input: {
  batchId: string;
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  referenceImageUrls?: string[];
  referenceImageUrlsAfterAssets?: string[];
  providerTrace?: ProviderCallTraceContext;
  adapter?: Adapter;
}) {
  const adapter = input.adapter ?? db.db2;
  const batch = await adapter.getImageBatch(input.batchId);
  if (batch.status !== "PENDING" && batch.status !== "RUNNING") {
    const candidates = await adapter.listImageCandidatesByBatch(batch.id);
    return { batch, finalBatch: batch, candidates, result: null };
  }

  await adapter.updateImageBatch(batch.id, { status: "RUNNING" });
  const artifact = await adapter.getImagePromptArtifact(batch.imagePromptArtifactId);
  const resolver = resolveAssetUrlsOverride ?? resolveAssetUrls;
  const assetReferenceUrls = await resolver(artifact.referenceAssetIds);
  const rawReferenceImageUrls = [
    ...(input.referenceImageUrls ?? []),
    ...assetReferenceUrls,
    ...(input.referenceImageUrlsAfterAssets ?? []),
  ].filter((url, index, all) => url && all.indexOf(url) === index);
  const preparedReferences = await prepareImageReferenceUrlsForProvider({
    workspaceId: batch.workspaceId,
    urls: rawReferenceImageUrls,
  });
  const referenceImageUrls = preparedReferences.urls;
  const referenceImageSources = preparedReferences.sources;

  let result: ArkImageResult;
  let providerStartedAt: number | null = null;
  let latencyMs: number | null = null;
  try {
    providerStartedAt = Date.now();
    result = await (imageProviderOverride ?? defaultImageProvider)({
      prompt: artifact.promptText,
      negativePrompt: artifact.negativePrompt ?? undefined,
      referenceImageUrls,
      count: input.count,
      aspectRatio: input.aspectRatio,
    });
    latencyMs = elapsedSince(providerStartedAt);
  } catch (err) {
    const msg = errorMessage(err);
    await recordImageProviderTrace({
      trace: input.providerTrace,
      batchId: batch.id,
      provider: "ark-seedream",
      model: null,
      status: "failed",
      prompt: artifact.promptText,
      negativePrompt: artifact.negativePrompt,
      requestedCount: input.count,
      generatedCount: 0,
      latencyMs: elapsedSince(providerStartedAt),
      error: msg,
      aspectRatio: input.aspectRatio,
      referenceImageCount: referenceImageUrls.length,
      referenceImageSources,
    });
    const failedBatch = await adapter.updateImageBatch(batch.id, {
      status: "FAILED",
      errorMessage: msg,
    });
    throw Object.assign(err instanceof Error ? err : new Error(msg), {
      batch: failedBatch,
    });
  }

  const inserted = [];
  for (const c of result.candidates) {
    const candidateId = "imc_" + Math.random().toString(36).slice(2, 12);
    const persisted = await (generatedAssetPersisterOverride ?? persistGeneratedAsset)({
      workspaceId: batch.workspaceId,
      sourceUrl: c.imageUrl,
      kind: "image",
      batchId: batch.id,
      candidateId,
    });
    inserted.push(
      await adapter.insertImageCandidate({
        id: candidateId,
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        imageUrl: persisted.stableUrl,
        objectKey: persisted.objectKey ?? c.objectKey ?? null,
        width: null,
        height: null,
        seed: c.seed ?? null,
        provider: result.provider,
        providerResponse: {
          ...c,
          providerTemporaryUrl: persisted.providerTemporaryUrl,
        },
        status: "SUCCEEDED",
        errorMessage: null,
      }),
    );
  }
  for (let i = result.candidates.length; i < input.count; i++) {
    inserted.push(
      await adapter.insertImageCandidate({
        id: "imc_" + Math.random().toString(36).slice(2, 12),
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        imageUrl: null,
        objectKey: null,
        width: null,
        height: null,
        seed: null,
        provider: result.provider,
        providerResponse: {},
        status: "FAILED",
        errorMessage: "provider_returned_short",
      }),
    );
  }

  const finalStatus =
    result.candidates.length === input.count
      ? "SUCCEEDED"
      : result.candidates.length > 0
        ? "PARTIAL"
        : "FAILED";
  const finalBatch = await adapter.updateImageBatch(batch.id, {
    status: finalStatus,
    succeededCount: result.candidates.length,
    failedCount: input.count - result.candidates.length,
  });
  const firstSucceeded = inserted.find((candidate) => candidate.status === "SUCCEEDED");
  const firstProviderCandidate = result.candidates[0];
  await recordImageProviderTrace({
    trace: input.providerTrace,
    batchId: batch.id,
    provider: result.provider,
    model: result.model,
    status: result.candidates.length > 0 ? "succeeded" : "failed",
    prompt: artifact.promptText,
    negativePrompt: artifact.negativePrompt,
    requestedCount: input.count,
    generatedCount: result.candidates.length,
    latencyMs,
    error: result.candidates.length > 0 ? undefined : "provider_returned_short",
    aspectRatio: input.aspectRatio,
    referenceImageCount: referenceImageUrls.length,
    referenceImageSources,
    stableUrl: firstSucceeded?.imageUrl ?? null,
    providerTemporaryUrl:
      (firstSucceeded?.providerResponse as { providerTemporaryUrl?: string } | null)
        ?.providerTemporaryUrl ??
      firstProviderCandidate?.imageUrl ??
      null,
  });

  return { batch, finalBatch, candidates: inserted, result };
}

export async function runImageGenerationCandidate(input: {
  batchId: string;
  candidateId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  referenceImageUrls?: string[];
  referenceImageUrlsAfterAssets?: string[];
  failCandidateOnError?: boolean;
  providerTrace?: ProviderCallTraceContext;
  adapter?: Adapter;
}) {
  const adapter = input.adapter ?? db.db2;
  const batch = await adapter.getImageBatch(input.batchId);
  const candidate = await adapter.getImageCandidate(input.candidateId);
  if (candidate.status !== "PENDING" && candidate.status !== "RUNNING") {
    return { batch, candidate, result: null };
  }

  await adapter.updateImageCandidate(candidate.id, { status: "RUNNING" });
  const artifact = await adapter.getImagePromptArtifact(batch.imagePromptArtifactId);
  const resolver = resolveAssetUrlsOverride ?? resolveAssetUrls;
  const assetReferenceUrls = await resolver(artifact.referenceAssetIds);
  const rawReferenceImageUrls = [
    ...(input.referenceImageUrls ?? []),
    ...assetReferenceUrls,
    ...(input.referenceImageUrlsAfterAssets ?? []),
  ].filter((url, index, all) => url && all.indexOf(url) === index);
  const preparedReferences = await prepareImageReferenceUrlsForProvider({
    workspaceId: batch.workspaceId,
    urls: rawReferenceImageUrls,
  });
  const referenceImageUrls = preparedReferences.urls;
  const referenceImageSources = preparedReferences.sources;

  let result: ArkImageResult | undefined;
  let generated: ArkImageResult["candidates"][number] | undefined;
  let providerTraceWritten = false;
  let providerStartedAt: number | null = null;
  let latencyMs: number | null = null;
  try {
    providerStartedAt = Date.now();
    result = await (imageProviderOverride ?? defaultImageProvider)({
      prompt: artifact.promptText,
      negativePrompt: artifact.negativePrompt ?? undefined,
      referenceImageUrls,
      count: 1,
      aspectRatio: input.aspectRatio,
    });
    latencyMs = elapsedSince(providerStartedAt);
    generated = result.candidates[0];
    if (!generated) {
      const providerMessage =
        result.candidateErrors?.[0]?.message ??
        result.candidateErrors?.[0]?.code ??
        "provider_returned_short";
      await recordImageProviderTrace({
        trace: input.providerTrace,
        batchId: batch.id,
        candidateId: candidate.id,
        provider: result.provider,
        model: result.model,
        status: "failed",
        prompt: artifact.promptText,
        negativePrompt: artifact.negativePrompt,
        requestedCount: 1,
        generatedCount: 0,
        latencyMs,
        error: providerMessage,
        aspectRatio: input.aspectRatio,
        referenceImageCount: referenceImageUrls.length,
        referenceImageSources,
      });
      providerTraceWritten = true;
      throw new Error(providerMessage);
    }

    const persisted = await (generatedAssetPersisterOverride ?? persistGeneratedAsset)({
      workspaceId: batch.workspaceId,
      sourceUrl: generated.imageUrl,
      kind: "image",
      batchId: batch.id,
      candidateId: candidate.id,
    });
    const updated = await adapter.updateImageCandidate(candidate.id, {
      imageUrl: persisted.stableUrl,
      objectKey: persisted.objectKey ?? generated.objectKey ?? null,
      seed: generated.seed ?? null,
      provider: result.provider,
      providerResponse: {
        ...generated,
        providerTemporaryUrl: persisted.providerTemporaryUrl,
      },
      status: "SUCCEEDED",
      errorMessage: null,
    });
    await recordImageProviderTrace({
      trace: input.providerTrace,
      batchId: batch.id,
      candidateId: candidate.id,
      provider: result.provider,
      model: result.model,
      status: "succeeded",
      prompt: artifact.promptText,
      negativePrompt: artifact.negativePrompt,
      requestedCount: 1,
      generatedCount: 1,
      latencyMs,
      aspectRatio: input.aspectRatio,
      referenceImageCount: referenceImageUrls.length,
      referenceImageSources,
      stableUrl: persisted.stableUrl,
      providerTemporaryUrl: persisted.providerTemporaryUrl ?? generated.imageUrl,
    });
    providerTraceWritten = true;
    return { batch, candidate: updated, result };
  } catch (err) {
    const msg = errorMessage(err);
    if (!providerTraceWritten) {
      const providerSucceeded = Boolean(generated);
      await recordImageProviderTrace({
        trace: input.providerTrace,
        batchId: batch.id,
        candidateId: candidate.id,
        provider: result?.provider ?? "ark-seedream",
        model: result?.model ?? null,
        status: providerSucceeded ? "succeeded" : "failed",
        prompt: artifact.promptText,
        negativePrompt: artifact.negativePrompt,
        requestedCount: 1,
        generatedCount: providerSucceeded ? 1 : 0,
        latencyMs: latencyMs ?? elapsedSince(providerStartedAt),
        error: providerSucceeded ? undefined : msg,
        aspectRatio: input.aspectRatio,
        referenceImageCount: referenceImageUrls.length,
        referenceImageSources,
        providerTemporaryUrl: generated?.imageUrl ?? null,
      });
      providerTraceWritten = true;
    }
    const failed = input.failCandidateOnError === false
      ? candidate
      : await adapter.updateImageCandidate(candidate.id, {
          status: "FAILED",
          errorMessage: msg,
        });
    throw Object.assign(err instanceof Error ? err : new Error(msg), {
      batch,
      candidate: failed,
    });
  }
}

function providerTemporaryUrl(row: { providerResponse: unknown; imageUrl?: string | null }) {
  const response = row.providerResponse as Record<string, unknown> | null;
  return typeof response?.providerTemporaryUrl === "string"
    ? response.providerTemporaryUrl
    : row.imageUrl ?? null;
}

function providerReadyAt(result: { createdAt?: number | null }) {
  if (typeof result.createdAt !== "number" || !Number.isFinite(result.createdAt)) {
    return new Date().toISOString();
  }
  const timestampMs =
    result.createdAt < 10_000_000_000 ? result.createdAt * 1000 : result.createdAt;
  return new Date(timestampMs).toISOString();
}

function videoProviderReadyResponse(row: {
  provider?: string | null;
  providerResponse: unknown;
}) {
  const response =
    row.providerResponse && typeof row.providerResponse === "object"
      ? (row.providerResponse as Record<string, unknown>)
      : {};
  const videoUrl =
    typeof response.providerTemporaryUrl === "string"
      ? response.providerTemporaryUrl
      : typeof response.videoUrl === "string"
        ? response.videoUrl
        : null;
  if (!videoUrl) {
    throw new Error("MISSING_PROVIDER_TEMPORARY_URL");
  }
  const provider =
    response.provider === "mock" || response.provider === "seedance"
      ? response.provider
      : row.provider === "mock" || row.provider === "seedance"
        ? row.provider
        : "seedance";
  const result: SeedanceVideoResult = {
    videoUrl,
    provider,
    model: typeof response.model === "string" ? response.model : "",
    prompt: typeof response.prompt === "string" ? response.prompt : "",
    taskId: typeof response.taskId === "string" ? response.taskId : undefined,
    createdAt:
      typeof response.createdAt === "number" && Number.isFinite(response.createdAt)
        ? response.createdAt
        : undefined,
  };
  return {
    result,
    response: {
      ...response,
      videoUrl,
      providerTemporaryUrl: videoUrl,
      providerReadyAt:
        typeof response.providerReadyAt === "string"
          ? response.providerReadyAt
          : providerReadyAt(result),
    },
  };
}

function videoScriptVoiceover(scriptJson: unknown) {
  if (!scriptJson || typeof scriptJson !== "object") return "";
  const value = (scriptJson as { voiceover?: unknown }).voiceover;
  return typeof value === "string" ? value.trim() : "";
}

function videoScriptVoiceProfile(scriptJson: unknown) {
  if (!scriptJson || typeof scriptJson !== "object") return undefined;
  const context = (scriptJson as { context?: unknown }).context;
  if (!context || typeof context !== "object") return undefined;
  return (context as { voiceProfile?: unknown }).voiceProfile;
}

export function buildSeedanceShotVideoPrompt(input: {
  providerPrompt: string;
  scriptJson: unknown;
  voiceProfile?: unknown;
}) {
  const basePrompt = input.providerPrompt.trim();
  const voiceover = videoScriptVoiceover(input.scriptJson);
  if (!voiceover) return basePrompt;
  return [
    basePrompt,
    [
      "音频/旁白要求：generate_audio=true。",
      buildSeedanceVoiceProfilePrompt(
        input.voiceProfile ?? videoScriptVoiceProfile(input.scriptJson),
      ),
      `口播文案：“${voiceover}”`,
      "旁白只通过音频生成；禁止将口播文案、旁白文字或其改写复制、叠加、渲染到视频画面内。不要生成字幕样式、标题贴片或乱码文字。",
    ].join(" "),
  ].join("\n\n");
}

export async function runVideoGenerationCandidate(input: {
  batchId: string;
  candidateId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  failCandidateOnError?: boolean;
  providerTrace?: ProviderCallTraceContext;
  adapter?: Adapter;
}) {
  const adapter = input.adapter ?? db.db2;
  const batch = await adapter.getVideoBatch(input.batchId);
  const candidate = await adapter.getVideoCandidate(input.candidateId);
  const isResumingPersist = candidate.status === "PERSISTING";
  if (
    candidate.status !== "PENDING" &&
    candidate.status !== "RUNNING" &&
    !isResumingPersist
  ) {
    return { batch, candidate, result: null };
  }

  if (!isResumingPersist) {
    await adapter.updateVideoCandidate(candidate.id, { status: "RUNNING" });
  }
  const script = await adapter.getVideoScriptArtifact(batch.videoScriptArtifactId);
  if (script.status !== "ACTIVE") {
    const failed =
      input.failCandidateOnError === false
        ? candidate
        : await adapter.updateVideoCandidate(candidate.id, {
            status: "FAILED",
            errorMessage: "STALE_SCRIPT",
          });
    throw Object.assign(new Error("STALE_SCRIPT"), { batch, candidate: failed });
  }

  const startImage = await adapter.getImageCandidate(script.basedOnImageCandidateId);
  const firstFrameUrl = providerTemporaryUrl(startImage);
  if (!firstFrameUrl) throw new Error("MISSING_START_IMAGE_URL");
  const endImage = script.basedOnNextImageCandidateId
    ? await adapter.getImageCandidate(script.basedOnNextImageCandidateId)
    : null;
  const lastFrameUrl = endImage ? providerTemporaryUrl(endImage) : null;
  if (script.basedOnNextImageCandidateId && !lastFrameUrl) {
    throw new Error("MISSING_LAST_FRAME_URL");
  }

  const provider = videoProviderOverride ?? defaultVideoProvider;
  const prompt = buildSeedanceShotVideoPrompt({
    providerPrompt: script.providerPrompt,
    scriptJson: script.scriptJson,
  });
  let result: SeedanceVideoResult | undefined;
  let providerTraceWritten = false;
  let providerStartedAt: number | null = null;
  let latencyMs: number | null = null;
  let assetPersistStartedAt: number | null = null;
  try {
    let providerReadyResponse: Record<string, unknown>;
    if (isResumingPersist) {
      const restored = videoProviderReadyResponse(candidate);
      result = restored.result;
      providerReadyResponse = restored.response;
    } else {
      providerStartedAt = Date.now();
      result = await provider({
        imageUrl: firstFrameUrl,
        lastFrameUrl,
        prompt,
        durationSec: script.durationSec,
        aspectRatio: input.aspectRatio,
        generateAudio: true,
      });
      latencyMs = elapsedSince(providerStartedAt);
      providerReadyResponse = {
        ...result,
        providerTemporaryUrl: result.videoUrl,
        providerReadyAt: providerReadyAt(result),
      };
      await adapter.updateVideoCandidate(candidate.id, {
        videoUrl: null,
        objectKey: null,
        durationSec: script.durationSec,
        provider: result.provider,
        providerResponse: providerReadyResponse,
        status: "PERSISTING" as any,
        errorMessage: null,
      });
      await recordVideoProviderTrace({
        trace: input.providerTrace,
        batchId: batch.id,
        candidateId: candidate.id,
        provider: result.provider,
        model: result.model,
        status: "succeeded",
        prompt,
        requestedCount: 1,
        generatedCount: 1,
        latencyMs,
        aspectRatio: input.aspectRatio,
        durationSec: script.durationSec,
        generateAudio: true,
        firstFrameUrl,
        lastFrameUrl,
        stableUrl: null,
        providerTemporaryUrl: result.videoUrl,
        providerTaskId: result.taskId ?? null,
      });
      providerTraceWritten = true;
    }
    await recordVideoAssetPersistTrace({
      trace: input.providerTrace,
      name: "asset_persist_started",
      batchId: batch.id,
      candidateId: candidate.id,
      providerTaskId: result.taskId ?? null,
      providerTemporaryUrl: result.videoUrl,
    });
    assetPersistStartedAt = Date.now();
    const persisted = await (generatedAssetPersisterOverride ?? persistGeneratedAsset)({
      workspaceId: batch.workspaceId,
      sourceUrl: result.videoUrl,
      kind: "video",
      batchId: batch.id,
      candidateId: candidate.id,
    });
    const persistedProviderTemporaryUrl =
      persisted.providerTemporaryUrl ??
      (typeof providerReadyResponse.providerTemporaryUrl === "string"
        ? providerReadyResponse.providerTemporaryUrl
        : null);
    const updated = await adapter.updateVideoCandidate(candidate.id, {
      videoUrl: persisted.stableUrl,
      objectKey: persisted.objectKey,
      durationSec: script.durationSec,
      provider: result.provider,
      providerResponse: {
        ...providerReadyResponse,
        providerTemporaryUrl: persistedProviderTemporaryUrl,
      },
      status: "SUCCEEDED",
      errorMessage: null,
    });
    await recordVideoAssetPersistTrace({
      trace: input.providerTrace,
      name: "asset_persist_completed",
      batchId: batch.id,
      candidateId: candidate.id,
      providerTaskId: result.taskId ?? null,
      providerTemporaryUrl: persistedProviderTemporaryUrl,
      stableUrl: persisted.stableUrl,
      objectKey: persisted.objectKey,
      bytes: persisted.bytes ?? null,
      latencyMs: elapsedSince(assetPersistStartedAt),
    });
    return { batch, candidate: updated, result };
  } catch (err) {
    const msg = errorMessage(err);
    if (result?.videoUrl) {
      await recordVideoAssetPersistTrace({
        trace: input.providerTrace,
        name: "asset_persist_failed",
        batchId: batch.id,
        candidateId: candidate.id,
        providerTaskId: result.taskId ?? null,
        providerTemporaryUrl: result.videoUrl,
        latencyMs: elapsedSince(assetPersistStartedAt),
        error: msg,
      });
    }
    if (!providerTraceWritten && !isResumingPersist) {
      const providerSucceeded = Boolean(result?.videoUrl);
      await recordVideoProviderTrace({
        trace: input.providerTrace,
        batchId: batch.id,
        candidateId: candidate.id,
        provider: result?.provider ?? "seedance",
        model: result?.model ?? null,
        status: providerSucceeded ? "succeeded" : "failed",
        prompt,
        requestedCount: 1,
        generatedCount: providerSucceeded ? 1 : 0,
        latencyMs: latencyMs ?? elapsedSince(providerStartedAt),
        error: providerSucceeded ? undefined : msg,
        aspectRatio: input.aspectRatio,
        durationSec: script.durationSec,
        generateAudio: true,
        firstFrameUrl,
        lastFrameUrl,
        providerTemporaryUrl: result?.videoUrl ?? null,
        providerTaskId: result?.taskId ?? null,
      });
      providerTraceWritten = true;
    }
    const failed =
      input.failCandidateOnError === false
        ? candidate
        : await adapter.updateVideoCandidate(candidate.id, {
            status: "FAILED",
            errorMessage: msg,
          });
    throw Object.assign(err instanceof Error ? err : new Error(msg), {
      batch,
      candidate: failed,
    });
  }
}

export async function runVideoGenerationBatch(input: {
  batchId: string;
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  providerTrace?: ProviderCallTraceContext;
  adapter?: Adapter;
}) {
  const adapter = input.adapter ?? db.db2;
  const batch = await adapter.getVideoBatch(input.batchId);
  if (batch.status !== "PENDING" && batch.status !== "RUNNING") {
    const candidates = await adapter.listVideoCandidatesByBatch(batch.id);
    return { batch, finalBatch: batch, candidates, results: [] as PromiseSettledResult<SeedanceVideoResult>[] };
  }

  await adapter.updateVideoBatch(batch.id, { status: "RUNNING" });
  const script = await adapter.getVideoScriptArtifact(batch.videoScriptArtifactId);
  if (script.status !== "ACTIVE") {
    const failedBatch = await adapter.updateVideoBatch(batch.id, {
      status: "FAILED",
      errorMessage: "STALE_SCRIPT",
    });
    throw Object.assign(new Error("STALE_SCRIPT"), { batch: failedBatch });
  }

  const startImage = await adapter.getImageCandidate(script.basedOnImageCandidateId);
  const firstFrameUrl = providerTemporaryUrl(startImage);
  if (!firstFrameUrl) throw new Error("MISSING_START_IMAGE_URL");
  const endImage = script.basedOnNextImageCandidateId
    ? await adapter.getImageCandidate(script.basedOnNextImageCandidateId)
    : null;
  const lastFrameUrl = endImage ? providerTemporaryUrl(endImage) : null;
  if (script.basedOnNextImageCandidateId && !lastFrameUrl) {
    throw new Error("MISSING_LAST_FRAME_URL");
  }

  const provider = videoProviderOverride ?? defaultVideoProvider;
  const prompt = buildSeedanceShotVideoPrompt({
    providerPrompt: script.providerPrompt,
    scriptJson: script.scriptJson,
  });
  const tasks = Array.from({ length: input.count }, async () => {
    const providerStartedAt = Date.now();
    try {
      const value = await provider({
        imageUrl: firstFrameUrl,
        lastFrameUrl,
        prompt,
        durationSec: script.durationSec,
        aspectRatio: input.aspectRatio,
        generateAudio: true,
      });
      return {
        status: "fulfilled" as const,
        value,
        latencyMs: elapsedSince(providerStartedAt),
      };
    } catch (reason) {
      return {
        status: "rejected" as const,
        reason,
        latencyMs: elapsedSince(providerStartedAt),
      };
    }
  });

  const results = await Promise.all(tasks);
  const inserted = [];
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      succeeded++;
      const candidateId = "vcd_" + Math.random().toString(36).slice(2, 12);
      const persisted = await (generatedAssetPersisterOverride ?? persistGeneratedAsset)({
        workspaceId: batch.workspaceId,
        sourceUrl: r.value.videoUrl,
        kind: "video",
        batchId: batch.id,
        candidateId,
      });
      const insertedCandidate = await adapter.insertVideoCandidate({
        id: candidateId,
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        videoUrl: persisted.stableUrl,
        objectKey: persisted.objectKey,
        thumbnailUrl: null,
        durationSec: script.durationSec,
        width: null,
        height: null,
        provider: r.value.provider,
        providerResponse: {
          ...r.value,
          providerTemporaryUrl: persisted.providerTemporaryUrl,
        },
        status: "SUCCEEDED",
        errorMessage: null,
      });
      inserted.push(insertedCandidate);
      await recordVideoProviderTrace({
        trace: input.providerTrace,
        batchId: batch.id,
        candidateId: insertedCandidate.id,
        provider: r.value.provider,
        model: r.value.model,
        status: "succeeded",
        prompt,
        requestedCount: 1,
        generatedCount: 1,
        latencyMs: r.latencyMs,
        aspectRatio: input.aspectRatio,
        durationSec: script.durationSec,
        generateAudio: true,
        firstFrameUrl,
        lastFrameUrl,
        stableUrl: persisted.stableUrl,
        providerTemporaryUrl: persisted.providerTemporaryUrl ?? r.value.videoUrl,
        providerTaskId: r.value.taskId ?? null,
      });
    } else {
      failed++;
      const msg = errorMessage(r.reason);
      const insertedCandidate = await adapter.insertVideoCandidate({
        id: "vcd_" + Math.random().toString(36).slice(2, 12),
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        videoUrl: null,
        objectKey: null,
        thumbnailUrl: null,
        durationSec: null,
        width: null,
        height: null,
        provider: "seedance",
        providerResponse: {},
        status: "FAILED",
        errorMessage: msg,
      });
      inserted.push(insertedCandidate);
      await recordVideoProviderTrace({
        trace: input.providerTrace,
        batchId: batch.id,
        candidateId: insertedCandidate.id,
        provider: "seedance",
        model: null,
        status: "failed",
        prompt,
        requestedCount: 1,
        generatedCount: 0,
        latencyMs: r.latencyMs,
        error: msg,
        aspectRatio: input.aspectRatio,
        durationSec: script.durationSec,
        generateAudio: true,
        firstFrameUrl,
        lastFrameUrl,
      });
    }
  }

  const finalStatus =
    failed === 0 ? "SUCCEEDED" : succeeded > 0 ? "PARTIAL" : "FAILED";
  const finalBatch = await adapter.updateVideoBatch(batch.id, {
    status: finalStatus,
    succeededCount: succeeded,
    failedCount: failed,
  });
  return {
    batch,
    finalBatch,
    candidates: inserted,
    results: results.map((result) =>
      result.status === "fulfilled"
        ? { status: "fulfilled", value: result.value }
        : { status: "rejected", reason: result.reason }
    ) as PromiseSettledResult<SeedanceVideoResult>[],
  };
}
