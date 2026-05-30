import {
  productBriefArtifactSchema,
  type MaterialIntakeArtifact,
  type ProductBriefArtifact,
} from "@aigc-video/shared";
import {
  buildProductBriefPrompt,
  buildProductBriefRepairPrompt,
  PRODUCT_BRIEF_PROMPT_VERSION,
} from "../prompts/product-brief.prompt.js";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv,
  type TextProviderConfig,
} from "../providers/provider-config.js";
import { buildProductBriefResponseFormat } from "../contracts/response-formats.js";
import {
  createImageTraceMeta,
  type FileTraceLogger,
} from "../trace/trace-log.js";

export interface ProductBriefImageInput {
  url: string;
  mode: "data_url" | "url" | "provider_asset";
  detail?: "low" | "high";
}

export interface GenerateProductBriefInput {
  userDirection?: string;
  title?: string;
  sellingPoints?: string;
  audience?: string;
  stylePreference?: string;
  material: MaterialIntakeArtifact;
}

export interface ProductBriefTrace {
  promptVersion: string;
  model: string;
  provider: TextProviderConfig["provider"];
  imageReferenceMode: ProductBriefImageInput["mode"] | "none";
  parsedOutputStatus: "valid" | "repaired";
  repairAttempts: number;
}

export interface GenerateProductBriefOptions {
  env?: ProviderEnv;
  imageInput?: ProductBriefImageInput;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

function parseProductBrief(rawOutput: string): ProductBriefArtifact {
  return productBriefArtifactSchema.parse(JSON.parse(rawOutput));
}

function buildContent(prompt: string, imageInput?: ProductBriefImageInput) {
  if (!imageInput) {
    return prompt;
  }

  return [
    { type: "text" as const, text: prompt },
    {
      type: "image_url" as const,
      image_url: {
        url: imageInput.url,
        detail: imageInput.detail ?? "high",
      },
    },
  ];
}

function imageTraceMeta(imageInput?: ProductBriefImageInput) {
  return imageInput
    ? createImageTraceMeta({
        url: imageInput.url,
        referenceMode: imageInput.mode,
        detail: imageInput.detail,
      })
    : undefined;
}

export async function generateProductBriefWithArk(
  input: GenerateProductBriefInput,
  options: GenerateProductBriefOptions = {},
) {
  const contract = getPipelineContractStep("product_brief");
  const env = options.env ?? process.env;
  const prompt = buildProductBriefPrompt(input);
  const content = buildContent(prompt, options.imageInput);
  const imageReferenceMode = options.imageInput?.mode ?? "none";
  const responseFormat = buildProductBriefResponseFormat(contract.activeVersion);
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    const message =
      "real-provider mode requires Ark text config: ARK_API_KEY, ARK_BASE_URL, and ARK_TEXT_ENDPOINT_ID";
    await options.traceLogger?.append({
      kind: "brief.failed",
      pipeline: "product_brief",
      status: "error",
      provider: "ark",
      model: env.ARK_TEXT_ENDPOINT_ID ?? "missing",
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
        parsedOutputStatus: "not_attempted",
        error: message,
        imageReferenceMode,
        image: imageTraceMeta(options.imageInput),
      },
    });
    if (isRealProviderMode(env)) {
      throw new Error(message);
    }
    throw new Error("Product brief runtime builder requires Ark text config");
  }

  await options.traceLogger?.append({
    kind: "brief.request_prepared",
    pipeline: "product_brief",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
      prompt,
      content,
      imageReferenceMode,
      parsedOutputStatus: "not_parsed",
      image: imageTraceMeta(options.imageInput),
    },
  });

  const rawOutput = (
    await generateTextWithArk(
      {
        prompt,
        content,
      },
      config,
      {
        traceLogger: options.traceLogger,
        responseFormat,
        trace: {
          pipeline: "product_brief",
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
            contractId: contract.id,
            contractVersion: contract.activeVersion,
            imageReferenceMode,
            parsedOutputStatus: "not_parsed",
            image: imageTraceMeta(options.imageInput),
          },
        },
      },
    )
  ).output;

  try {
    const productBrief = parseProductBrief(rawOutput);
    await options.traceLogger?.append({
      kind: "brief.parsed",
      pipeline: "product_brief",
      status: "ok",
      provider: config.provider,
      model: config.model,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
        parsedOutputStatus: "valid",
      },
    });
    return {
      provider: "ark" as const,
      productBrief,
      trace: {
        promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
        model: config.model,
        provider: config.provider,
        imageReferenceMode,
        parsedOutputStatus: "valid" as const,
        repairAttempts: 0,
      },
    };
  } catch (firstError) {
    await options.traceLogger?.append({
      kind: "brief.parse_failed",
      pipeline: "product_brief",
      status: "error",
      provider: config.provider,
      model: config.model,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
        parsedOutputStatus: "invalid",
        error:
          firstError instanceof Error
            ? firstError.message
            : "Unknown parse failure",
      },
    });
    const repairPrompt = buildProductBriefRepairPrompt(rawOutput);
    const repairedOutput = (
      await generateTextWithArk(
        {
          prompt: repairPrompt,
          content: repairPrompt,
        },
        config,
        {
          traceLogger: options.traceLogger,
          responseFormat,
          trace: {
            pipeline: "product_brief",
            contractId: contract.id,
            contractVersion: contract.activeVersion,
            meta: {
              promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
              contractId: contract.id,
              contractVersion: contract.activeVersion,
              parsedOutputStatus: "repairing",
            },
          },
        },
      )
    ).output;
    let productBrief: ProductBriefArtifact;
    try {
      productBrief = parseProductBrief(repairedOutput);
    } catch (repairError) {
      await options.traceLogger?.append({
        kind: "brief.repair_failed",
        pipeline: "product_brief",
        status: "error",
        provider: config.provider,
        model: config.model,
        contractId: contract.id,
        contractVersion: contract.activeVersion,
        meta: {
          promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
          parsedOutputStatus: "repair_failed",
          error:
            repairError instanceof Error
              ? repairError.message
              : "Unknown repair failure",
        },
      });
      throw new Error(
        `Product brief provider output could not be repaired: ${
          repairError instanceof Error
            ? repairError.message
            : "Unknown repair failure"
        }`,
      );
    }
    await options.traceLogger?.append({
      kind: "brief.parsed",
      pipeline: "product_brief",
      status: "ok",
      provider: config.provider,
      model: config.model,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
        parsedOutputStatus: "repaired",
      },
    });
    return {
      provider: "ark" as const,
      productBrief,
      trace: {
        promptVersion: PRODUCT_BRIEF_PROMPT_VERSION,
        model: config.model,
        provider: config.provider,
        imageReferenceMode,
        parsedOutputStatus: "repaired" as const,
        repairAttempts: 1,
      },
    };
  }
}
