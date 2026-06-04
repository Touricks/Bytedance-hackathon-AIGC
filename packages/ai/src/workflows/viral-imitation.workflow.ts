import {
  storyboardArtifactSchema,
  type StoryboardArtifact,
} from "@aigc-video/shared";
import {
  buildViralImitationPrompt,
  VIRAL_IMITATION_PROMPT_VERSION,
  type ViralImitationInput,
} from "../prompts/viral-imitation.prompt.js";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  resolveArkTextProviderConfig,
  type ProviderEnv,
} from "../providers/provider-config.js";
import { buildViralImitationResponseFormat } from "../contracts/response-formats.js";
import { searchTemplates } from "../data/viral-templates.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export type { ViralImitationInput };

export interface ViralImitationOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

export interface ViralImitationResult {
  provider: "ark";
  viralTemplateUsed: string;
  matchReason: string;
  storyboard: StoryboardArtifact;
}

export async function generateViralImitationWithArk(
  input: ViralImitationInput,
  options: ViralImitationOptions = {},
): Promise<ViralImitationResult> {
  const contract = getPipelineContractStep("storyboard");
  const env = options.env ?? process.env;

  const candidateTemplates =
    input.candidateTemplates ??
    searchTemplates(
      { product: input.brief.product },
      3,
    );

  const prompt = buildViralImitationPrompt({ ...input, candidateTemplates });
  const responseFormat = buildViralImitationResponseFormat({
    schemaVersion: contract.activeVersion,
    material: input.material,
  });
  const config = resolveArkTextProviderConfig(env);

  if (!config) {
    throw new Error(
      "Viral imitation workflow requires Ark text config: ARK_API_KEY and ARK_TEXT_ENDPOINT_ID",
    );
  }

  await options.traceLogger?.append({
    kind: "viral_imitation.request_prepared",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: VIRAL_IMITATION_PROMPT_VERSION,
      candidateTemplates: candidateTemplates.map((t) => t.id),
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
          meta: { promptVersion: VIRAL_IMITATION_PROMPT_VERSION },
        },
      },
    )
  ).output;

  const parsed = JSON.parse(rawOutput) as {
    viralTemplateUsed: string;
    matchReason: string;
    narrative: string;
    totalDurationSec: number;
    shots: unknown[];
    assumptions: string[];
  };

  const storyboard = storyboardArtifactSchema.parse({
    narrative: parsed.narrative,
    totalDurationSec: parsed.totalDurationSec,
    shots: parsed.shots,
    assumptions: parsed.assumptions,
  });

  await options.traceLogger?.append({
    kind: "viral_imitation.parsed",
    pipeline: "storyboard",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: VIRAL_IMITATION_PROMPT_VERSION,
      viralTemplateUsed: parsed.viralTemplateUsed,
    },
  });

  return {
    provider: "ark",
    viralTemplateUsed: parsed.viralTemplateUsed,
    matchReason: parsed.matchReason,
    storyboard,
  };
}
