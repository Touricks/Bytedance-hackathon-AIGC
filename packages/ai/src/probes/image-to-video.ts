import { generateVideoWithSeedance } from "../providers/seedance-video.provider.js";
import type { ProviderEnv } from "../providers/provider-config.js";
import { createFileTraceLogger } from "../trace/trace-log.js";
import { loadWorkspaceEnv } from "../env.js";
import {
  createProbeTraceId,
  isDirectCliRun,
  readCliOption,
  readLocalImageReference
} from "./probe-utils.js";

export interface RunImageToVideoProbeOptions {
  imagePath: string;
  prompt: string;
  traceRoot?: string;
  traceId?: string;
  env?: ProviderEnv;
  fetch?: typeof fetch;
}

export interface ImageToVideoProbeResult {
  traceId: string;
  traceFile: string;
  videoUrl: string;
  provider: string;
}

export async function runImageToVideoProbe(
  options: RunImageToVideoProbeOptions
): Promise<ImageToVideoProbeResult> {
  const traceId = options.traceId ?? createProbeTraceId("image-to-video");
  const traceLogger = createFileTraceLogger({
    traceId,
    traceRoot: options.traceRoot
  });
  const image = await readLocalImageReference(options.imagePath);

  await traceLogger.append({
    kind: "video.image_prepared",
    pipeline: "probe_image_to_video",
    status: "ok",
    meta: {
      ...image.meta,
      imageDataUrl: image.imageDataUrl
    }
  });

  try {
    loadWorkspaceEnv();
    const video = await generateVideoWithSeedance(
      {
        imageUrl: image.imageDataUrl,
        prompt: options.prompt
      },
      {
        env: options.env ?? process.env,
        fetch: options.fetch,
        traceLogger
      }
    );

    return {
      traceId,
      traceFile: traceLogger.filePath,
      videoUrl: video.videoUrl,
      provider: video.provider
    };
  } catch (error) {
    await traceLogger.append({
      kind: "video.failed",
      pipeline: "probe_image_to_video",
      status: "error",
      meta: {
        error: error instanceof Error ? error.message : "Unknown video probe failure"
      }
    });
    throw error;
  }
}

if (isDirectCliRun(import.meta.url)) {
  runImageToVideoProbe({
    imagePath: readCliOption(process.argv.slice(2), "--image"),
    prompt: readCliOption(process.argv.slice(2), "--prompt")
  })
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            traceId: result.traceId,
            traceFile: result.traceFile,
            provider: result.provider,
            videoUrl: result.videoUrl
          },
          null,
          2
        )
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
