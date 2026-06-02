import { z } from "zod";
import OpenAI from "openai";
import {
  isRealProviderMode,
  resolveTextProviderConfig,
  type ProviderEnv,
} from "../providers/provider-config.js";
import { runWithProviderSlot } from "../concurrency/provider-concurrency.js";

export const referenceVideoRequirementsDraftSchema = z.object({
  image: z.record(z.unknown()).optional(),
  script: z.record(z.unknown()).optional(),
  storyboard: z.record(z.unknown()).optional(),
  shotImage: z.record(z.unknown()).optional(),
  shotVideo: z.record(z.unknown()).optional(),
});

export const referenceVideoRequirementsAnalysisSchema = z.object({
  summary: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  detectedBeats: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
});

export const referenceVideoRequirementsResultSchema = z.object({
  draft: referenceVideoRequirementsDraftSchema,
  analysis: referenceVideoRequirementsAnalysisSchema,
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
}

const outputInstructions = `
返回严格 JSON object，不要包含 Markdown。
只抽取参考视频的剧本结构、节奏、镜头组织、画面风格和表达方式。
不要复刻具体品牌、人物、商标、完整文案或可识别版权表达。
不要把参考视频当作后续可复用素材。
不要生成具体 storyboard shots 或 provider prompt。
输出字段：
{
  "draft": {
    "image": { "style": string, "composition": string, "avoid": string[] },
    "script": { "tone": string, "structure": string },
    "storyboard": { "rhythm": string, "beats": string[] },
    "shotImage": { "global": string },
    "shotVideo": { "global": string }
  },
  "analysis": {
    "summary": string,
    "confidence": "low" | "medium" | "high",
    "detectedBeats": string[],
    "risks": string[]
  }
}
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

function responseText(response: unknown) {
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  return "";
}

async function analyzeWithProvider(
  input: AnalyzeReferenceVideoRequirementsInput,
  env: ProviderEnv,
): Promise<ReferenceVideoRequirementsResult> {
  const config = resolveTextProviderConfig(env);
  if (!config) {
    throw new Error(
      "Reference video analysis requires text provider config: TEXT_API_KEY/TEXT_BASE_URL/TEXT_ENDPOINT_ID or ARK_API_KEY/ARK_BASE_URL/ARK_TEXT_ENDPOINT_ID",
    );
  }
  if (!input.videoUrl) {
    throw new Error("Reference video analysis requires a video URL or data URL");
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  const response = await runWithProviderSlot("text", () =>
    client.responses.create({
      model: config.endpointId,
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
                `大小：${input.sizeBytes} bytes`,
              ].join("\n"),
            },
            {
              type: "input_video",
              video_url: input.videoUrl,
              fps: 0.5,
            },
          ],
        },
      ],
      temperature: 0.2,
    } as never),
  );
  return referenceVideoRequirementsResultSchema.parse(
    parseJsonObject(responseText(response)),
  );
}

function deterministicReferenceVideoRequirements(
  input: AnalyzeReferenceVideoRequirementsInput,
) {
  const label = input.filename ? `「${input.filename}」` : "参考视频";
  return referenceVideoRequirementsResultSchema.parse({
    draft: {
      image: {
        style: "真实电商产品摄影，画面清爽可信",
        composition: "主体稳定，避免杂乱道具抢占画面",
        avoid: ["文字贴片", "商品变形", "环境漂移"],
      },
      script: {
        tone: "直接、可信、卖点清晰",
        structure: "开场痛点引入，中段卖点证明，结尾行动引导",
      },
      storyboard: {
        rhythm: "开场快，卖点集中，证明充分，结尾明确",
        beats: ["吸引注意", "展示核心卖点", "使用场景证明", "行动引导"],
      },
      shotImage: {
        global: "分镜图保持主体和场景连续，产品身份清晰",
      },
      shotVideo: {
        global: "镜头运动平滑，前后镜头保持空间连续",
      },
    },
    analysis: {
      summary: `${label}已解析为快节奏卖点证明结构：先吸引注意，再展示卖点与使用场景，最后给出行动引导。`,
      confidence: "medium",
      detectedBeats: ["吸引注意", "展示核心卖点", "使用场景证明", "行动引导"],
      risks:
        input.contentType.startsWith("video/")
          ? []
          : ["参考文件类型不是标准 video/*，请确认来源文件可播放"],
    },
  });
}

export async function analyzeReferenceVideoRequirements(
  input: AnalyzeReferenceVideoRequirementsInput,
  options: AnalyzeReferenceVideoRequirementsOptions = {},
): Promise<ReferenceVideoRequirementsResult> {
  const env = options.env ?? process.env;
  if (isRealProviderMode(env)) {
    return analyzeWithProvider(input, env);
  }
  return deterministicReferenceVideoRequirements(input);
}
