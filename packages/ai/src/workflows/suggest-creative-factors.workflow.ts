import { z } from "zod";
import {
  DEFAULT_CREATIVE_FACTORS,
  creativeFactorsSchema
} from "@aigc-video/shared";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv
} from "../providers/provider-config.js";
import {
  generateResponsesTextWithArk,
  type ArkResponsesTextProviderOptions
} from "../providers/ark-text.provider.js";
import { buildSuggestCreativeFactorsResponseFormat } from "../contracts/response-formats.js";

export const suggestCreativeFactorsResultSchema = z.object({
  summary: z.string().min(1),
  recommendedFactors: creativeFactorsSchema,
  confidence: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string())
});

export type SuggestCreativeFactorsResult = z.infer<
  typeof suggestCreativeFactorsResultSchema
>;

export interface SuggestCreativeFactorsImageInput {
  ref: string;
  url: string;
  mode: "data_url";
  detail: "high";
}

export interface SuggestCreativeFactorsInput {
  imageInputs: SuggestCreativeFactorsImageInput[];
}

export interface SuggestCreativeFactorsOptions {
  env?: ProviderEnv;
  createClient?: ArkResponsesTextProviderOptions["createClient"];
}

const systemPrompt = `你是电商视频创作的智能顾问。根据用户上传的商品素材图片，推断最适合的全局创作因子。

分析规则：
- productCategory：从图片可见的商品外观、包装、材质和使用场景推断一级类目
- dealType：从商品属性推断成交决策类型（标品/非标品/冲动/复购/高客单）
- audience：从商品定位和使用场景推断主要目标人群
- strategy：从商品特点推断最适合的推销手法

无法确定某个因子时，选择最可能的选项，并在 reasons 中说明不确定性。
只返回 JSON，不要包含 Markdown。`;

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (match?.[1]) return JSON.parse(match[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("SUGGEST_FACTORS_INVALID_JSON");
}

async function analyzeWithProvider(
  input: SuggestCreativeFactorsInput,
  env: ProviderEnv,
  options: SuggestCreativeFactorsOptions
): Promise<SuggestCreativeFactorsResult> {
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    throw new Error(
      "Suggest creative factors requires text provider config: TEXT_API_KEY/TEXT_BASE_URL/TEXT_ENDPOINT_ID"
    );
  }

  const responseFormat = buildSuggestCreativeFactorsResponseFormat(
    "suggest-creative-factors.2026-06-08"
  );

  const imageContent = input.imageInputs.map((img) => ({
    type: "input_image" as const,
    image_url: img.url,
    detail: img.detail
  }));

  const response = await generateResponsesTextWithArk(
    {
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: systemPrompt },
            ...imageContent
          ]
        }
      ],
      temperature: 0.2
    },
    config,
    { createClient: options.createClient, responseFormat }
  );

  return suggestCreativeFactorsResultSchema.parse(parseJsonObject(response.output));
}

function deterministicResult(): SuggestCreativeFactorsResult {
  return {
    summary: "已扫描上传素材，以下为基于商品特征的推荐因子，可根据实际情况调整。",
    recommendedFactors: {
      productCategory: DEFAULT_CREATIVE_FACTORS.productCategory,
      dealType: DEFAULT_CREATIVE_FACTORS.dealType,
      audience: DEFAULT_CREATIVE_FACTORS.audience,
      strategy: DEFAULT_CREATIVE_FACTORS.strategy
    },
    confidence: "medium",
    reasons: ["Mock 模式下使用默认因子，请切换 real 模式获取 AI 推荐。"]
  };
}

export async function suggestCreativeFactors(
  input: SuggestCreativeFactorsInput,
  options: SuggestCreativeFactorsOptions = {}
): Promise<SuggestCreativeFactorsResult> {
  const env = options.env ?? process.env;
  if (isRealProviderMode(env) && input.imageInputs.length > 0) {
    return analyzeWithProvider(input, env, options);
  }
  return deterministicResult();
}
