import {
  generateImagesWithArk,
  resolveImageProviderConfig,
  type ArkImageResult,
} from "@aigc-video/ai";
import type { GenerateImagesJobData } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { traceService } from "../trace/trace.service.js";
import { jobRepository } from "../job/job.repository.js";
import { resolveAssetUrls } from "../material/asset-url-resolver.js";

type Adapter = typeof db.db2;

type Provider = (args: {
  prompt: string;
  negativePrompt?: string | null;
  referenceImageUrls?: string[];
  count: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
}) => Promise<ArkImageResult>;

let providerOverride: Provider | undefined;
export function __setImageProviderForTests(p: Provider | undefined) {
  providerOverride = p;
}

let resolveAssetUrlsOverride: ((ids: string[]) => Promise<string[]>) | undefined;
export function __setAssetUrlResolverForTests(fn: ((ids: string[]) => Promise<string[]>) | undefined) {
  resolveAssetUrlsOverride = fn;
}

async function defaultProvider(args: Parameters<Provider>[0]): Promise<ArkImageResult> {
  const cfg = resolveImageProviderConfig();
  if (!cfg) throw new Error("IMAGE provider not configured");
  return generateImagesWithArk(
    {
      prompt: args.prompt,
      negativePrompt: args.negativePrompt ?? undefined,
      referenceImageUrls: args.referenceImageUrls,
      count: args.count,
      aspectRatio: args.aspectRatio,
    },
    cfg,
  );
}

export async function processGenerateImages(
  data: GenerateImagesJobData,
  adapter: Adapter = db.db2,
) {
  const batch = await adapter.getImageBatch(data.batchId);
  if (batch.status !== "PENDING") return;

  await adapter.updateImageBatch(batch.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, {
    status: "RUNNING",
    startedAt: new Date().toISOString(),
  });

  const artifact = await adapter.getImagePromptArtifact(data.imagePromptArtifactId);

  const resolver = resolveAssetUrlsOverride ?? resolveAssetUrls;
  const referenceImageUrls = await resolver(artifact.referenceAssetIds);

  let result: ArkImageResult;
  try {
    result = await (providerOverride ?? defaultProvider)({
      prompt: artifact.promptText,
      negativePrompt: artifact.negativePrompt ?? undefined,
      referenceImageUrls,
      count: data.count,
      aspectRatio: data.aspectRatio,
    });
  } catch (err) {
    const msg = String((err as Error).message ?? err);
    await adapter.updateImageBatch(batch.id, {
      status: "FAILED",
      errorMessage: msg,
    });
    await adapter.updateShot(data.shotId, { status: "FAILED", lastError: msg });
    await jobRepository.update(data.jobId, {
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorMessage: msg,
    });
    await traceService.record({
      workspaceId: data.workspaceId,
      shotId: data.shotId,
      traceType: "job_event",
      name: "image_batch_failed",
      metadata: { jobId: data.jobId },
    });
    throw err;
  }

  for (const c of result.candidates) {
    await adapter.insertImageCandidate({
      id: "imc_" + Math.random().toString(36).slice(2, 12),
      batchId: batch.id,
      shotId: batch.shotId,
      workspaceId: batch.workspaceId,
      imageUrl: c.imageUrl,
      objectKey: c.objectKey ?? null,
      width: null,
      height: null,
      seed: c.seed ?? null,
      provider: result.provider,
      providerResponse: c,
      status: "SUCCEEDED",
      errorMessage: null,
    });
  }
  for (let i = result.candidates.length; i < data.count; i++) {
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
    });
  }

  const finalStatus =
    result.candidates.length === data.count
      ? "SUCCEEDED"
      : result.candidates.length > 0
        ? "PARTIAL"
        : "FAILED";

  await adapter.updateImageBatch(batch.id, {
    status: finalStatus,
    succeededCount: result.candidates.length,
    failedCount: data.count - result.candidates.length,
  });
  await jobRepository.update(data.jobId, {
    status: finalStatus === "FAILED" ? "FAILED" : "SUCCEEDED",
    completedAt: new Date().toISOString(),
  });
  await adapter.updateShot(data.shotId, {
    status: finalStatus === "FAILED" ? "FAILED" : "IMAGE_CANDIDATES_READY",
  });
  await traceService.record({
    workspaceId: data.workspaceId,
    shotId: data.shotId,
    traceType: "provider_call",
    name: "image_generation_completed",
    metadata: {
      provider: result.provider,
      model: result.model,
      count: result.candidates.length,
      jobId: data.jobId,
    },
  });
}
