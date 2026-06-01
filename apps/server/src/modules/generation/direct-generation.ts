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
  persistGeneratedAsset,
  type GeneratedAssetPersister,
} from "./generated-asset-storage.js";

type Adapter = typeof db.db2;

type ImageProvider = (args: {
  prompt: string;
  negativePrompt?: string | null;
  referenceImageUrls?: string[];
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
}) => Promise<ArkImageResult>;

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
  const referenceImageUrls = [
    ...(input.referenceImageUrls ?? []),
    ...assetReferenceUrls,
  ].filter((url, index, all) => url && all.indexOf(url) === index);

  let result: ArkImageResult;
  try {
    result = await (imageProviderOverride ?? defaultImageProvider)({
      prompt: artifact.promptText,
      negativePrompt: artifact.negativePrompt ?? undefined,
      referenceImageUrls,
      count: input.count,
      aspectRatio: input.aspectRatio,
    });
  } catch (err) {
    const msg = String((err as Error).message ?? err);
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

  return { batch, finalBatch, candidates: inserted, result };
}

export async function runImageGenerationCandidate(input: {
  batchId: string;
  candidateId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  referenceImageUrls?: string[];
  failCandidateOnError?: boolean;
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
  const referenceImageUrls = [
    ...(input.referenceImageUrls ?? []),
    ...assetReferenceUrls,
  ].filter((url, index, all) => url && all.indexOf(url) === index);

  try {
    const result = await (imageProviderOverride ?? defaultImageProvider)({
      prompt: artifact.promptText,
      negativePrompt: artifact.negativePrompt ?? undefined,
      referenceImageUrls,
      count: 1,
      aspectRatio: input.aspectRatio,
    });
    const generated = result.candidates[0];
    if (!generated) {
      const providerMessage =
        result.candidateErrors?.[0]?.message ??
        result.candidateErrors?.[0]?.code ??
        "provider_returned_short";
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
    return { batch, candidate: updated, result };
  } catch (err) {
    const msg = String((err as Error).message ?? err);
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

function videoScriptVoiceover(scriptJson: unknown) {
  if (!scriptJson || typeof scriptJson !== "object") return "";
  const value = (scriptJson as { voiceover?: unknown }).voiceover;
  return typeof value === "string" ? value.trim() : "";
}

export function buildSeedanceShotVideoPrompt(input: {
  providerPrompt: string;
  scriptJson: unknown;
}) {
  const basePrompt = input.providerPrompt.trim();
  const voiceover = videoScriptVoiceover(input.scriptJson);
  if (!voiceover) return basePrompt;
  return [
    basePrompt,
    [
      "音频/旁白要求：generate_audio=true。",
      "请生成自然清晰的中文短视频旁白音频，并完整朗读以下口播。",
      `口播文案：“${voiceover}”`,
      "不要在画面里生成字幕、标题或任何可读文字。",
    ].join(" "),
  ].join("\n\n");
}

export async function runVideoGenerationCandidate(input: {
  batchId: string;
  candidateId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  failCandidateOnError?: boolean;
  adapter?: Adapter;
}) {
  const adapter = input.adapter ?? db.db2;
  const batch = await adapter.getVideoBatch(input.batchId);
  const candidate = await adapter.getVideoCandidate(input.candidateId);
  if (candidate.status !== "PENDING" && candidate.status !== "RUNNING") {
    return { batch, candidate, result: null };
  }

  await adapter.updateVideoCandidate(candidate.id, { status: "RUNNING" });
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
  try {
    const result = await provider({
      imageUrl: firstFrameUrl,
      lastFrameUrl,
      prompt,
      durationSec: script.durationSec,
      aspectRatio: input.aspectRatio,
      generateAudio: true,
    });
    const persisted = await (generatedAssetPersisterOverride ?? persistGeneratedAsset)({
      workspaceId: batch.workspaceId,
      sourceUrl: result.videoUrl,
      kind: "video",
      batchId: batch.id,
      candidateId: candidate.id,
    });
    const updated = await adapter.updateVideoCandidate(candidate.id, {
      videoUrl: persisted.stableUrl,
      objectKey: persisted.objectKey,
      durationSec: script.durationSec,
      provider: result.provider,
      providerResponse: {
        ...result,
        providerTemporaryUrl: persisted.providerTemporaryUrl,
      },
      status: "SUCCEEDED",
      errorMessage: null,
    });
    return { batch, candidate: updated, result };
  } catch (err) {
    const msg = String((err as Error).message ?? err);
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
  const tasks = Array.from({ length: input.count }, () =>
    provider({
      imageUrl: firstFrameUrl,
      lastFrameUrl,
      prompt,
      durationSec: script.durationSec,
      aspectRatio: input.aspectRatio,
      generateAudio: true,
    }),
  );

  const results = await Promise.allSettled(tasks);
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
      inserted.push(
        await adapter.insertVideoCandidate({
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
        }),
      );
    } else {
      failed++;
      inserted.push(
        await adapter.insertVideoCandidate({
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
          errorMessage: String((r.reason as Error)?.message ?? r.reason),
        }),
      );
    }
  }

  const finalStatus =
    failed === 0 ? "SUCCEEDED" : succeeded > 0 ? "PARTIAL" : "FAILED";
  const finalBatch = await adapter.updateVideoBatch(batch.id, {
    status: finalStatus,
    succeededCount: succeeded,
    failedCount: failed,
  });
  return { batch, finalBatch, candidates: inserted, results };
}
