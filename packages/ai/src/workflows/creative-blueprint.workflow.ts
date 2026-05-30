import {
  creativeBlueprintSchema,
  type CreateCreativeBlueprintRequest,
  type CreativeBlueprint
} from "@aigc-video/shared";
import {
  buildCreativeBlueprintPrompt,
  buildCreativeBlueprintRepairPrompt,
  CREATIVE_BLUEPRINT_PROMPT_VERSION
} from "../prompts/creative-blueprint.prompt.js";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv,
  type TextProviderConfig
} from "../providers/provider-config.js";
import { generateTextWithArk } from "../providers/ark-text.provider.js";
import { createImageTraceMeta, type FileTraceLogger } from "../trace/trace-log.js";

export type CreativeBlueprintImageReferenceMode =
  | "none"
  | "url"
  | "data_url"
  | "provider_asset"
  | "text_only_fallback";

export interface CreativeBlueprintImageInput {
  url: string;
  mode: Exclude<CreativeBlueprintImageReferenceMode, "none" | "text_only_fallback">;
  detail?: "low" | "high";
}

export interface CreativeBlueprintTextContentPart {
  type: "text";
  text: string;
}

export interface CreativeBlueprintImageContentPart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "low" | "high";
  };
}

export type CreativeBlueprintUserContent =
  | string
  | Array<CreativeBlueprintTextContentPart | CreativeBlueprintImageContentPart>;

export interface CreativeBlueprintModelRequest {
  prompt: string;
  content: CreativeBlueprintUserContent;
  imageReferenceMode: CreativeBlueprintImageReferenceMode;
}

export type TextModelCall = (request: CreativeBlueprintModelRequest) => Promise<string>;
export type CreateTextModelCall = (config: TextProviderConfig) => TextModelCall;

export interface CreativeBlueprintTrace {
  promptVersion: string;
  model: string;
  textProvider: "ark" | "deterministic";
  imageReferenceMode: CreativeBlueprintImageReferenceMode;
  rawOutputSummary?: string;
  parsedOutputStatus: "valid" | "repaired" | "fallback";
  repairAttempts: number;
  fallbackUsed: boolean;
  failureReason?: string;
}

export interface GenerateCreativeBlueprintResult {
  provider: "ark" | "fallback";
  creativeBlueprint: CreativeBlueprint;
  trace: CreativeBlueprintTrace;
}

export interface GenerateCreativeBlueprintOptions {
  callTextModel?: TextModelCall;
  createTextModelCall?: CreateTextModelCall;
  env?: ProviderEnv;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  imageInput?: CreativeBlueprintImageInput;
  traceLogger?: Pick<FileTraceLogger, "append">;
}

function summarizeRawOutput(rawOutput: string) {
  return rawOutput.replace(/\s+/g, " ").slice(0, 240);
}

function parseCreativeBlueprint(rawOutput: string): CreativeBlueprint {
  return creativeBlueprintSchema.parse(JSON.parse(rawOutput));
}

function buildCreativeBlueprintModelRequest(
  prompt: string,
  imageInput?: CreativeBlueprintImageInput
): CreativeBlueprintModelRequest {
  if (!imageInput) {
    return {
      prompt,
      content: prompt,
      imageReferenceMode: "none"
    };
  }

  return {
    prompt,
    content: [
      {
        type: "text",
        text: prompt
      },
      {
        type: "image_url",
        image_url: {
          url: imageInput.url,
          detail: imageInput.detail ?? "high"
        }
      }
    ],
    imageReferenceMode: imageInput.mode
  };
}

function buildImageTraceMeta(imageInput?: CreativeBlueprintImageInput) {
  if (!imageInput) {
    return undefined;
  }

  return createImageTraceMeta({
    url: imageInput.url,
    referenceMode: imageInput.mode,
    detail: imageInput.detail
  });
}

function getTextOnlyFallbackImageMode(
  imageInput?: CreativeBlueprintImageInput
): CreativeBlueprintImageReferenceMode {
  return imageInput ? "text_only_fallback" : "none";
}

function buildFallbackCreativeBlueprint(
  input: CreateCreativeBlueprintRequest
): CreativeBlueprint {
  return creativeBlueprintSchema.parse({
    narrative: `${input.title} 的 12 秒带货短视频：先用干净商品主视觉镜头建立信任，再突出 ${input.sellingPoints}，最后回到购买暗示。`,
    visualStyle: input.stylePreference,
    targetAudience: input.audience,
    coreSellingPoint: input.sellingPoints,
    shots: [
      {
        index: 1,
        durationSec: 3,
        purpose: "hook",
        visualPrompt: `${input.title} 的干净商品主视觉镜头，商品居中，布光清晰`,
        cameraMotion: "缓慢推进",
        voiceover: `${input.title}，第一眼就能抓住注意力。`,
        subtitle: "第一眼就被吸引"
      },
      {
        index: 2,
        durationSec: 5,
        purpose: "benefit",
        visualPrompt: `用简单商品细节或使用场景展示 ${input.sellingPoints}`,
        cameraMotion: "平稳横移",
        voiceover: `核心卖点是：${input.sellingPoints}`,
        subtitle: input.sellingPoints
      },
      {
        index: 3,
        durationSec: 4,
        purpose: "cta",
        visualPrompt: `面向 ${input.audience} 的精致收束主视觉镜头`,
        cameraMotion: "轻微后拉",
        voiceover: `适合${input.audience}，现在就试试。`,
        subtitle: "现在就试试"
      }
    ],
    renderBrief: {
      productConsistencyRules: [
        "以上传商品图作为视觉事实源",
        "保持商品形状、颜色、材质、Logo 和包装一致"
      ],
      avoid: [
        "不要生成新的商品部件",
        "不要添加额外品牌或可读文字"
      ],
      videoPromptSummary: `${input.title} 的 12 秒 ${input.stylePreference} 电商商品展示视频`
    },
    improvementHints: [
      {
        ifVideoLooksBad: "商品不像原图",
        suggestedUserAction: "上传更清晰的正面商品图，或减少风格偏好中的复杂场景词。",
        fieldsToChange: ["productImage", "stylePreference"]
      }
    ]
  });
}

function createArkTextModelCall(config: TextProviderConfig): TextModelCall {
  return async (request) => {
    const result = await generateTextWithArk(
      {
        prompt: request.prompt,
        content: request.content
      },
      config,
      {
        temperature: 0.7,
        topP: 0.9
      }
    );

    return result.output;
  };
}

function deterministicFallbackResult(
  input: CreateCreativeBlueprintRequest,
  model: string,
  repairAttempts: number,
  failureReason: string,
  imageReferenceMode: CreativeBlueprintImageReferenceMode,
  rawOutput?: string
): GenerateCreativeBlueprintResult {
  return {
    provider: "fallback",
    creativeBlueprint: buildFallbackCreativeBlueprint(input),
    trace: {
      promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
      model,
      textProvider: "deterministic",
      imageReferenceMode,
      rawOutputSummary: rawOutput ? summarizeRawOutput(rawOutput) : undefined,
      parsedOutputStatus: "fallback",
      repairAttempts,
      fallbackUsed: true,
      failureReason
    }
  };
}

async function runTextProvider(
  input: CreateCreativeBlueprintRequest,
  provider: TextProviderConfig,
  callTextModel: TextModelCall,
  prompt: string,
  imageInput?: CreativeBlueprintImageInput,
  traceLogger?: Pick<FileTraceLogger, "append">,
  allowDeterministicFallback = true
): Promise<GenerateCreativeBlueprintResult> {
  let rawOutput = "";
  const traceImageReferenceMode = imageInput
    ? imageInput.mode
    : getTextOnlyFallbackImageMode(imageInput);

  try {
    const modelRequest = buildCreativeBlueprintModelRequest(prompt, imageInput);
    await traceLogger?.append({
      kind: "blueprint.request_prepared",
      pipeline: "creative_blueprint",
      status: "ok",
      provider: provider.provider,
      model: provider.model,
      meta: {
        promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
        prompt,
        content: modelRequest.content,
        imageReferenceMode: traceImageReferenceMode,
        image: buildImageTraceMeta(imageInput)
      }
    });
    const startedAt = Date.now();
    await traceLogger?.append({
      kind: "provider.request_started",
      pipeline: "creative_blueprint",
      status: "ok",
      provider: provider.provider,
      model: provider.model,
      meta: {
        endpointFamily: "ark_openai_compatible",
        baseURL: provider.baseURL,
        imageReferenceMode: traceImageReferenceMode,
        image: buildImageTraceMeta(imageInput)
      }
    });
    rawOutput = await callTextModel(modelRequest);
    await traceLogger?.append({
      kind: "provider.response_received",
      pipeline: "creative_blueprint",
      status: "ok",
      provider: provider.provider,
      model: provider.model,
      latencyMs: Date.now() - startedAt,
      meta: {
        output: rawOutput
      }
    });
    const creativeBlueprint = parseCreativeBlueprint(rawOutput);
    await traceLogger?.append({
      kind: "blueprint.parsed",
      pipeline: "creative_blueprint",
      status: "ok",
      provider: provider.provider,
      model: provider.model,
      meta: {
        parsedOutputStatus: "valid"
      }
    });
    return {
      provider: "ark",
      creativeBlueprint,
      trace: {
        promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
        model: provider.model,
        textProvider: provider.provider,
        imageReferenceMode: traceImageReferenceMode,
        rawOutputSummary: summarizeRawOutput(rawOutput),
        parsedOutputStatus: "valid",
        repairAttempts: 0,
        fallbackUsed: false
      }
    };
  } catch (firstError) {
    if (!rawOutput) {
      await traceLogger?.append({
        kind: "provider.failed",
        pipeline: "creative_blueprint",
        status: "error",
        provider: provider.provider,
        model: provider.model,
        meta: {
          error:
            firstError instanceof Error ? firstError.message : "Unknown provider failure"
        }
      });
      throw firstError;
    }

    try {
      await traceLogger?.append({
        kind: "blueprint.parse_failed",
        pipeline: "creative_blueprint",
        status: "error",
        provider: provider.provider,
        model: provider.model,
        meta: {
          output: rawOutput,
          error:
            firstError instanceof Error ? firstError.message : "Unknown parse failure"
        }
      });
      const repairedOutput = await callTextModel(
        buildCreativeBlueprintModelRequest(buildCreativeBlueprintRepairPrompt(rawOutput))
      );
      const creativeBlueprint = parseCreativeBlueprint(repairedOutput);
      await traceLogger?.append({
        kind: "blueprint.repaired",
        pipeline: "creative_blueprint",
        status: "ok",
        provider: provider.provider,
        model: provider.model,
        meta: {
          output: repairedOutput,
          parsedOutputStatus: "repaired"
        }
      });
      return {
        provider: "ark",
        creativeBlueprint,
        trace: {
          promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
          model: provider.model,
          textProvider: provider.provider,
          imageReferenceMode: traceImageReferenceMode,
          rawOutputSummary: summarizeRawOutput(repairedOutput),
          parsedOutputStatus: "repaired",
          repairAttempts: 1,
          fallbackUsed: false
        }
      };
    } catch (repairError) {
      const error = repairError instanceof Error ? repairError : firstError;
      await traceLogger?.append({
        kind: allowDeterministicFallback
          ? "blueprint.fallback_used"
          : "blueprint.repair_failed",
        pipeline: "creative_blueprint",
        status: "error",
        provider: provider.provider,
        model: provider.model,
        meta: {
          output: rawOutput,
          error: error instanceof Error ? error.message : "Unknown model failure",
          deterministicFallbackAllowed: allowDeterministicFallback
        }
      });
      if (!allowDeterministicFallback) {
        throw new Error(
          `Creative blueprint repair failed in real-provider mode: ${
            error instanceof Error ? error.message : "Unknown model failure"
          }`
        );
      }
      return deterministicFallbackResult(
        input,
        provider.model,
        1,
        error instanceof Error ? error.message : "Unknown model failure",
        getTextOnlyFallbackImageMode(imageInput),
        rawOutput
      );
    }
  }
}

export async function generateCreativeBlueprintWithArk(
  input: CreateCreativeBlueprintRequest,
  options: GenerateCreativeBlueprintOptions = {}
): Promise<GenerateCreativeBlueprintResult> {
  const prompt = buildCreativeBlueprintPrompt(input);
  const createModelCall = options.createTextModelCall ?? createArkTextModelCall;
  const env = options.env ?? process.env;
  const allowDeterministicFallback = !isRealProviderMode(env);

  if (options.callTextModel) {
    const provider: TextProviderConfig = {
      provider: "ark",
      apiKey: options.apiKey ?? "test-api-key",
      model: options.model ?? "test-model",
      baseURL: options.baseURL ?? "https://example.test/v1"
    };
    return runTextProvider(
      input,
      provider,
      options.callTextModel,
      prompt,
      options.imageInput,
      options.traceLogger,
      allowDeterministicFallback
    );
  }

  const arkProvider = resolveArkTextProviderConfig(env, {
    apiKey: options.apiKey,
    model: options.model,
    baseURL: options.baseURL
  });

  if (!arkProvider) {
    if (isRealProviderMode(env)) {
      throw new Error(
        "real-provider mode requires Ark text config: ARK_API_KEY, ARK_BASE_URL, and ARK_TEXT_ENDPOINT_ID"
      );
    }

    return deterministicFallbackResult(
      input,
      "unconfigured",
      0,
      "Ark text provider is not configured",
      getTextOnlyFallbackImageMode(options.imageInput)
    );
  }

  try {
    return await runTextProvider(
      input,
      arkProvider,
      createModelCall(arkProvider),
      prompt,
      options.imageInput,
      options.traceLogger,
      allowDeterministicFallback
    );
  } catch (arkError) {
    if (isRealProviderMode(env)) {
      throw arkError;
    }

    const error = arkError instanceof Error ? arkError : undefined;
    return deterministicFallbackResult(
      input,
      arkProvider.model,
      0,
      error?.message ?? "Ark text provider failed before returning output",
      getTextOnlyFallbackImageMode(options.imageInput)
    );
  }
}
