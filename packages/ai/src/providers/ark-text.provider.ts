import OpenAI from "openai";
import type { TextProviderConfig } from "./provider-config.js";
import { runWithProviderSlot } from "../concurrency/provider-concurrency.js";
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

export interface ArkJsonSchemaResponseFormat {
  type: "json_schema";
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  strict?: boolean;
  schemaVersion?: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content?: string | null;
    };
  }>;
}

interface ResponsesCreateResponse {
  status?: "completed" | "failed" | "in_progress" | "incomplete" | string;
  output_text?: string | null;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  error?: {
    message?: string | null;
  } | null;
}

export interface OpenAICompatibleTextClient {
  chat: {
    completions: {
      create(request: unknown): Promise<ChatCompletionResponse>;
    };
  };
}

export interface OpenAICompatibleResponsesClient {
  responses: {
    create(request: unknown): Promise<ResponsesCreateResponse>;
  };
}

export interface ArkTextProviderOptions {
  createClient?: (config: TextProviderConfig) => OpenAICompatibleTextClient;
  temperature?: number;
  topP?: number;
  responseFormat?: ArkJsonSchemaResponseFormat;
  traceLogger?: Pick<FileTraceLogger, "append">;
  trace?: {
    pipeline: TracePipeline;
    contractId?: string;
    contractVersion?: string;
    meta?: Record<string, unknown>;
  };
  clock?: () => number;
}

export interface ArkResponsesTextProviderRequest {
  input: unknown;
  temperature?: number;
}

export interface ArkResponsesTextProviderOptions {
  createClient?: (config: TextProviderConfig) => OpenAICompatibleResponsesClient;
  responseFormat?: ArkJsonSchemaResponseFormat;
}

function createOpenAICompatibleClient(
  config: TextProviderConfig
): OpenAICompatibleTextClient {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
}

function createOpenAICompatibleResponsesClient(
  config: TextProviderConfig
): OpenAICompatibleResponsesClient {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  }) as unknown as OpenAICompatibleResponsesClient;
}

function toArkResponseFormat(responseFormat?: ArkJsonSchemaResponseFormat) {
  if (!responseFormat) {
    return undefined;
  }
  return {
    type: responseFormat.type,
    json_schema: {
      name: responseFormat.name,
      ...(responseFormat.description ? { description: responseFormat.description } : {}),
      strict: responseFormat.strict ?? true,
      schema: responseFormat.schema
    }
  };
}

function toArkResponsesText(responseFormat?: ArkJsonSchemaResponseFormat) {
  if (!responseFormat) {
    return undefined;
  }
  return {
    format: {
      type: responseFormat.type,
      name: responseFormat.name,
      ...(responseFormat.description ? { description: responseFormat.description } : {}),
      strict: responseFormat.strict ?? true,
      schema: responseFormat.schema
    }
  };
}

function responseFormatTraceSummary(responseFormat?: ArkJsonSchemaResponseFormat) {
  if (!responseFormat) {
    return undefined;
  }
  return {
    type: responseFormat.type,
    name: responseFormat.name,
    strict: responseFormat.strict ?? true,
    ...(responseFormat.schemaVersion
      ? { schemaVersion: responseFormat.schemaVersion }
      : {})
  };
}

async function generateTextWithArkInner(
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
    ...(options.trace?.contractId ? { contractId: options.trace.contractId } : {}),
    ...(options.trace?.contractVersion
      ? { contractVersion: options.trace.contractVersion }
      : {}),
    meta: {
      endpointFamily: "ark_openai_compatible",
      baseURL: config.baseURL,
      ...(options.responseFormat
        ? { responseFormat: responseFormatTraceSummary(options.responseFormat) }
        : {}),
      ...options.trace?.meta
    }
  });
  let response: ChatCompletionResponse;
  try {
    response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: request.content }],
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      ...(options.responseFormat
        ? { response_format: toArkResponseFormat(options.responseFormat) }
        : {})
    });
  } catch (error) {
    await options.traceLogger?.append({
      kind: "provider.failed",
      pipeline: options.trace?.pipeline ?? "creative_blueprint",
      status: "error",
      provider: config.provider,
      model: config.model,
      ...(options.trace?.contractId ? { contractId: options.trace.contractId } : {}),
      ...(options.trace?.contractVersion
        ? { contractVersion: options.trace.contractVersion }
        : {}),
      meta: {
        ...options.trace?.meta,
        ...(options.responseFormat
          ? { responseFormat: responseFormatTraceSummary(options.responseFormat) }
          : {}),
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
    ...(options.trace?.contractId ? { contractId: options.trace.contractId } : {}),
    ...(options.trace?.contractVersion
      ? { contractVersion: options.trace.contractVersion }
      : {}),
    latencyMs: clock() - startedAt,
    meta: {
      ...options.trace?.meta,
      ...(options.responseFormat
        ? { responseFormat: responseFormatTraceSummary(options.responseFormat) }
        : {}),
      output
    }
  });

  return {
    provider: config.provider,
    model: config.model,
    output
  };
}

export async function generateTextWithArk(
  request: ArkTextProviderRequest,
  config: TextProviderConfig,
  options: ArkTextProviderOptions = {}
): Promise<ArkTextProviderResult> {
  return runWithProviderSlot("text", () =>
    generateTextWithArkInner(request, config, options)
  );
}

function responseText(response: ResponsesCreateResponse) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === "string") return part.text;
    }
  }
  return "";
}

function assertCompletedResponse(response: ResponsesCreateResponse) {
  if (!response.status || response.status === "completed") {
    return;
  }
  const message = response.error?.message ?? "No error message";
  throw new Error(`Responses API returned status ${response.status}: ${message}`);
}

async function generateResponsesTextWithArkInner(
  request: ArkResponsesTextProviderRequest,
  config: TextProviderConfig,
  options: ArkResponsesTextProviderOptions = {}
): Promise<ArkTextProviderResult> {
  const client = (options.createClient ?? createOpenAICompatibleResponsesClient)(
    config
  );
  const response = await client.responses.create({
    model: config.model,
    input: request.input,
    temperature: request.temperature ?? 0.2,
    ...(options.responseFormat
      ? { text: toArkResponsesText(options.responseFormat) }
      : {})
  });
  assertCompletedResponse(response);
  return {
    provider: config.provider,
    model: config.model,
    output: responseText(response)
  };
}

export async function generateResponsesTextWithArk(
  request: ArkResponsesTextProviderRequest,
  config: TextProviderConfig,
  options: ArkResponsesTextProviderOptions = {}
): Promise<ArkTextProviderResult> {
  return runWithProviderSlot("text", () =>
    generateResponsesTextWithArkInner(request, config, options)
  );
}
