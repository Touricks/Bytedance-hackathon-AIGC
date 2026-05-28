import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSeedanceVideoExportPrompt,
  buildVideoPromptView,
  createFileTraceLogger,
  createImageTraceMeta,
  generateVideoWithSeedance,
  getPipelineContractStep,
} from "@aigc-video/ai";
import type { Asset, ShotPromptArtifact } from "@aigc-video/shared";
import { db } from "../../db/client.js";
import { markJobCompleted, markJobMediaGenerating } from "../job-state.js";
import { resolveSeedanceImageInput } from "../seedance-image-input.js";

interface MediaGenerationInput {
  imageAsset: Asset;
  scriptId: string;
}

export type MediaGenerationPromptSource =
  {
    kind: "shotprompt";
    shotPrompt: ShotPromptArtifact;
  };

function hasRealVideoProviderConfig() {
  return Boolean(process.env.ARK_API_KEY && process.env.ARK_VIDEO_ENDPOINT_ID);
}

function archiveFilename(jobId: string, archivedAt: string) {
  const timestamp = archivedAt.replace(/[:.]/g, "-");
  return `${jobId}-${timestamp}.mp4`;
}

function workspaceVideoUrl(workspaceId: string, filename: string) {
  return `/api/workspaces/${workspaceId}/videos/${encodeURIComponent(filename)}`;
}

function resolveMockVideoPath(videoUrl: string) {
  if (!videoUrl.startsWith("/mocks/")) {
    return null;
  }
  const relativeMockPath = videoUrl.slice(1);
  const candidates = [
    path.resolve(process.cwd(), "apps/web/public", relativeMockPath),
    path.resolve(process.cwd(), "../web/public", relativeMockPath),
    path.resolve(process.cwd(), "../../apps/web/public", relativeMockPath),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function archiveVideoBytes(videoUrl: string, localPath: string) {
  const mockPath = resolveMockVideoPath(videoUrl);
  if (videoUrl.startsWith("/mocks/")) {
    if (mockPath) {
      await copyFile(mockPath, localPath);
    } else {
      await writeFile(
        localPath,
        JSON.stringify(
          {
            providerUrl: videoUrl,
            archivedAs: "metadata_only",
          },
          null,
          2,
        ),
      );
    }
    return;
  }

  if (path.isAbsolute(videoUrl)) {
    await copyFile(videoUrl, localPath);
    return;
  }

  if (!/^https?:\/\//i.test(videoUrl)) {
    await writeFile(
      localPath,
      JSON.stringify(
        {
          providerUrl: videoUrl,
          archivedAs: "metadata_only",
        },
        null,
        2,
      ),
    );
    return;
  }

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to archive provider video: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(localPath, bytes);
}

async function archiveWorkspaceVideo(input: {
  jobId: string;
  scriptId: string;
  workspaceId: string;
  provider: string;
  promptView: unknown;
  asset: Asset;
}) {
  const workspace = await db.getWorkspace(input.workspaceId);
  const archivedAt = new Date().toISOString();
  const filename = archiveFilename(input.jobId, archivedAt);
  const archiveDir = path.join(workspace.localPath, ".daireel", "videos");
  const localPath = path.join(archiveDir, filename);
  await mkdir(archiveDir, { recursive: true });
  await archiveVideoBytes(input.asset.url, localPath);

  return db.createWorkspaceVideoArchive({
    workspaceId: input.workspaceId,
    scriptId: input.scriptId,
    jobId: input.jobId,
    provider: input.provider,
    promptView: input.promptView,
    finalAssetId: input.asset.id,
    localPath,
    localUrl: workspaceVideoUrl(input.workspaceId, filename),
    providerUrl: input.asset.url,
    archivedAt,
  });
}

async function createVideoTraceLogger(input: {
  scriptId: string;
  workspaceId?: string;
}) {
  if (!input.workspaceId) {
    throw new Error(
      "V1 video generation requires workspaceId to write workspace-local trace"
    );
  }

  const workspace = await db.getWorkspace(input.workspaceId);
  return createFileTraceLogger({
    traceId: input.scriptId,
    workspaceId: input.workspaceId,
    traceFilePath: path.join(
      workspace.localPath,
      ".daireel",
      "trace",
      "events.jsonl",
    ),
  });
}

export async function processMediaGeneration(
  jobId: string,
  input: MediaGenerationInput,
  promptSource: MediaGenerationPromptSource,
) {
  await markJobMediaGenerating(jobId);
  const contract = getPipelineContractStep("video_export");

  const prompt = buildSeedanceVideoExportPrompt({
    shotPrompt: promptSource.shotPrompt,
  });
  const job = await db.getJob(jobId);
  const workspaceId =
    job.payload && typeof job.payload.workspaceId === "string"
      ? job.payload.workspaceId
      : undefined;
  const promptSourceLabel = "compiled_shotprompt";
  const promptViewSource = promptSource.shotPrompt;
  const traceLogger = await createVideoTraceLogger({
    scriptId: input.scriptId,
    workspaceId,
  });
  const preparedPromptView = buildVideoPromptView({
    source: promptViewSource,
    prompt,
    contractId: contract.id,
    promptVersion: contract.activeVersion,
    provider: hasRealVideoProviderConfig() ? "seedance" : "deterministic",
    promptSource: promptSourceLabel,
    ...(hasRealVideoProviderConfig() && process.env.ARK_VIDEO_ENDPOINT_ID
      ? { model: process.env.ARK_VIDEO_ENDPOINT_ID }
      : {}),
    jobId,
    scriptId: input.scriptId,
    workspaceId,
  });
  await traceLogger.append({
    kind: "video.prompt_prepared",
    pipeline: "one_click_video",
    status: "ok",
    jobId,
    provider: preparedPromptView.provider,
    ...(preparedPromptView.model ? { model: preparedPromptView.model } : {}),
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptSource: promptSourceLabel,
      prompt,
      promptView: preparedPromptView,
    },
  });
  try {
    const imageUrl = hasRealVideoProviderConfig()
      ? await resolveSeedanceImageInput(input.imageAsset)
      : input.imageAsset.url;
    await traceLogger.append({
      kind: "video.image_prepared",
      pipeline: "one_click_video",
      status: "ok",
      jobId,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        image: createImageTraceMeta({
          url: imageUrl,
          referenceMode: imageUrl.startsWith("data:image/")
            ? "data_url"
            : "url",
        }),
        imageUrl,
        imageAssetId: input.imageAsset.id,
        imageAssetSource: input.imageAsset.source,
      },
    });
    const video = await generateVideoWithSeedance(
      {
        imageUrl,
        prompt,
        durationSec: promptSource.shotPrompt.durationSec,
        aspectRatio: promptSource.shotPrompt.aspectRatio,
        generateAudio: promptSource.shotPrompt.tts.enabled,
      },
      {
        traceLogger,
        jobId,
        contractId: contract.id,
        contractVersion: contract.activeVersion,
      },
    );
    const promptView = buildVideoPromptView({
      source: promptViewSource,
      prompt,
      contractId: contract.id,
      promptVersion: contract.activeVersion,
      provider: video.provider === "seedance" ? "seedance" : "deterministic",
      promptSource: promptSourceLabel,
      model: video.model,
      jobId,
      scriptId: input.scriptId,
      workspaceId,
    });

    const asset = await db.createAsset({
      type: "final_video",
      url: video.videoUrl,
      source: video.provider,
      metadata: {
        prompt,
        provider: video.provider,
        promptView,
      },
    });

    if (workspaceId) {
      await archiveWorkspaceVideo({
        jobId,
        scriptId: input.scriptId,
        workspaceId,
        provider: video.provider,
        promptView,
        asset,
      });
    }

    await markJobCompleted(jobId, asset.id);

    return asset;
  } catch (error) {
    await traceLogger.append({
      kind: "video.failed",
      pipeline: "one_click_video",
      status: "error",
      jobId,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        error: error instanceof Error ? error.message : "Unknown video failure",
      },
    });
    throw error;
  }
}
