import {
  assertShotPromptMatchesStoryboard,
  shotPromptArtifactSchema,
  type MaterialIntakeArtifact,
  type ProductBriefArtifact,
  type ShotPromptArtifact,
  type StoryboardArtifact
} from "@aigc-video/shared";
import {
  buildShotPromptPrompt,
  SHOTPROMPT_PROMPT_VERSION
} from "../prompts/shotprompt.prompt.js";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv,
  type TextProviderConfig
} from "../providers/provider-config.js";
import { buildShotPromptResponseFormat } from "../contracts/response-formats.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export interface GenerateShotPromptInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  storyboard: StoryboardArtifact;
  aspectRatio: "9:16" | "16:9" | "1:1";
}

export interface ShotPromptTrace {
  promptVersion: string;
  model: string;
  provider: TextProviderConfig["provider"];
  parsedOutputStatus: "valid";
}

export interface GenerateShotPromptOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

function parseShotPrompt(
  rawOutput: string,
  storyboard: StoryboardArtifact,
): ShotPromptArtifact {
  const shotPrompt = shotPromptArtifactSchema.parse(JSON.parse(rawOutput));
  assertShotPromptMatchesStoryboard(shotPrompt, storyboard, {
    requireShotLayers: true,
  });
  return shotPrompt;
}

export async function generateShotPromptWithArk(
  input: GenerateShotPromptInput,
  options: GenerateShotPromptOptions = {}
) {
  const contract = getPipelineContractStep("shotprompt");
  const env = options.env ?? process.env;
  const prompt = buildShotPromptPrompt(input);
  const responseFormat = buildShotPromptResponseFormat({
    schemaVersion: contract.activeVersion,
    material: input.material,
    expectedShotCount: input.storyboard.shots.length
  });
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    const message =
      "real-provider mode requires Ark text config: ARK_API_KEY, ARK_BASE_URL, and ARK_TEXT_ENDPOINT_ID";
    await options.traceLogger?.append({
      kind: "shotprompt.failed",
      pipeline: "shotprompt",
      status: "error",
      provider: "ark",
      model: env.ARK_TEXT_ENDPOINT_ID ?? "missing",
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: SHOTPROMPT_PROMPT_VERSION,
        parsedOutputStatus: "not_attempted",
        error: message
      }
    });
    if (isRealProviderMode(env)) {
      throw new Error(message);
    }
    throw new Error("Shotprompt runtime builder requires Ark text config");
  }

  await options.traceLogger?.append({
    kind: "shotprompt.request_prepared",
    pipeline: "shotprompt",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: SHOTPROMPT_PROMPT_VERSION,
      parsedOutputStatus: "not_parsed",
      prompt
    }
  });
  const rawOutput = (
    await generateTextWithArk(
      { prompt, content: prompt },
      config,
      {
        traceLogger: options.traceLogger,
        responseFormat,
        trace: {
          pipeline: "shotprompt",
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: SHOTPROMPT_PROMPT_VERSION,
            contractId: contract.id,
            contractVersion: contract.activeVersion,
            parsedOutputStatus: "not_parsed"
          }
        }
      }
    )
  ).output;
  let shotPrompt: ShotPromptArtifact;
  try {
    shotPrompt = parseShotPrompt(rawOutput, input.storyboard);
  } catch (error) {
    await options.traceLogger?.append({
      kind: "shotprompt.parse_failed",
      pipeline: "shotprompt",
      status: "error",
      provider: config.provider,
      model: config.model,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: SHOTPROMPT_PROMPT_VERSION,
        parsedOutputStatus: "invalid",
        error: error instanceof Error ? error.message : "Unknown parse failure"
      }
    });
    throw error;
  }
  await options.traceLogger?.append({
    kind: "shotprompt.parsed",
    pipeline: "shotprompt",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: SHOTPROMPT_PROMPT_VERSION,
      parsedOutputStatus: "valid"
    }
  });

  return {
    provider: "ark" as const,
    shotPrompt,
    trace: {
      promptVersion: SHOTPROMPT_PROMPT_VERSION,
      model: config.model,
      provider: config.provider,
      parsedOutputStatus: "valid" as const
    }
  };
}
