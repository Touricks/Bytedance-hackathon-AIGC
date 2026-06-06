import { z } from "zod";
import { DEFAULT_CREATIVE_FACTORS, creativeFactorsSchema } from "@aigc-video/shared";
import {
  isRealProviderMode,
  resolveArkTextProviderConfig,
  type ProviderEnv
} from "../providers/provider-config.js";
import {
  generateResponsesTextWithArk,
  type ArkResponsesTextProviderOptions
} from "../providers/ark-text.provider.js";
import { buildReferenceVideoRequirementsResponseFormat } from "../contracts/response-formats.js";

export const referenceVideoRequirementsAnalysisSchema = z.object({
  summary: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  detectedBeats: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional()
});

export const referenceVideoCreativeFactorsRecommendationSchema = z.object({
  recommendedFactors: creativeFactorsSchema,
  confidence: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string()).optional()
});

export const referenceVideoRequirementsResultSchema = z.object({
  analysis: referenceVideoRequirementsAnalysisSchema,
  creativeFactorsRecommendation: referenceVideoCreativeFactorsRecommendationSchema
});

export type ReferenceVideoRequirementsResult = z.infer<
  typeof referenceVideoRequirementsResultSchema
>;

export interface AnalyzeReferenceVideoRequirementsInput {
  filename?: string;
  contentType: string;
  sizeBytes: number;
  videoUrl?: string;
}

export interface AnalyzeReferenceVideoRequirementsOptions {
  env?: ProviderEnv;
  createClient?: ArkResponsesTextProviderOptions["createClient"];
}

const outputInstructions = `
只抽取参考视频的剧本结构、节奏、镜头组织、画面风格和表达方式。
不要复刻具体品牌、人物、商标、完整文案或可识别版权表达。
不要把参考视频当作后续可复用素材。
不要生成具体 storyboard shots 或 provider prompt。
不要生成创作要求 draft 字段；只返回 analysis 和 creativeFactorsRecommendation。
按 Responses API text.format.json_schema 返回，不要包含 Markdown。
`;

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (match?.[1]) {
    return JSON.parse(match[1]);
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("REFERENCE_VIDEO_ANALYSIS_INVALID_JSON");
}

async function analyzeWithProvider(
  input: AnalyzeReferenceVideoRequirementsInput,
  env: ProviderEnv,
  options: AnalyzeReferenceVideoRequirementsOptions
): Promise<ReferenceVideoRequirementsResult> {
  const config = resolveArkTextProviderConfig(env);
  if (!config) {
    throw new Error(
      "Reference video analysis requires text provider config: TEXT_API_KEY/TEXT_BASE_URL/TEXT_ENDPOINT_ID or ARK_API_KEY/ARK_BASE_URL/ARK_TEXT_ENDPOINT_ID"
    );
  }
  if (!input.videoUrl) {
    throw new Error("Reference video analysis requires a video URL or data URL");
  }
  const responseFormat = buildReferenceVideoRequirementsResponseFormat(
    "reference-video-requirements.v1"
  );

  const response = await generateResponsesTextWithArk(
    {
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                outputInstructions,
                `文件名：${input.filename ?? "reference-video"}`,
                `内容类型：${input.contentType}`,
                `大小：${input.sizeBytes} bytes`
              ].join("\n")
            },
            {
              type: "input_video",
              video_url: input.videoUrl,
              fps: 0.5
            }
          ]
        }
      ],
      temperature: 0.2
    },
    config,
    {
      createClient: options.createClient,
      responseFormat
    }
  );
  return referenceVideoRequirementsResultSchema.parse(parseJsonObject(response.output));
}

function deterministicReferenceVideoRequirements(
  input: AnalyzeReferenceVideoRequirementsInput
) {
  const label = input.filename ? `「${input.filename}」` : "参考视频";
  return referenceVideoRequirementsResultSchema.parse({
    analysis: {
      summary: `${label}已解析为快节奏卖点证明结构：先吸引注意，再展示卖点与使用场景，最后给出行动引导。`,
      confidence: "medium",
      detectedBeats: ["吸引注意", "展示核心卖点", "使用场景证明", "行动引导"],
      risks: input.contentType.startsWith("video/")
        ? []
        : ["参考文件类型不是标准 video/*，请确认来源文件可播放"]
    },
    creativeFactorsRecommendation: {
      recommendedFactors: DEFAULT_CREATIVE_FACTORS,
      confidence: "medium",
      reasons: [
        "参考视频呈现通用商品演示结构，适合先按耐用品、青年用户和场景演示策略导入。"
      ]
    }
  });
}

export async function analyzeReferenceVideoRequirements(
  input: AnalyzeReferenceVideoRequirementsInput,
  options: AnalyzeReferenceVideoRequirementsOptions = {}
): Promise<ReferenceVideoRequirementsResult> {
  const env = options.env ?? process.env;
  if (isRealProviderMode(env)) {
    return analyzeWithProvider(input, env, options);
  }
  return deterministicReferenceVideoRequirements(input);
}
