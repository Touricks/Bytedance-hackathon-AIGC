import OpenAI from "openai";
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
  isProviderAuthOrConfigError,
  isRealProviderMode,
  resolveArkTextProviderConfig,
  resolveFallbackTextProviderConfig,
  type ProviderEnv,
  type TextProviderConfig
} from "../providers/provider-config.js";

export type TextModelCall = (prompt: string) => Promise<string>;
export type CreateTextModelCall = (config: TextProviderConfig) => TextModelCall;

export interface CreativeBlueprintTrace {
  promptVersion: string;
  model: string;
  textProvider: "ark" | "fallback-llm" | "deterministic";
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
}

function summarizeRawOutput(rawOutput: string) {
  return rawOutput.replace(/\s+/g, " ").slice(0, 240);
}

function parseCreativeBlueprint(rawOutput: string): CreativeBlueprint {
  return creativeBlueprintSchema.parse(JSON.parse(rawOutput));
}

function buildFallbackCreativeBlueprint(
  input: CreateCreativeBlueprintRequest
): CreativeBlueprint {
  return creativeBlueprintSchema.parse({
    narrative: `${input.title} 的 12 秒带货短视频：先用干净商品 hero 镜头建立信任，再突出 ${input.sellingPoints}，最后回到购买暗示。`,
    visualStyle: input.stylePreference,
    targetAudience: input.audience,
    coreSellingPoint: input.sellingPoints,
    shots: [
      {
        index: 1,
        durationSec: 3,
        purpose: "hook",
        visualPrompt: `Clean hero shot of ${input.title}, centered and well lit`,
        cameraMotion: "slow push in",
        voiceover: `${input.title}，第一眼就能抓住注意力。`,
        subtitle: "第一眼就被吸引"
      },
      {
        index: 2,
        durationSec: 5,
        purpose: "benefit",
        visualPrompt: `Simple product detail or use-context shot showing ${input.sellingPoints}`,
        cameraMotion: "smooth stable pan",
        voiceover: `核心卖点是：${input.sellingPoints}`,
        subtitle: input.sellingPoints
      },
      {
        index: 3,
        durationSec: 4,
        purpose: "cta",
        visualPrompt: `Polished closing hero shot for ${input.audience}`,
        cameraMotion: "gentle pull back",
        voiceover: `适合${input.audience}，现在就试试。`,
        subtitle: "现在就试试"
      }
    ],
    renderBrief: {
      productConsistencyRules: [
        "Use the uploaded product image as the visual source of truth",
        "Keep product shape, color, material, logo, and packaging consistent"
      ],
      avoid: [
        "Do not invent new product parts",
        "Do not add extra brands or readable text"
      ],
      videoPromptSummary: `12-second ${input.stylePreference} ecommerce product showcase for ${input.title}`
    },
    improvementHints: [
      {
        ifVideoLooksBad: "商品不像原图",
        suggestedUserAction:
          "上传更清晰的正面商品图，或减少风格偏好中的复杂场景词。",
        fieldsToChange: ["productImage", "stylePreference"]
      }
    ]
  });
}

function createOpenAITextModelCall(config: TextProviderConfig): TextModelCall {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });

  return async (prompt) => {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.7),
      top_p: Number(process.env.OPENAI_TOP_P ?? 0.9)
    });

    return response.choices[0]?.message.content ?? "";
  };
}

function deterministicFallbackResult(
  input: CreateCreativeBlueprintRequest,
  model: string,
  repairAttempts: number,
  failureReason: string,
  rawOutput?: string
): GenerateCreativeBlueprintResult {
  return {
    provider: "fallback",
    creativeBlueprint: buildFallbackCreativeBlueprint(input),
    trace: {
      promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
      model,
      textProvider: "deterministic",
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
  prompt: string
): Promise<GenerateCreativeBlueprintResult> {
  let rawOutput = "";

  try {
    rawOutput = await callTextModel(prompt);
    return {
      provider: provider.provider === "ark" ? "ark" : "fallback",
      creativeBlueprint: parseCreativeBlueprint(rawOutput),
      trace: {
        promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
        model: provider.model,
        textProvider: provider.provider,
        rawOutputSummary: summarizeRawOutput(rawOutput),
        parsedOutputStatus: "valid",
        repairAttempts: 0,
        fallbackUsed: provider.provider === "fallback-llm"
      }
    };
  } catch (firstError) {
    if (!rawOutput) {
      throw firstError;
    }

    try {
      const repairedOutput = await callTextModel(
        buildCreativeBlueprintRepairPrompt(rawOutput)
      );
      return {
        provider: provider.provider === "ark" ? "ark" : "fallback",
        creativeBlueprint: parseCreativeBlueprint(repairedOutput),
        trace: {
          promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
          model: provider.model,
          textProvider: provider.provider,
          rawOutputSummary: summarizeRawOutput(repairedOutput),
          parsedOutputStatus: "repaired",
          repairAttempts: 1,
          fallbackUsed: provider.provider === "fallback-llm"
        }
      };
    } catch (repairError) {
      const error = repairError instanceof Error ? repairError : firstError;
      return deterministicFallbackResult(
        input,
        provider.model,
        1,
        error instanceof Error ? error.message : "Unknown model failure",
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
  const createModelCall = options.createTextModelCall ?? createOpenAITextModelCall;

  if (options.callTextModel) {
    const provider: TextProviderConfig = {
      provider: "ark",
      apiKey: options.apiKey ?? "test-api-key",
      model: options.model ?? "test-model",
      baseURL: options.baseURL ?? "https://example.test/v1"
    };
    return runTextProvider(input, provider, options.callTextModel, prompt);
  }

  const env = options.env ?? process.env;
  const arkProvider = resolveArkTextProviderConfig(env, {
    apiKey: options.apiKey,
    model: options.model,
    baseURL: options.baseURL
  });
  const fallbackProvider = resolveFallbackTextProviderConfig(env);

  if (!arkProvider) {
    if (fallbackProvider) {
      return runTextProvider(
        input,
        fallbackProvider,
        createModelCall(fallbackProvider),
        prompt
      );
    }

    if (isRealProviderMode(env)) {
      throw new Error(
        "real-provider mode requires Ark text config: ARK_API_KEY and ARK_TEXT_ENDPOINT_ID"
      );
    }

    return deterministicFallbackResult(
      input,
      "unconfigured",
      0,
      "Ark text provider and fallback LLM are not configured"
    );
  }

  try {
    return await runTextProvider(
      input,
      arkProvider,
      createModelCall(arkProvider),
      prompt
    );
  } catch (arkError) {
    if (fallbackProvider && isProviderAuthOrConfigError(arkError)) {
      try {
        return await runTextProvider(
          input,
          fallbackProvider,
          createModelCall(fallbackProvider),
          prompt
        );
      } catch (fallbackError) {
        const error =
          fallbackError instanceof Error ? fallbackError : arkError;
        return deterministicFallbackResult(
          input,
          fallbackProvider.model,
          0,
          error instanceof Error ? error.message : "Unknown fallback LLM failure"
        );
      }
    }

    if (isRealProviderMode(env) && isProviderAuthOrConfigError(arkError)) {
      throw arkError;
    }

    const error = arkError instanceof Error ? arkError : undefined;
    return deterministicFallbackResult(
      input,
      arkProvider.model,
      0,
      error?.message ?? "Ark text provider failed before returning output"
    );
  }
}
