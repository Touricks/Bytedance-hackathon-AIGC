import {
  shotPromptShotArtifactSchema,
  type ShotPromptArtifact,
} from "@aigc-video/shared";
import {
  buildRegenerateShotPromptPrompt,
  REGENERATE_SHOTPROMPT_PROMPT_VERSION,
  type RegenerateShotPromptInput,
} from "../prompts/regenerate-shotprompt.prompt.js";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  resolveArkTextProviderConfig,
  type ProviderEnv,
} from "../providers/provider-config.js";
import { buildRegenerateShotPromptResponseFormat } from "../contracts/response-formats.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export type { RegenerateShotPromptInput };

export interface RegenerateShotPromptOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

type ShotPromptShot = ShotPromptArtifact["shots"][number];

export interface RegenerateShotPromptResult {
  provider: "ark";
  shot: ShotPromptShot;
  updatedShotPrompt: ShotPromptArtifact;
  /** shot 0 の providerPrompt が変わった場合 true — 呼び出し元は他の shots も再生成を検討すること */
  baselineChanged: boolean;
}

export async function regenerateShotPromptWithArk(
  input: RegenerateShotPromptInput,
  options: RegenerateShotPromptOptions = {},
): Promise<RegenerateShotPromptResult> {
  const contract = getPipelineContractStep("shotprompt");
  const env = options.env ?? process.env;
  const prompt = buildRegenerateShotPromptPrompt(input);
  const responseFormat = buildRegenerateShotPromptResponseFormat({
    schemaVersion: contract.activeVersion,
    material: input.material,
  });
  const config = resolveArkTextProviderConfig(env);

  if (!config) {
    throw new Error(
      "Regenerate shotprompt workflow requires Ark text config: ARK_API_KEY and ARK_TEXT_ENDPOINT_ID",
    );
  }

  await options.traceLogger?.append({
    kind: "regenerate_shotprompt.request_prepared",
    pipeline: "shotprompt",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: REGENERATE_SHOTPROMPT_PROMPT_VERSION,
      shotIndex: input.shotIndex,
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
          pipeline: "shotprompt",
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: REGENERATE_SHOTPROMPT_PROMPT_VERSION,
            shotIndex: input.shotIndex,
            parsedOutputStatus: "not_parsed",
          },
        },
      },
    )
  ).output;

  const shot = shotPromptShotArtifactSchema.parse(JSON.parse(rawOutput));

  const updatedShots = input.currentShotPrompt.shots.map((s, i) =>
    i === input.shotIndex ? shot : s,
  );
  const updatedShotPrompt: ShotPromptArtifact = {
    ...input.currentShotPrompt,
    shots: updatedShots,
  };

  const baselineChanged = input.shotIndex === 0;

  await options.traceLogger?.append({
    kind: "regenerate_shotprompt.parsed",
    pipeline: "shotprompt",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: REGENERATE_SHOTPROMPT_PROMPT_VERSION,
      shotIndex: input.shotIndex,
      parsedOutputStatus: "valid",
      baselineChanged,
    },
  });

  return { provider: "ark", shot, updatedShotPrompt, baselineChanged };
}
