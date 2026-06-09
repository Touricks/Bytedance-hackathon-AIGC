import OpenAI from "openai";
import type { TextProviderConfig } from "./provider-config.js";
import { runWithProviderSlot } from "../concurrency/provider-concurrency.js";
import {
  redactTraceValue,
  type FileTraceLogger,
  type TracePipeline
} from "../trace/trace-log.js";

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

interface ResponsesCreateResponse {
  status?: "completed" | "failed" | "in_progress" | "incomplete" | string;
  output_text?: string | null;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string | null;
  } | null;
}

export interface OpenAICompatibleResponsesClient {
  responses: {
    create(request: unknown): Promise<ResponsesCreateResponse>;
  };
}

export interface ArkResponsesTextProviderRequest {
  input: unknown;
  temperature?: number;
}

export interface ArkResponsesTextProviderOptions {
  createClient?: (config: TextProviderConfig) => OpenAICompatibleResponsesClient;
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

function createOpenAICompatibleResponsesClient(
  config: TextProviderConfig
): OpenAICompatibleResponsesClient {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  }) as unknown as OpenAICompatibleResponsesClient;
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

function responseText(response: ResponsesCreateResponse) {
  // The Ark text endpoint is a reasoning model: the response carries a `reasoning`
  // output item alongside the assistant `message`. Read the structured JSON directly
  // from the message item and never from reasoning/tool items. The top-level
  // `output_text` "May be null" (see docs/reference/response/POST.md), so it is only a
  // fallback for short-output responses.
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (item.type && item.type !== "message") continue;
    const content = Array.isArray(item.content) ? item.content : [];
    const text = content.map((part) => part.text ?? "").join("");
    if (text) return text;
  }
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
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
  let response: ResponsesCreateResponse;
  try {
    response = await client.responses.create({
      model: config.model,
      input: request.input,
      temperature: request.temperature ?? 0.2,
      ...(options.responseFormat
        ? { text: toArkResponsesText(options.responseFormat) }
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
  assertCompletedResponse(response);
  const output = responseText(response);
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

export async function generateResponsesTextWithArk(
  request: ArkResponsesTextProviderRequest,
  config: TextProviderConfig,
  options: ArkResponsesTextProviderOptions = {}
): Promise<ArkTextProviderResult> {
  return runWithProviderSlot("text", () =>
    generateResponsesTextWithArkInner(request, config, options)
  );
}
