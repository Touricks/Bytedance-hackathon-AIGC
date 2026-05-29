import {
  generateVideoWithSeedance,
  resolveVideoProviderConfig,
  type SeedanceVideoResult,
} from "@aigc-video/ai";
import type { GenerateVideosJobData } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { jobRepository } from "../job/job.repository.js";
import { traceService } from "../trace/trace.service.js";

type Adapter = typeof db.db2;

type Provider = (args: {
  imageUrl: string;
  prompt: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  generateAudio: boolean;
}) => Promise<SeedanceVideoResult>;

let providerOverride: Provider | undefined;
export function __setVideoProviderForTests(p: Provider | undefined) {
  providerOverride = p;
}

async function defaultProvider(args: Parameters<Provider>[0]): Promise<SeedanceVideoResult> {
  const cfg = resolveVideoProviderConfig();
  if (!cfg) throw new Error("VIDEO provider not configured");
  return generateVideoWithSeedance(
    {
      imageUrl: args.imageUrl,
      prompt: args.prompt,
      durationSec: args.durationSec,
      aspectRatio: args.aspectRatio,
      generateAudio: args.generateAudio,
    },
    { apiKey: cfg.apiKey, model: cfg.endpointId, baseURL: cfg.baseURL },
  );
}

export async function processGenerateVideos(
  data: GenerateVideosJobData,
  adapter: Adapter = db.db2,
) {
  const batch = await adapter.getVideoBatch(data.batchId);
  if (batch.status !== "PENDING") return;

  await adapter.updateVideoBatch(batch.id, { status: "RUNNING" });
  await jobRepository.update(data.jobId, {
    status: "RUNNING",
    startedAt: new Date().toISOString(),
  });

  const script = await adapter.getVideoScriptArtifact(data.videoScriptArtifactId);
  if (script.status !== "ACTIVE") {
    await adapter.updateVideoBatch(batch.id, {
      status: "FAILED",
      errorMessage: "STALE_SCRIPT",
    });
    await adapter.updateShot(data.shotId, { status: "FAILED", lastError: "STALE_SCRIPT" });
    await jobRepository.update(data.jobId, {
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorMessage: "STALE_SCRIPT",
    });
    throw new Error("STALE_SCRIPT");
  }
  const startImage = await adapter.getImageCandidate(script.basedOnImageCandidateId);
  if (!startImage.imageUrl) throw new Error("MISSING_START_IMAGE_URL");

  const provider = providerOverride ?? defaultProvider;
  const tasks = Array.from({ length: data.count }, () =>
    provider({
      imageUrl: startImage.imageUrl!,
      prompt: script.providerPrompt,
      durationSec: script.durationSec,
      aspectRatio: data.aspectRatio,
      generateAudio: true,
    }),
  );

  const results = await Promise.allSettled(tasks);
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      succeeded++;
      await adapter.insertVideoCandidate({
        id: "vcd_" + Math.random().toString(36).slice(2, 12),
        batchId: batch.id,
        shotId: batch.shotId,
        workspaceId: batch.workspaceId,
        videoUrl: r.value.videoUrl,
        objectKey: null,
        thumbnailUrl: null,
        durationSec: script.durationSec,
        width: null,
        height: null,
        provider: r.value.provider,
        providerResponse: r.value,
        status: "SUCCEEDED",
        errorMessage: null,
      });
    } else {
      failed++;
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
      });
    }
  }

  const finalStatus =
    failed === 0 ? "SUCCEEDED" : succeeded > 0 ? "PARTIAL" : "FAILED";
  await adapter.updateVideoBatch(batch.id, {
    status: finalStatus,
    succeededCount: succeeded,
    failedCount: failed,
  });
  await jobRepository.update(data.jobId, {
    status: finalStatus === "FAILED" ? "FAILED" : "SUCCEEDED",
    completedAt: new Date().toISOString(),
  });
  await adapter.updateShot(data.shotId, {
    status: finalStatus === "FAILED" ? "FAILED" : "VIDEO_CANDIDATES_READY",
  });
  await traceService.record({
    workspaceId: data.workspaceId,
    shotId: data.shotId,
    traceType: "provider_call",
    name: "video_generation_completed",
    metadata: { succeeded, failed, jobId: data.jobId },
  });
}
