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

export type TextModelCall = (prompt: string) => Promise<string>;

export interface CreativeBlueprintTrace {
  promptVersion: string;
  model: string;
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

function createOpenAITextModelCall(
  options: GenerateCreativeBlueprintOptions
): TextModelCall | null {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model =
    options.model ?? process.env.OPENAI_MODEL ?? process.env.ARK_TEXT_ENDPOINT_ID;

  if (!apiKey || !model) {
    return null;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL ?? process.env.OPENAI_BASE_URL
  });

  return async (prompt) => {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.7),
      top_p: Number(process.env.OPENAI_TOP_P ?? 0.9)
    });

    return response.choices[0]?.message.content ?? "";
  };
}

export async function generateCreativeBlueprintWithArk(
  input: CreateCreativeBlueprintRequest,
  options: GenerateCreativeBlueprintOptions = {}
): Promise<GenerateCreativeBlueprintResult> {
  const model =
    options.model ?? process.env.OPENAI_MODEL ?? process.env.ARK_TEXT_ENDPOINT_ID ?? "unconfigured";
  const callTextModel =
    options.callTextModel ?? createOpenAITextModelCall({ ...options, model });

  if (!callTextModel) {
    return {
      provider: "fallback",
      creativeBlueprint: buildFallbackCreativeBlueprint(input),
      trace: {
        promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
        model,
        parsedOutputStatus: "fallback",
        repairAttempts: 0,
        fallbackUsed: true,
        failureReason: "OpenAI-compatible text model is not configured"
      }
    };
  }

  const prompt = buildCreativeBlueprintPrompt(input);
  let rawOutput = "";

  try {
    rawOutput = await callTextModel(prompt);
    return {
      provider: "ark",
      creativeBlueprint: parseCreativeBlueprint(rawOutput),
      trace: {
        promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
        model,
        rawOutputSummary: summarizeRawOutput(rawOutput),
        parsedOutputStatus: "valid",
        repairAttempts: 0,
        fallbackUsed: false
      }
    };
  } catch (firstError) {
    try {
      const repairedOutput = await callTextModel(
        buildCreativeBlueprintRepairPrompt(rawOutput)
      );
      return {
        provider: "ark",
        creativeBlueprint: parseCreativeBlueprint(repairedOutput),
        trace: {
          promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
          model,
          rawOutputSummary: summarizeRawOutput(repairedOutput),
          parsedOutputStatus: "repaired",
          repairAttempts: 1,
          fallbackUsed: false
        }
      };
    } catch (repairError) {
      const error = repairError instanceof Error ? repairError : firstError;
      return {
        provider: "fallback",
        creativeBlueprint: buildFallbackCreativeBlueprint(input),
        trace: {
          promptVersion: CREATIVE_BLUEPRINT_PROMPT_VERSION,
          model,
          rawOutputSummary: rawOutput
            ? summarizeRawOutput(rawOutput)
            : undefined,
          parsedOutputStatus: "fallback",
          repairAttempts: 1,
          fallbackUsed: true,
          failureReason: error instanceof Error ? error.message : "Unknown model failure"
        }
      };
    }
  }
}
