import { z } from "zod";
import {
  materialAssetSchema,
  materialIntakeArtifactSchema,
  type MaterialIntakeArtifact
} from "@aigc-video/shared";
import {
  buildMaterialIntakePrompt,
  MATERIAL_INTAKE_PROMPT_VERSION
} from "../prompts/material-intake.prompt.js";
import { getPipelineContractStep } from "../contracts/pipeline.contracts.js";
import {
  generateTextWithArk,
  type ArkTextProviderOptions
} from "../providers/ark-text.provider.js";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv,
  type TextProviderConfig
} from "../providers/provider-config.js";
import { buildMaterialIntakeResponseFormat } from "../contracts/response-formats.js";
import { createImageTraceMeta, type FileTraceLogger } from "../trace/trace-log.js";

export interface MaterialIntakeImageInput {
  ref: string;
  url: string;
  mode: "data_url" | "url" | "provider_asset";
  detail?: "low" | "high";
}

export interface GenerateMaterialIntakeInput {
  initialPrompt?: string;
  scanned: MaterialIntakeArtifact;
  textPreviews?: Array<{ ref: string; text: string }>;
}

export interface MaterialIntakeTrace {
  promptVersion: string;
  model: string;
  provider: TextProviderConfig["provider"];
  imageReferenceMode: MaterialIntakeImageInput["mode"] | "none";
  parsedOutputStatus: "valid";
}

export interface GenerateMaterialIntakeOptions {
  env?: ProviderEnv;
  imageInputs?: MaterialIntakeImageInput[];
  includeImageInputs?: boolean;
  createClient?: ArkTextProviderOptions["createClient"];
  traceLogger?: Pick<FileTraceLogger, "append">;
}

const materialTagSchema = z.object({
  ref: z.string().min(1),
  role: materialAssetSchema.shape.role,
  description: z.string().trim().min(1),
  relevance: materialAssetSchema.shape.relevance,
  included: z.boolean().optional()
});

const materialIntakeTagsSchema = z.object({
  primaryProductRef: z.string().min(1).optional(),
  tags: z.array(materialTagSchema)
});

function buildContent(prompt: string, imageInputs: MaterialIntakeImageInput[] = []) {
  if (imageInputs.length === 0) {
    return prompt;
  }

  return [
    { type: "text" as const, text: prompt },
    ...imageInputs.map((imageInput) => ({
      type: "image_url" as const,
      image_url: {
        url: imageInput.url,
        detail: imageInput.detail ?? "high"
      }
    }))
  ];
}

function imageTraceMeta(imageInputs: MaterialIntakeImageInput[] = []) {
  return imageInputs.map((imageInput) => ({
    ref: imageInput.ref,
    ...createImageTraceMeta({
      url: imageInput.url,
      referenceMode: imageInput.mode,
      detail: imageInput.detail
    })
  }));
}

function mergeTags(
  scanned: MaterialIntakeArtifact,
  rawOutput: string
): MaterialIntakeArtifact {
  const output = materialIntakeTagsSchema.parse(JSON.parse(rawOutput));
  const acceptedRefs = new Set(scanned.assets.map((asset) => asset.ref));
  const tagsByRef = new Map(
    output.tags
      .filter((tag) => acceptedRefs.has(tag.ref))
      .map((tag) => [tag.ref, tag])
  );
  const assets = scanned.assets.map((asset) => {
    const tag = tagsByRef.get(asset.ref);
    if (!tag) {
      return asset;
    }

    return {
      ...asset,
      role: tag.role,
      description: tag.description,
      relevance: tag.relevance,
      included: tag.included ?? asset.included
    };
  });
  const preferredPrimary = assets.find(
    (asset) =>
      asset.ref === output.primaryProductRef &&
      asset.kind === "image" &&
      asset.usable &&
      asset.included
  );
  const fallbackPrimary =
    assets.find(
      (asset) =>
        asset.ref === scanned.primaryProductRef &&
        asset.kind === "image" &&
        asset.usable &&
        asset.included
    ) ??
    assets.find(
      (asset) => asset.kind === "image" && asset.usable && asset.included
    ) ??
    assets.find((asset) => asset.usable && asset.included);

  return materialIntakeArtifactSchema.parse({
    ...scanned,
    primaryProductRef:
      preferredPrimary?.ref ?? fallbackPrimary?.ref ?? scanned.primaryProductRef,
    assets
  });
}

export async function generateMaterialIntakeWithArk(
  input: GenerateMaterialIntakeInput,
  options: GenerateMaterialIntakeOptions = {}
) {
  const contract = getPipelineContractStep("material_intake");
  const env = options.env ?? process.env;
  const prompt = buildMaterialIntakePrompt(input);
  const imageInputs = options.includeImageInputs ? (options.imageInputs ?? []) : [];
  const content = buildContent(prompt, imageInputs);
  const imageReferenceMode = imageInputs[0]?.mode ?? "none";
  const responseFormat = buildMaterialIntakeResponseFormat(contract.activeVersion);
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    const message =
      "real-provider mode requires Ark text config: ARK_API_KEY, ARK_BASE_URL, and ARK_TEXT_ENDPOINT_ID";
    await options.traceLogger?.append({
      kind: "material_intake.failed",
      pipeline: "material_intake",
      status: "error",
      provider: "ark",
      model: env.ARK_TEXT_ENDPOINT_ID ?? "missing",
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: MATERIAL_INTAKE_PROMPT_VERSION,
        parsedOutputStatus: "not_attempted",
        error: message,
        imageReferenceMode,
        images: imageTraceMeta(imageInputs)
      }
    });
    if (isRealProviderMode(env)) {
      throw new Error(message);
    }
    throw new Error("Material intake runtime builder requires Ark text config");
  }

  await options.traceLogger?.append({
    kind: "material_intake.request_prepared",
    pipeline: "material_intake",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: {
      promptVersion: MATERIAL_INTAKE_PROMPT_VERSION,
      prompt,
      content,
      imageReferenceMode,
      parsedOutputStatus: "not_parsed",
      images: imageTraceMeta(imageInputs)
    }
  });

  const rawOutput = (
    await generateTextWithArk(
      { prompt, content },
      config,
      {
        traceLogger: options.traceLogger,
        createClient: options.createClient,
        responseFormat,
        trace: {
          pipeline: "material_intake",
          contractId: contract.id,
          contractVersion: contract.activeVersion,
          meta: {
            promptVersion: MATERIAL_INTAKE_PROMPT_VERSION,
            contractId: contract.id,
            contractVersion: contract.activeVersion,
            imageReferenceMode,
            parsedOutputStatus: "not_parsed",
            images: imageTraceMeta(imageInputs)
          }
        }
      }
    )
  ).output;
  let material: MaterialIntakeArtifact;
  try {
    material = mergeTags(input.scanned, rawOutput);
  } catch (error) {
    await options.traceLogger?.append({
      kind: "material_intake.parse_failed",
      pipeline: "material_intake",
      status: "error",
      provider: config.provider,
      model: config.model,
      contractId: contract.id,
      contractVersion: contract.activeVersion,
      meta: {
        promptVersion: MATERIAL_INTAKE_PROMPT_VERSION,
        parsedOutputStatus: "invalid",
        error: error instanceof Error ? error.message : "Unknown parse failure"
      }
    });
    throw error;
  }
  await options.traceLogger?.append({
    kind: "material_intake.parsed",
    pipeline: "material_intake",
    status: "ok",
    provider: config.provider,
    model: config.model,
    contractId: contract.id,
    contractVersion: contract.activeVersion,
    meta: { parsedOutputStatus: "valid" }
  });

  return {
    provider: "ark" as const,
    material,
    trace: {
      promptVersion: MATERIAL_INTAKE_PROMPT_VERSION,
      model: config.model,
      provider: config.provider,
      imageReferenceMode,
      parsedOutputStatus: "valid" as const
    }
  };
}
