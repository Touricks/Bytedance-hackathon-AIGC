import type { ShotPromptArtifact } from "@aigc-video/shared";
import {
  generateTtsWithArk,
  type ArkTtsResult,
  type TtsVoice,
} from "../providers/ark-tts.provider.js";
import { resolveTtsProviderConfig, type ProviderEnv } from "../providers/provider-config.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export interface TtsWorkflowInput {
  voiceover: string;
  voice?: TtsVoice;
  responseFormat?: "mp3" | "wav";
}

export interface TtsWorkflowOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

export interface TtsWorkflowResult extends ArkTtsResult {
  voiceover: string;
}

export function buildTtsInputFromShotPrompt(shotPrompt: ShotPromptArtifact): TtsWorkflowInput | null {
  if (!shotPrompt.tts.enabled) return null;
  const text = shotPrompt.tts.voiceover.trim();
  if (!text) return null;
  return { voiceover: text };
}

export async function generateTtsFromShotPrompt(
  shotPrompt: ShotPromptArtifact,
  options: TtsWorkflowOptions = {},
): Promise<TtsWorkflowResult | null> {
  const input = buildTtsInputFromShotPrompt(shotPrompt);
  if (!input) return null;
  return generateTtsVoiceover(input, options);
}

export async function generateTtsVoiceover(
  input: TtsWorkflowInput,
  options: TtsWorkflowOptions = {},
): Promise<TtsWorkflowResult> {
  const env = options.env ?? process.env;
  const config = resolveTtsProviderConfig(env);

  if (!config) {
    throw new Error(
      "TTS workflow requires TTS_ENDPOINT_ID and either TTS_API_KEY or ARK_API_KEY to be set.",
    );
  }

  const result = await generateTtsWithArk(
    {
      text: input.voiceover,
      voice: input.voice,
      responseFormat: input.responseFormat ?? "mp3",
    },
    config,
    { traceLogger: options.traceLogger },
  );

  return { ...result, voiceover: input.voiceover };
}
