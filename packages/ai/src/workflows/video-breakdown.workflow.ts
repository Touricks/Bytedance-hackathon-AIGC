import {
  buildVideoBreakdownPrompt,
  VIDEO_BREAKDOWN_PROMPT_VERSION,
  type VideoBreakdownInput,
} from "../prompts/video-breakdown.prompt.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  resolveArkTextProviderConfig,
  type ProviderEnv,
} from "../providers/provider-config.js";
import { buildVideoBreakdownResponseFormat } from "../contracts/response-formats.js";
import type { FileTraceLogger } from "../trace/trace-log.js";
import type { VideoBreakdownArtifact } from "@aigc-video/shared";

export type { VideoBreakdownInput };

export interface VideoBreakdownOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

export interface VideoBreakdownResult {
  provider: "ark";
  breakdown: VideoBreakdownArtifact;
}

export async function analyzeVideoBreakdownWithArk(
  input: VideoBreakdownInput,
  options: VideoBreakdownOptions = {},
): Promise<VideoBreakdownResult> {
  const env = options.env ?? process.env;
  const config = resolveArkTextProviderConfig(env);

  if (!config) {
    throw new Error(
      "Video breakdown workflow requires Ark text config: ARK_API_KEY and ARK_TEXT_ENDPOINT_ID",
    );
  }

  const prompt = buildVideoBreakdownPrompt(input);
  const responseFormat = buildVideoBreakdownResponseFormat("v1");

  await options.traceLogger?.append({
    kind: "video_breakdown.request_prepared",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: "video_breakdown_v1",
    contractVersion: "v1",
    meta: {
      promptVersion: VIDEO_BREAKDOWN_PROMPT_VERSION,
      videoTitle: input.videoTitle,
    },
  });

  const rawOutput = (
    await generateTextWithArk(
      { prompt, content: prompt },
      config,
      {
        traceLogger: options.traceLogger,
        responseFormat,
        trace: {
          pipeline: "storyboard",
          contractId: "video_breakdown_v1",
          contractVersion: "v1",
          meta: { promptVersion: VIDEO_BREAKDOWN_PROMPT_VERSION },
        },
      },
    )
  ).output;

  const parsed = JSON.parse(rawOutput) as VideoBreakdownArtifact;

  await options.traceLogger?.append({
    kind: "video_breakdown.parsed",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: "video_breakdown_v1",
    contractVersion: "v1",
    meta: {
      promptVersion: VIDEO_BREAKDOWN_PROMPT_VERSION,
      suggestedName: parsed.suggestedName,
    },
  });

  return { provider: "ark", breakdown: parsed };
}
