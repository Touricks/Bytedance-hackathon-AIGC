import {
  storyboardShotArtifactSchema,
  type MaterialIntakeArtifact,
  type ProductBriefArtifact,
  type StoryboardArtifact,
} from "@aigc-video/shared";
import {
  buildRegenerateShotPrompt,
  REGENERATE_SHOT_PROMPT_VERSION,
  type RegenerateShotMode,
} from "../prompts/regenerate-shot.prompt.js";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  resolveArkTextProviderConfig,
  type ProviderEnv,
} from "../providers/provider-config.js";
import { buildRegenerateShotResponseFormat } from "../contracts/response-formats.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export type { RegenerateShotMode };

export interface RegenerateShotInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  storyboard: StoryboardArtifact;
  shotIndex: number;
  mode: RegenerateShotMode;
  instruction: string;
}

export interface RegenerateShotOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

type StoryboardShot = StoryboardArtifact["shots"][number];

export async function regenerateShotWithArk(
  input: RegenerateShotInput,
  options: RegenerateShotOptions = {},
): Promise<{ provider: "ark"; shot: StoryboardShot; updatedStoryboard: StoryboardArtifact }> {
  const contract = getPipelineContractStep("storyboard");
  const env = options.env ?? process.env;
  const prompt = buildRegenerateShotPrompt(input);
  const responseFormat = buildRegenerateShotResponseFormat({
    schemaVersion: contract.activeVersion,
    material: input.material,
  });
  const config = resolveArkTextProviderConfig(env);

  if (!config) {
    throw new Error(
      "Regenerate shot workflow requires Ark text config: ARK_API_KEY and ARK_TEXT_ENDPOINT_ID",
    );
  }

  await options.traceLogger?.append({
    kind: "regenerate_shot.request_prepared",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: REGENERATE_SHOT_PROMPT_VERSION,
      shotIndex: input.shotIndex,
      mode: input.mode,
      parsedOutputStatus: "not_parsed",
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
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: REGENERATE_SHOT_PROMPT_VERSION,
            shotIndex: input.shotIndex,
            mode: input.mode,
            parsedOutputStatus: "not_parsed",
          },
        },
      },
    )
  ).output;

  const shot = storyboardShotArtifactSchema.parse(JSON.parse(rawOutput));

  const updatedShots = input.storyboard.shots.map((s, i) =>
    i === input.shotIndex ? shot : s,
  );
  const updatedStoryboard: StoryboardArtifact = {
    ...input.storyboard,
    shots: updatedShots,
  };

  await options.traceLogger?.append({
    kind: "regenerate_shot.parsed",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: REGENERATE_SHOT_PROMPT_VERSION,
      shotIndex: input.shotIndex,
      mode: input.mode,
      parsedOutputStatus: "valid",
    },
  });

  return { provider: "ark", shot, updatedStoryboard };
}
