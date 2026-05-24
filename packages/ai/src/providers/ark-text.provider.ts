import OpenAI from "openai";
import type { TextProviderConfig } from "./provider-config.js";
import {
  redactTraceValue,
  type FileTraceLogger,
  type TracePipeline
} from "../trace/trace-log.js";

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "low" | "high";
  };
}

export type TextProviderContent = string | Array<TextContentPart | ImageContentPart>;

export interface ArkTextProviderRequest {
  prompt: string;
  content: TextProviderContent;
}

export interface ArkTextProviderResult {
  provider: TextProviderConfig["provider"];
  model: string;
  output: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content?: string | null;
    };
  }>;
}

export interface OpenAICompatibleTextClient {
  chat: {
    completions: {
      create(request: unknown): Promise<ChatCompletionResponse>;
    };
  };
}

export interface ArkTextProviderOptions {
  createClient?: (config: TextProviderConfig) => OpenAICompatibleTextClient;
  temperature?: number;
  topP?: number;
  traceLogger?: Pick<FileTraceLogger, "append">;
  trace?: {
    pipeline: TracePipeline;
    meta?: Record<string, unknown>;
  };
  clock?: () => number;
}

function createOpenAICompatibleClient(
  config: TextProviderConfig
): OpenAICompatibleTextClient {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
}

export async function generateTextWithArk(
  request: ArkTextProviderRequest,
  config: TextProviderConfig,
  options: ArkTextProviderOptions = {}
): Promise<ArkTextProviderResult> {
  const client = (options.createClient ?? createOpenAICompatibleClient)(config);
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  await options.traceLogger?.append({
    kind: "provider.request_started",
    pipeline: options.trace?.pipeline ?? "creative_blueprint",
    status: "ok",
    provider: config.provider,
    model: config.model,
    meta: {
      endpointFamily: config.provider === "ark" ? "ark_openai_compatible" : "openai",
      baseURL: config.baseURL,
      ...options.trace?.meta
    }
  });
  let response: ChatCompletionResponse;
  try {
    response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: request.content }],
      temperature: options.temperature ?? Number(process.env.OPENAI_TEMPERATURE ?? 0.7),
      top_p: options.topP ?? Number(process.env.OPENAI_TOP_P ?? 0.9)
    });
  } catch (error) {
    await options.traceLogger?.append({
      kind: "provider.failed",
      pipeline: options.trace?.pipeline ?? "creative_blueprint",
      status: "error",
      provider: config.provider,
      model: config.model,
      meta: {
        error: String(
          redactTraceValue(
            error instanceof Error ? error.message : "Unknown provider failure"
          )
        )
      }
    });
    throw error;
  }

  const output = response.choices[0]?.message.content ?? "";
  await options.traceLogger?.append({
    kind: "provider.response_received",
    pipeline: options.trace?.pipeline ?? "creative_blueprint",
    status: "ok",
    provider: config.provider,
    model: config.model,
    latencyMs: clock() - startedAt,
    meta: {
      output
    }
  });

  return {
    provider: config.provider,
    model: config.model,
    output
  };
}
