import {
  storyboardVariantsArtifactSchema,
  type MaterialIntakeArtifact,
  type ProductBriefArtifact,
  type StoryboardVariantsArtifact,
} from "@aigc-video/shared";
import {
  buildStoryboardVariantsPrompt,
  STORYBOARD_VARIANTS_PROMPT_VERSION,
} from "../prompts/storyboard-variants.prompt.js";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  resolveArkTextProviderConfig,
  type ProviderEnv,
} from "../providers/provider-config.js";
import { buildStoryboardVariantsResponseFormat } from "../contracts/response-formats.js";
import type { FileTraceLogger } from "../trace/trace-log.js";

export interface GenerateStoryboardVariantsInput {
  brief: ProductBriefArtifact;
  material: MaterialIntakeArtifact;
  variantCount?: 2 | 3;
}

export interface GenerateStoryboardVariantsOptions {
  env?: ProviderEnv;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

export async function generateStoryboardVariantsWithArk(
  input: GenerateStoryboardVariantsInput,
  options: GenerateStoryboardVariantsOptions = {},
): Promise<{ provider: "ark"; variants: StoryboardVariantsArtifact }> {
  const contract = getPipelineContractStep("storyboard");
  const env = options.env ?? process.env;
  const prompt = buildStoryboardVariantsPrompt(input);
  const responseFormat = buildStoryboardVariantsResponseFormat({
    schemaVersion: contract.activeVersion,
    material: input.material,
  });
  const config = resolveArkTextProviderConfig(env);

  if (!config) {
    throw new Error(
      "Storyboard variants workflow requires Ark text config: ARK_API_KEY and ARK_TEXT_ENDPOINT_ID",
    );
  }

  await options.traceLogger?.append({
    kind: "storyboard_variants.request_prepared",
    pipeline: "storyboard_variants",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: STORYBOARD_VARIANTS_PROMPT_VERSION,
      variantCount: input.variantCount ?? 3,
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
          pipeline: "storyboard_variants",
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: STORYBOARD_VARIANTS_PROMPT_VERSION,
            parsedOutputStatus: "not_parsed",
          },
        },
      },
    )
  ).output;

  const variants = storyboardVariantsArtifactSchema.parse(JSON.parse(rawOutput));

  await options.traceLogger?.append({
    kind: "storyboard_variants.parsed",
    pipeline: "storyboard_variants",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: STORYBOARD_VARIANTS_PROMPT_VERSION,
      parsedOutputStatus: "valid",
      variantCount: variants.variants.length,
    },
  });

  return { provider: "ark", variants };
}
